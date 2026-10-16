import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const deviceCapture = await loadUtsModule('domain/deviceCapture.uts')

test('normalizes the system camera result into unique local paths', () => {
  assert.deepEqual(
    deviceCapture.normalizeDeviceCapturePaths(['/tmp/a.jpg', '', '/tmp/b.jpg', '/tmp/a.jpg']),
    ['/tmp/a.jpg', '/tmp/b.jpg']
  )
  assert.deepEqual(deviceCapture.normalizeDeviceCapturePaths(null), [])
})

test('treats a user cancellation of the device camera as a normal stop', () => {
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage('chooseImage:fail cancel'), true)
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage('chooseImage:fail camera permission denied'), false)
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage(''), false)
})

test('counts the remaining capture capacity against the configured limit', () => {
  assert.equal(deviceCapture.resolveRemainingCaptureCount(9, 0), 9)
  assert.equal(deviceCapture.resolveRemainingCaptureCount(9, 9), 0)
  assert.equal(deviceCapture.resolveRemainingCaptureCount(9, 12), 0)
  assert.equal(deviceCapture.resolveRemainingCaptureCount(0, 0), 1)
})

test('no longer exposes the removed continuous capture helper', () => {
  assert.equal(deviceCapture.shouldContinueBurstCapture, undefined)
})

/**
 * 取景与拍照必须放在页面里：createCameraContext 是页面级上下文，
 * 取景元素放进子组件时快门拍照会原生闪退；相机未就绪时也不允许调用 takePhoto。
 */
