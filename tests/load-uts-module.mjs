import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'

/** 剥离 UTS 的 TypeScript 类型后加载纯逻辑模块，使 Node 测试与原生类型声明兼容。 */
export async function loadUtsModule(relativePath) {
  const fileUrl = new URL(relativePath, pathToFileURL(`${process.cwd()}/`))
  const source = await readFile(fileUrl, 'utf8')
  const encoded = Buffer.from(`${stripTypeScriptTypes(source)}\n//# sourceURL=${fileUrl.href}`).toString('base64')
  return import(`data:text/javascript;base64,${encoded}`)
}
