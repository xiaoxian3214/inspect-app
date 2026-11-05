import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 原生 <button> 固定高度时的文字垂直居中契约。
 *
 * 背景：合并/拆分/复制等弹层底部的原生 <button> 在安卓真机上文字没有垂直居中。
 * 原因：uni-app x 的 button 默认文字行高是 2.5 倍字号（默认样式替 18px 字号预留了
 * 45px 行高）；一旦用 class 把 button 的 height 改成 88rpx 等固定值，默认行高
 * 不再等于按钮高度，行盒从内容区顶部排列，文字就整体偏上。官方提示也要求
 * “指定按钮高度后需手动调整文字行高”，所以本仓库的约定是：原生 button 只要
 * 写死 height，就必须同时写等值的 line-height（例如 .member-download、.editor-button）。
 *
 * 本测试扫描所有 uvue 文件：凡是被原生 <button> 使用、且 class 规则里写了
 * height 的，必须存在等值 line-height；否则契约失败。
 */

/** 递归收集 components 与 pages 下的 uvue 文件。 */
function collectUvueFiles() {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) walk(fullPath)
      else if (entry.name.endsWith('.uvue')) files.push(fullPath)
    }
  }
  walk('components')
  walk('pages')
  return files
}

/** 解析单个 class 选择器里出现的类名，例如 `.button.confirm.danger` → button/confirm/danger。 */
function selectorClasses(selector) {
  return Array.from(selector.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)).map((match) => match[1])
}

/** 读取 style 块并拆成规则，只保留声明里出现 height 或 line-height 的规则。 */
function parseStyleRules(style) {
  const rules = []
  for (const match of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1].trim()
    if (selector === '' || selector.startsWith('/*') || selector.startsWith('//')) continue
    const body = match[2]
    const heightMatch = body.match(/(?:^|;)\s*height\s*:\s*([^;]+)/)
    const lineHeightMatch = body.match(/(?:^|;)\s*line-height\s*:\s*([^;]+)/)
    rules.push({
      selector,
      classes: selectorClasses(selector),
      height: heightMatch === null ? '' : heightMatch[1].trim(),
      lineHeight: lineHeightMatch === null ? '' : lineHeightMatch[1].trim()
    })
  }
  return rules
}

/** 提取模板中静态 class="..." 的原生 button 类名集合。 */
function buttonClassesOf(template) {
  const classes = new Set()
  for (const match of template.matchAll(/<button\b[^>]*>/g)) {
    const classMatch = match[0].match(/\sclass="([^"]*)"/)
    if (classMatch === null) continue
    for (const name of classMatch[1].split(/\s+/)) {
      if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) classes.add(name)
    }
  }
  return classes
}

/** 找出所有固定高度原生 button 缺失等值 line-height 的违规项。 */
function collectViolations() {
  const violations = []
  for (const file of collectUvueFiles()) {
    const source = readFileSync(file, 'utf8')
    if (!source.includes('<button')) continue
    const template = source.split('</template>')[0]
    const style = source.split('<style>')[1] ?? ''
    const rules = parseStyleRules(style)
    for (const className of buttonClassesOf(template)) {
      const classRules = rules.filter((rule) => rule.classes.includes(className))
      const heightRule = classRules.find((rule) => rule.height !== '')
      if (heightRule === undefined) continue
      const lineHeightRule = classRules.find((rule) => rule.lineHeight !== '')
      if (lineHeightRule === undefined) {
        violations.push(`${file}: .${className} 设置了 height: ${heightRule.height}，但没有 line-height`)
      } else if (lineHeightRule.lineHeight !== heightRule.height) {
        violations.push(`${file}: .${className} 的 line-height: ${lineHeightRule.lineHeight} 与 height: ${heightRule.height} 不相等`)
      }
    }
  }
  return violations
}

/** 全局回归：任何固定高度的原生 button 都必须用等值 line-height 兜住文字垂直居中。 */
test('native buttons with fixed height keep line-height equal to height', () => {
  const violations = collectViolations()
  assert.deepEqual(violations, [], `以下原生 button 在安卓端文字不会垂直居中：\n${violations.join('\n')}`)
})

/** 用户报告的合并验货弹层：主/次按钮必须等值行高（88rpx 高度 + 30rpx 字号）。 */
test('merge sheet action buttons center their labels', () => {
  const source = readFileSync('components/search/MergePlanSheet.uvue', 'utf8')
  const style = source.split('<style>')[1] ?? ''
  assert.match(style, /\.action-button\s*\{[^}]*height:\s*88rpx/s)
  assert.match(style, /\.action-button\s*\{[^}]*line-height:\s*88rpx/s)
})

/** 拆分验货弹层与合并验货同构，按钮同样需要等值行高。 */
test('split sheet action buttons center their labels', () => {
  const source = readFileSync('components/search/SplitPlanSheet.uvue', 'utf8')
  const style = source.split('<style>')[1] ?? ''
  assert.match(style, /\.action-button\s*\{[^}]*line-height:\s*88rpx/s)
})