test('custom camera page previews in page and captures one photo per shutter press', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /<script setup lang="uts">/)
  assert.doesNotMatch(page, /export default\s*\{/)
  assert.doesNotMatch(page, /\bthis\./)
  assert.doesNotMatch(page, /ima-camerax-view|xview-camera-view|\$refs/)
  assert.doesNotMatch(page, /sourceType:\s*\['camera'\]/)
  assert.doesNotMatch(page, /DeviceBurstCamera/)

  assert.match(page, /<camera\b/)
  assert.match(page, /id="camera"/)
  assert.match(page, /:device-position="devicePosition"/)
  assert.match(page, /:resolution="'high'"/)
  assert.match(page, /photo-resolution="high"/)
  assert.match(page, /@initdone="handleCameraInitDone"/)
  assert.match(page, /@error="handleCameraError"/)
  assert.match(page, /@stop="handleCameraStop"/)

  assert.match(page, /uni\.createCameraContext\(\)/)
  assert.match(page, /context\.takePhoto\(\{/)
  assert.match(page, /quality: 'high'/)
  assert.match(page, /selfieMirror: false/)
  assert.match(page, /normalizeDeviceCapturePaths\(\[result\.tempImagePath \?\? ''\]\)/)
  assert.match(page, /capturedPaths\.value = appendCapturePaths\(capturedPaths\.value, shotPaths, maxCaptureCount\)/)

  assert.match(page, /if \(!cameraReady\.value\) \{\s*uni\.showToast\(\{ title: t\('正在启动相机…'\), icon: 'none' \}\)\s*return\s*\}/)
  assert.match(page, /try \{\s*context\.takePhoto\(\{/)
  assert.match(page, /catch \(error\) \{\s*capturing\.value = false\s*notifyCaptureFailure\(\)/)

  assert.match(page, /uni\.chooseImage\(/)
  assert.match(page, /sourceType:\s*\['album'\]/)

  assert.ok(page.indexOf('preview-wrap') < page.indexOf('<CaptureStrip'), '取景框必须排在下方缩略图条之前')
})

/** 连拍与「使用 N 张照片」都已按需求移除，快捷键位改为相册 / 快门 / 完成。 */
test('custom camera page drops burst and confirm button in favor of a finish action', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const toolbar = await readFile('components/camera/CaptureToolbar.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')

  assert.doesNotMatch(page, /连拍|使用 \{count\} 张照片|continuous|shouldContinueBurstCapture|continueTimer/)
  assert.doesNotMatch(toolbar, /连拍|使用 \{count\} 张照片|AppButton/)

  assert.match(toolbar, /translateText\('相册'\)/)
  assert.match(toolbar, /translateText\('完成'\)/)
  assert.match(toolbar, /defineEmits\(\['pick-album', 'press-shutter', 'finish-capture'\]\)/)
  assert.match(page, /@pick-album="captureFromAlbum"/)
  assert.match(page, /@press-shutter="takePhoto"/)
  assert.match(page, /@finish-capture="handleFinishCapture"/)

  assert.match(page, /@remove-photo="removeCapture"/)
  assert.match(strip, /defineEmits\(\['remove-photo'\]\)/)
  assert.match(strip, /translateText\('还没有照片，点击下方快门开始拍摄'\)/)
})

/** 拍照页文案全部走页面级翻译方法，必须能在英文和越南语下取到译文。 */
test('custom camera copy is translated for English and Vietnamese', async () => {
  const { translate } = await loadUtsModule('i18n/translate.uts')
  const keys = [
    '正在启动相机…',
    '点击快门拍摄一张，照片会显示在下方',
    '还没有照片，点击下方快门开始拍摄',
    '已拍 {count}/{max} 张',
    '最多拍摄 {count} 张，请先完成或删除已拍照片',
    '无法使用相机，请检查系统相机权限',
    '打开相册失败，请重试',
    '翻转',
    '相册',
    '完成'
  ]
  for (const key of keys) {
    assert.notEqual(translate(key, 'en'), key, `缺少英文译文：${key}`)
    assert.notEqual(translate(key, 'vi'), key, `缺少越南语译文：${key}`)
  }
})

/** 页面复用纯领域函数处理路径与张数，并把「完成」结果交给上一页。 */
test('custom camera page reuses capture domain helpers', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /normalizeDeviceCapturePaths/)
  assert.match(page, /isDeviceCaptureCancelledMessage/)
  assert.match(page, /resolveRemainingCaptureCount/)
  assert.match(page, /appendCapturePaths/)
  assert.match(page, /function translateText\(key: string, params: UTSJSONObject = \{\}\): string \{ return t\(/)
})

/** 取景与拍照回调可能晚于页面销毁返回，必须置位销毁标记并清理定时器，避免 vapor 原生渲染闪退。 */
test('custom camera page guards post-unmount callbacks and timers', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /onMounted\(\(\) => \{\s*armCameraReadyFallback\(\)/)
  assert.match(page, /onBeforeUnmount\(\(\) => \{\s*disposed = true\s*clearReadyFallbackTimer\(\)/)
  assert.match(page, /onUnmounted\(\(\) => \{\s*disposed = true\s*clearReadyFallbackTimer\(\)/)
  assert.match(page, /function clearReadyFallbackTimer\(\): void \{/)
  assert.match(page, /function armCameraReadyFallback\(\): void \{/)
  assert.match(page, /clearTimeout\(readyFallbackTimerId\)/)
  assert.match(page, /if \(disposed\) return/)
  assert.match(page, /success: \(result[^)]*\) => \{\s*if \(disposed\) return\s*capturing\.value = false/)
  assert.match(page, /fail: \(error\) => \{\s*if \(disposed\) return\s*capturing\.value = false/)
  assert.match(page, /import TopSafeArea from '\.\.\/\.\.\/components\/common\/TopSafeArea\.uvue'/)
  assert.match(page, /<TopSafeArea/)
})

/** 首页用户抽屉的「自定义拍照」入口必须落到取景页面，并保持原有 setImage 回传契约。 */
test('custom camera entry opens the capture page and keeps the setImage contract', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const drawer = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  const pages = JSON.parse((await readFile('pages.json', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))

  assert.match(page, /uni\.getFileSystemManager\(\)/)
  assert.match(page, /saveFile\(\{/)
  assert.match(page, /\$callMethod\('setImage', \{ path: savedPaths\[0\], paths: savedPaths \}\)/)
  assert.match(page, /uni\.navigateBack\(\)/)
  assert.doesNotMatch(page, /xview-camera-view|ima-camerax-view|\$refs|\bString\s*\(/)

  assert.match(drawer, /@click="openCustomCamera"/)
  assert.match(list, /uni\.navigateTo\(\{ url: '\/pages\/report\/simple-camera' \}\)/)
  assert.equal(pages.pages.some((item) => item.path === 'pages/report/simple-camera'), true)
})

/** 相机取景整体搬到页面后，示例页与连拍组件必须彻底移除，示例入口改指同一页面。 */
test('demo mount and burst component are removed without leaving dead routes', async () => {
  const index = await readFile('pagesx/index/index.uvue', 'utf8')
  const pages = JSON.parse((await readFile('pages.json', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))

  assert.match(index, /toPage\('\/pages\/report\/simple-camera'\)/)
  assert.equal(pages.pages.some((item) => item.path === 'pagesx/camera/deviceCapture'), false)
  assert.equal(pages.pages.some((item) => item.path === 'pagesx/camera/takePhotoAll'), false)
  await assert.rejects(readFile('components/camera/DeviceBurstCamera.uvue', 'utf8'))
  await assert.rejects(readFile('pagesx/camera/deviceCapture.uvue', 'utf8'))
})