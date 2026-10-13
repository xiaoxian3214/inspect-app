import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const IGNORED_DIRECTORIES = ['node_modules', 'unpackage', 'uni_modules', '.hbuilderx', 'tests', 'docs', 'scripts']

const NON_BOOLEAN_LOGICAL_PATTERNS = [
  [/String\([^()\n]*\|\|/, 'String(... || ...)'],
  [/Number\([^()\n]*\|\|/, 'Number(... || ...)'],
  [/\?\.[A-Za-z_$][\w$]*\s*\|\|/, '可选链属性后的 || 回退'],
  [/\|\|\s*(?:['"]|\[\]|\{\}|0(?![.\d]))/, '非布尔字面量 || 回退'],
  [/\.filter\(Boolean\)/, '.filter(Boolean)'],
]

const UNSUPPORTED_CSS_PATTERNS = [
  [/\d(?:\.\d+)?vh\b/, 'vh 视口单位'],
  [/env\(/, 'env() 函数'],
  [/calc\([^;{}]*var\(/, 'calc() 与 var() 组合'],
  [/display\s*:\s*block\b/, 'display: block'],
  [/align-items\s*:\s*baseline\b/, 'align-items: baseline'],
  [/aspect-ratio\s*:/, 'aspect-ratio'],
]

/**
 * 递归收集目录下指定后缀的源码文件，跳过依赖、构建产物与文档目录。
 * @param {string} directory 起始目录
 * @param {string[]} extensions 允许的文件后缀（含点号）
 * @returns {Promise<string[]>} 命中文件的路径列表
 */
async function collectSourceFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.includes(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectSourceFiles(target, extensions))
    else if (extensions.some((extension) => target.endsWith(extension))) files.push(target)
  }
  return files
}

/**
 * 剥离源码中的行注释与块注释并保留字符串字面量，避免注释中的示例代码造成误报。
 * @param {string} source 原始源码
 * @returns {string} 剥离注释后的源码
 */
function stripComments(source) {
  let result = ''
  let index = 0
  const length = source.length
  while (index < length) {
    const character = source[index]
    const next = source[index + 1]
    if (character === '/' && next === '/') {
      while (index < length && source[index] !== '\n') index += 1
    } else if (character === '/' && next === '*') {
      index += 2
      while (index < length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
    } else if (character === '"' || character === "'" || character === '`') {
      const quote = character
      result += character
      index += 1
      while (index < length) {
        if (source[index] === '\\') {
          result += source[index] + (source[index + 1] ?? '')
          index += 2
          continue
        }
        result += source[index]
        if (source[index] === quote) {
          index += 1
          break
        }
        index += 1
      }
    } else {
      result += character
      index += 1
    }
  }
  return result
}

/**
 * 校验 uvue 文件的样式块中是否包含 uni-app x 编译器不支持的 CSS 值。
 * @param {string} source uvue 文件源码
 * @returns {string[]} 去重后的不支持值描述列表
 */
function findUnsupportedCssValues(source) {
  const failures = []
  for (const block of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = stripComments(block[1])
    for (const [pattern, label] of UNSUPPORTED_CSS_PATTERNS) {
      if (pattern.test(css)) failures.push(label)
    }
  }
  return [...new Set(failures)]
}

test('application sources avoid non-boolean logical fallbacks rejected by UTS', async () => {
  const files = await collectSourceFiles('.', ['.uvue', '.uts'])
  const failures = []
  for (const file of files) {
    const source = stripComments(await readFile(file, 'utf8'))
    for (const [pattern, label] of NON_BOOLEAN_LOGICAL_PATTERNS) {
      if (pattern.test(source)) failures.push(`${file}: ${label}`)
    }
  }
  assert.deepEqual(failures, [])
})

test('application uvue styles avoid css values unsupported by uni-app x', async () => {
  const files = await collectSourceFiles('.', ['.uvue'])
  const failures = []
  for (const file of files) {
    const labels = findUnsupportedCssValues(await readFile(file, 'utf8'))
    if (labels.length > 0) failures.push(`${file}: ${labels.join(' | ')}`)
  }
  assert.deepEqual(failures, [])
})

/** 原生滚动组件的布尔属性必须使用表达式绑定，避免模板编译将字符串当成布尔值。 */
test('application scroll boolean props use boolean bindings', async () => {
  const files = await collectSourceFiles('.', ['.uvue'])
  const failures = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (/(?<!:)\b(?:scroll-x|scroll-y|show-scrollbar)="(?:true|false)"/.test(source)) failures.push(file)
  }
  assert.deepEqual(failures, [])
})
