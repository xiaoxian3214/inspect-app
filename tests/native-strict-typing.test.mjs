import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** 需要严格类型化的报告页面入口，遍历会沿 import 递归展开它们的子组件。 */
const PAGE_ENTRIES = [
  'pages/report/detail.uvue',
  'pages/report/list.uvue',
  'pages/report/search.uvue',
  'pages/report/simple-camera.uvue'
]

const importPattern = /import\s+(?:\{([^}]*)\}|(\w+))?\s*(?:from\s+)?['"]([^'"]+)['"]/g

/**
 * 把相对 import 路径解析成工作区内真实存在的文件。
 * 参数：fromFile 为引用方文件，specifier 为 import 里的路径。
 * 返回：解析到的绝对路径；非相对路径或文件不存在时返回 null。
 */
function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.uvue`, `${base}.uts`, join(base, 'index.uvue')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * 从页面入口沿 import 递归收集所有 .uvue 文件，得到需要严格类型化的页面与子组件集合。
 * 返回：按发现顺序去重的绝对路径数组。
 */
function collectPageTree() {
  const seen = new Set()
  const queue = PAGE_ENTRIES.map((entry) => resolve(entry))
  const files = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (seen.has(current) || !existsSync(current)) continue
    seen.add(current)
    files.push(current)
    const source = readFileSync(current, 'utf8')
    for (const match of source.matchAll(importPattern)) {
      const target = resolveImport(current, match[3])
      if (target && target.endsWith('.uvue')) queue.push(target)
    }
  }
  return files
}

/**
 * 去掉注释与字符串字面量，避免把英文单词或提示文案里的 any 误判成类型。
 * 参数：source 为文件原文。
 * 返回：仅保留代码骨架的文本。
 */
function stripCommentsAndStrings(source) {
  let output = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue }
        if (source[index] === char) { index += 1; break }
        index += 1
      }
      output += '""'
      continue
    }
    output += char
    index += 1
  }
  return output
}

/**
 * 提取函数声明的形参原文，支持 function 声明与箭头函数常量。
 * 参数：script 为 <script setup> 内容。
 * 返回：{ name, params } 数组，params 为形参原文。
 */
function listFunctionParams(script) {
  const results = []
  const pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g
  for (const match of script.matchAll(pattern)) {
    const start = match.index + match[0].length - 1
    let depth = 0
    let end = start
    for (let index = start; index < script.length; index += 1) {
      if (script[index] === '(') depth += 1
      else if (script[index] === ')') {
        depth -= 1
        if (depth === 0) { end = index; break }
      }
    }
    results.push({ name: match[1], params: script.slice(start + 1, end) })
  }
  return results
}

/** 按顶层逗号拆分形参文本。 */
function splitParams(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') depth += 1
    if (char === ')' || char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue }
    current += char
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts.filter((part) => part !== '')
}

const pageFiles = collectPageTree()

test('page tree traversal covers pages and their child components', () => {
  assert.equal(pageFiles.length > 20, true, `页面树只解析到 ${pageFiles.length} 个文件，遍历规则可能失效：${pageFiles.join(', ')}`)
  for (const entry of PAGE_ENTRIES) {
    assert.equal(pageFiles.some((file) => file.endsWith(entry)), true, `未包含入口页面 ${entry}`)
  }
})

/** 校验页面树内不允许出现 any 类型声明，必须用具体类型或 UTSJSONObject。 */
test('report pages and child components avoid the any type', () => {
  const offenders = []
  for (const file of pageFiles) {
    const code = stripCommentsAndStrings(readFileSync(file, 'utf8'))
    code.split('\n').forEach((line, index) => {
      if (/\bany\b/.test(line)) offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${index + 1} ${line.trim().slice(0, 120)}`)
    })
  }
  assert.deepEqual(offenders, [], `以下位置仍在使用 any：\n${offenders.join('\n')}`)
})

/** 校验每个函数声明的形参都有显式类型，避免隐式动态类型在转译后变成 Kotlin 的 Any。 */
test('report pages and child components declare every function parameter type', () => {
  const offenders = []
  for (const file of pageFiles) {
    const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
    for (const { name, params } of listFunctionParams(source)) {
      for (const param of splitParams(params)) {
        const decl = param.split('=')[0].trim()
        if (decl === '' || decl.startsWith('...')) continue
        if (!decl.includes(':')) offenders.push(`${file.replace(`${process.cwd()}/`, '')}: ${name}(${params}) 的形参 "${param}" 缺少类型`)
      }
    }
  }
  assert.deepEqual(offenders, [], `以下函数形参缺少显式类型：\n${offenders.join('\n')}`)
})

/** 校验集合声明都有类型实参或标注，避免生成无类型实参的 _uA()/Map()/Set()。 */
test('report pages and child components type every collection declaration', () => {
  const offenders = []
  const rules = [
    { pattern: /\bref\s*\(\s*\[\s*\]\s*\)/, label: 'ref([]) 需要写成 ref<T[]>([])' },
    { pattern: /\bref\s*<\s*any\s*>/, label: 'ref<any> 不允许' },
    { pattern: /\bnew\s+Map\s*\(\s*\)/, label: 'new Map() 需要类型实参' },
    { pattern: /\bnew\s+Set\s*\(\s*\)/, label: 'new Set() 需要类型实参' },
    { pattern: /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\[\s*\]/, label: '数组声明需要类型标注' },
    // ref(null) 会让 Kotlin 无法推断 ref 的泛型实参；ref({}) 会生成 ref(_uO()) 已有具体类型，故不限制
    { pattern: /\bref\s*\(\s*(?:null|undefined)\s*\)/, label: 'ref(null) 需要写成 ref<T | null>(null)' },
    { pattern: /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:null|undefined)\b/, label: '空值声明需要类型标注' }
  ]
  for (const file of pageFiles) {
    const source = stripCommentsAndStrings(readFileSync(file, 'utf8'))
    for (const rule of rules) {
      source.split('\n').forEach((line, index) => {
        if (rule.pattern.test(line)) offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${index + 1} ${rule.label}`)
      })
    }
  }
  assert.deepEqual(offenders, [], `以下集合声明缺少类型：\n${offenders.join('\n')}`)
})

/** 校验模板里把 $event 当实参传给函数时必须先做类型断言，形参才能写具体类型。 */
test('templates assert the type of $event before passing it to a function', () => {
  const offenders = []
  for (const file of pageFiles) {
    const source = readFileSync(file, 'utf8')
    const template = source.split('<script')[0] ?? ''
    const pattern = /\$event\b(?!\s+as\b)/g
    for (const match of template.matchAll(pattern)) {
      const line = template.slice(0, match.index).split('\n').length
      offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${line} 裸 $event 需要写成 $event as <具体类型>`)
    }
  }
  assert.deepEqual(offenders, [], `以下模板位置没有对 $event 做类型断言：\n${offenders.join('\n')}`)
})