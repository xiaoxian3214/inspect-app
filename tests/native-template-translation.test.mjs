import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

/** 递归收集应用页面及组件，跳过第三方模块和编译产物。 */
async function sourceFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(file))
    else if (file.endsWith('.uvue')) files.push(file)
  }
  return files
}

/** Android 模板不能直接调用导入的 t，否则 Kotlin 生成 unref(t)(...) 并报 invoke 不存在。 */
test('native templates call local translation wrappers rather than imported t', async () => {
  const offenders = []
  for (const file of [...await sourceFiles('pages'), ...await sourceFiles('components')]) {
    const source = await readFile(file, 'utf8')
    const template = source.split('<script')[0]
    if (/\bt\s*\(/.test(template)) offenders.push(file)
    if (/\btranslateText\s*\(/.test(template)) {
      assert.match(source, /function translateText\(/, `${file}: 模板方法必须在脚本声明`)
      assert.match(source, /function translateText\([^\n]*\): string \{ return t\(/, `${file}: 模板方法须复用原翻译函数`)
    }
  }
  assert.deepEqual(offenders, [], `以下页面仍直接在模板调用 t: ${offenders.join(', ')}`)
})
