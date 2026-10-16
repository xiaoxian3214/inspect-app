// 工程级严格 UTS 类型守卫。
//
// 背景：uni-app x 在 Android 端把 UTS 转译为 Kotlin。Kotlin 语法要求
// **命名/局部函数的形参必须显式标注类型**，否则 kotlinc 报
//   error: an explicit type is required on a value parameter
// 并直接中断 Android 编译；表达式位置的裸 `[]` 会生成无类型实参的 `_uA()`，
// 触发 error: not enough information to infer type argument for 'E'。
// iOS 走 uts2js 不经过 Kotlin，因此这两类写法在 iOS 上不会暴露。
//
// 本测试用源码级规则把上面两类写法钉死，避免任何一端再次引入。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXCLUDED = ['unpackage', 'node_modules', 'tests', '.git', 'dist']

/** 递归收集工程内所有 UTS/UVUE 源文件（排除构建产物与测试目录）。 */
function collectSources(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED.includes(entry)) continue
    const full = path.join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      collectSources(full, found)
    } else if (entry.endsWith('.uts') || entry.endsWith('.uvue')) {
      found.push(full)
    }
  }
  return found
}

const sources = collectSources(root)

/** 去掉注释与字符串字面量，避免规则命中文案。 */
function stripNoise(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/** 判断一个形参片段是否缺少类型标注。 */
function lacksType(part) {
  const head = part.split('=')[0].trim()
  if (head === '' || head.startsWith('*')) return false
  return !head.includes(':')
}

const FUNCTION_KEYWORD = /(?:^|\n)[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g
const ARROW_ASSIGNED = /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g

const relative = (file) => path.relative(root, file).split(path.sep).join('/')

function scanUnannotatedParams(pattern) {
  const offenders = []
  for (const file of sources) {
    const text = stripNoise(readFileSync(file, 'utf8'))
    for (const match of text.matchAll(pattern)) {
      const params = match[2].trim()
      if (params === '') continue
      const missing = params
        .split(',')
        .filter((part) => lacksType(part))
        .map((part) => part.split('=')[0].trim())
      if (missing.length > 0) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${relative(file)}:${line} ${match[1]}(${params}) → 缺少类型: ${missing.join(', ')}`)
      }
    }
  }
  return offenders
}

test('工程内命名/局部函数的形参全部标注类型（Kotlin 必需）', () => {
  const offenders = scanUnannotatedParams(FUNCTION_KEYWORD)
  assert.deepEqual(offenders, [], `以下函数的形参缺少类型标注（Android 会报 an explicit type is required on a value parameter）：\n${offenders.join('\n')}`)
})

test('赋值给变量的箭头函数形参全部标注类型', () => {
  const offenders = scanUnannotatedParams(ARROW_ASSIGNED)
  assert.deepEqual(offenders, [], `以下箭头函数的形参缺少类型标注：\n${offenders.join('\n')}`)
})

test('表达式位置不使用裸数组字面量（会生成无类型实参的 _uA()）', () => {
  const patterns = [
    /\?\?\s*\[\s*\](?!\s*as\b)/g,
    /\breturn\s+\[\s*\](?!\s*as\b)/g,
    /[(,]\s*\[\s*\]\s*[,)](?!\s*as)/g,
    /=>\s*\[\s*\](?!\s*as\b)/g,
    /[A-Za-z_$][\w$]*\s*:\s*\[\s*\]\s*[,)}](?!\s*as)/g,
    /(?:^|[;{}\n])\s*[A-Za-z_$][\w$.\[\]'"]*\s*=\s*\[\s*\](?!\s*as\b)/g,
    /\?\s*[^:\n]{0,60}:\s*\[\s*\]\s*(?:[,;)\n]|$)(?!\s*as)/g
  ]
  const offenders = []
  for (const file of sources) {
    const text = stripNoise(readFileSync(file, 'utf8'))
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${relative(file)}:${line} ${match[0].trim().replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
  }
  const unique = [...new Set(offenders)].sort()
  assert.deepEqual(unique, [], `以下裸 [] 需要写成 [] as T[]（Android 报 not enough information to infer type argument for 'E'）：\n${unique.join('\n')}`)
})

test('集合与空值声明带有显式类型', () => {
  const patterns = [
    /\bref\s*\(\s*\[\s*\]\s*\)/g,
    /\bnew\s+Map\s*\(\s*\)/g,
    /\bnew\s+Set\s*\(\s*\)/g,
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\[\s*\]/g,
    /\bref\s*\(\s*(?:null|undefined)\s*\)/g,
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:null|undefined)\b/g
  ]
  const offenders = []
  for (const file of sources) {
    const text = stripNoise(readFileSync(file, 'utf8'))
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${relative(file)}:${line} ${match[0].trim().replace(/\s+/g, ' ')}`)
      }
    }
  }
  const unique = [...new Set(offenders)].sort()
  assert.deepEqual(unique, [], `以下声明缺少显式类型：\n${unique.join('\n')}`)
})

test('扫描覆盖整个工程源码', () => {
  assert.ok(sources.length > 80, `应扫描到足够多的源文件，实际 ${sources.length}`)
  for (const expected of ['pages/report/detail.uvue', 'domain/detailViewModel.uts', 'services/planListService.uts']) {
    assert.ok(sources.some((file) => relative(file) === expected), `缺少 ${expected}`)
  }
})