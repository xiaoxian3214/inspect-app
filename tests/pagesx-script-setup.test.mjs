// pagesx 示例页的蒸汽（vapor）模式守卫。
//
// 背景：工程在 manifest.json 中开启了 "uni-app-x": { "vapor": true }，
// 蒸汽渲染链只挂载 <script setup> 组合式页面；残留的 Options API 页面
// （export default + data + this.$refs）在 vapor 下无法获取页面实例。
// 本测试把 pagesx 示例页的写法钉死，避免再次回退到 Options API。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 需要在蒸汽模式下运行的示例页面入口。 */
const PAGESX_PAGES = [
  'pagesx/index/index.uvue'
]

/**
 * 剥离注释与字符串字面量，避免注释或文案里的 export/this 造成误报。
 * 参数：source 为 uvue 源码。
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

test('pagesx 示例页使用 script setup 以适配蒸汽模式', async () => {
  for (const file of PAGESX_PAGES) {
    const source = await readFile(file, 'utf8')
    assert.match(source, /<script setup lang="uts">/, `${file}: 必须声明 <script setup lang="uts">`)
    const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)
    assert.ok(script != null, `${file}: 未找到脚本块`)
    const code = stripCommentsAndStrings(script[1])
    assert.doesNotMatch(code, /export\s+default\s*\{/, `${file}: script setup 中不能保留 Options API 的 export default`)
    assert.doesNotMatch(code, /\bdata\s*\(\s*\)\s*\{/, `${file}: script setup 中不应再声明 data()`)
    assert.doesNotMatch(code, /\bthis\s*\./, `${file}: script setup 中不允许用 this 访问实例，请直接用 ref 变量`)
    assert.doesNotMatch(code, /\$refs/, `${file}: script setup 中请使用模板 ref 变量，而不是 $refs`)
  }
})

test('示例入口指向生产取景页，取景与拍照都留在页面内', async () => {
  const indexPage = await readFile(PAGESX_PAGES[0], 'utf8')
  assert.match(indexPage, /onLoad\(handlePageLoad\)/, 'index.uvue: 需要在 onLoad 订阅相机结果事件')
  assert.match(indexPage, /onUnload\(handlePageUnload\)/, 'index.uvue: 需要在 onUnload 移除相机结果监听')
  assert.match(indexPage, /toPage\('\/pages\/report\/simple-camera'\)/, 'index.uvue: 相机示例需要指向生产取景页')

  // createCameraContext 是页面级上下文：取景元素放进子组件会让快门拍照原生闪退，
  // 因此取景页自己持有 <camera>，示例页与连拍组件都已删除。
  const cameraPage = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.match(cameraPage, /<camera\b/, 'simple-camera.uvue: 取景元素必须直接写在页面里')
  assert.match(cameraPage, /uni\.createCameraContext\(\)/, 'simple-camera.uvue: 需要在页面内创建相机上下文')
  assert.doesNotMatch(cameraPage, /DeviceBurstCamera|xview-camera-view|ima-camerax-view/, 'simple-camera.uvue: 不能再依赖组件或兼容模式相机插件')

  await assert.rejects(readFile('pagesx/camera/deviceCapture.uvue', 'utf8'))
  await assert.rejects(readFile('components/camera/DeviceBurstCamera.uvue', 'utf8'))
})