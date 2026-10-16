import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const captureModule = await loadUtsModule('domain/cameraCapture.uts')

test('appends unique burst captures in order and respects the maximum count', () => {
  assert.deepEqual(captureModule.appendCapturePaths(
    ['/saved/a.jpg'],
    ['/saved/a.jpg', '/saved/b.jpg', '/saved/c.jpg'],
    2
  ), ['/saved/a.jpg', '/saved/b.jpg'])
})

test('builds a stable isolated event name for each camera request', () => {
  assert.equal(captureModule.buildCameraCaptureEventName('request-1'), 'inspection-camera-result:request-1')
})

test('normalizes camera result payloads from custom capture and album selection', () => {
  assert.deepEqual(captureModule.normalizeCameraResultPaths({ paths: ['/saved/a.jpg', '', '/saved/b.jpg'] }), ['/saved/a.jpg', '/saved/b.jpg'])
  assert.deepEqual(captureModule.normalizeCameraResultPaths(['/saved/c.jpg']), ['/saved/c.jpg'])
})

test('detail sheets share the H5-style reusable media grid', async () => {
  const checkItem = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const defect = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  const grid = await readFile('components/detail/InspectionMediaGrid.uvue', 'utf8')
  const item = await readFile('components/detail/InspectionMediaItem.uvue', 'utf8')

  for (const source of [checkItem, defect]) {
    assert.match(source, /import InspectionMediaGrid/)
    assert.match(source, /<InspectionMediaGrid/)
    assert.match(source, /add-label="拍照"/)
  }
  assert.match(checkItem, /class="section-title">\{\{ translateText\('媒体库'\) \}\}</)
  assert.doesNotMatch(checkItem, /class="section-title">现场图片</)
  assert.match(grid, /import InspectionMediaItem/)
  assert.match(grid, /capture-media/)
  assert.match(grid, /remove-media/)
  assert.match(grid, /preview-media/)
  assert.match(grid, /class="media-cell"/)
  assert.match(grid, /default:\s*'拍照'/)
  assert.match(grid, /\.media-cell\s*\{[^}]*width:\s*33\.333333%[^}]*height:\s*231rpx[^}]*padding:\s*8rpx[^}]*box-sizing:\s*border-box/)
  assert.match(grid, /\.media-add\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/)
  assert.doesNotMatch(grid, /aspect-ratio/)
  assert.match(item, /InspectionMediaImage/)
  assert.match(item, /uploadStatus/)
  assert.match(item, /retry-media/)
  assert.match(item, /v-if="showStatusIndicator"/)
  assert.match(item, /statusLightClass/)
  assert.match(item, /status-uploading/)
  assert.match(item, /status-pending/)
  assert.match(item, /\.media-status-light\s*\{[^}]*top:\s*8rpx[^}]*left:\s*8rpx/)
  assert.doesNotMatch(item, /@keyframes|animation:/)
  assert.doesNotMatch(item, /statusText/)
  assert.doesNotMatch(item, /<text[^>]*>\{\{\s*status/)
  assert.match(item, /\.media-item\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/)
  assert.doesNotMatch(item, /aspect-ratio/)
  assert.match(item, /\.media-image\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/)
})

test('detail page opens the system camera and bypasses the custom burst camera', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /uni\.chooseImage\(/)
  assert.match(source, /count:\s*1/)
  assert.match(source, /sourceType:\s*\['camera'\]/)
  assert.doesNotMatch(source, /buildCameraCaptureEventName/)
  assert.doesNotMatch(source, /\/pages\/report\/camera\?requestId=/)
  assert.doesNotMatch(source, /uni\.\$once/)
})

test('detail page persists confirmed camera paths through the app-x file system manager', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /uni\.getFileSystemManager\(\)/)
  assert.match(source, /fileSystemManager\.saveFile/)
  assert.doesNotMatch(source, /uni\.saveFile/)
})

test('zoom presets only expose the ratios the camera actually supports', () => {
  assert.deepEqual(captureModule.buildCameraZoomOptions(0), [1])
  assert.deepEqual(captureModule.buildCameraZoomOptions(1), [1])
  assert.deepEqual(captureModule.buildCameraZoomOptions(2), [1, 2])
  assert.deepEqual(captureModule.buildCameraZoomOptions(3), [1, 2, 3])
  assert.deepEqual(captureModule.buildCameraZoomOptions(4), [1, 2, 3])
  assert.deepEqual(captureModule.buildCameraZoomOptions(10), [1, 2, 3, 5, 10])
  assert.deepEqual(captureModule.buildCameraZoomOptions(Number.NaN), [1])
})

test('video duration labels use mm:ss and clamp invalid values to zero', () => {
  assert.equal(captureModule.formatVideoDurationLabel(0), '00:00')
  assert.equal(captureModule.formatVideoDurationLabel(9), '00:09')
  assert.equal(captureModule.formatVideoDurationLabel(65), '01:05')
  assert.equal(captureModule.formatVideoDurationLabel(600), '10:00')
  assert.equal(captureModule.formatVideoDurationLabel(Number.NaN), '00:00')
  assert.equal(captureModule.formatVideoDurationLabel(-4), '00:00')
})

/**
 * 取景页底部必须提供取消、闪光灯、倍率、拍照、切换录像、翻转和完成，
 * 取景画面占上方主要区域，照片区与控制条都留在页面下半部分。
 */
test('capture page wires the bottom control panel the inspection flow needs', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const toolbar = await readFile('components/camera/CaptureToolbar.uvue', 'utf8')
  const settingBar = await readFile('components/camera/CaptureSettingBar.uvue', 'utf8')

  assert.match(page, /import CaptureStrip from '\.\.\/\.\.\/components\/camera\/CaptureStrip\.uvue'/)
  assert.match(page, /import CaptureToolbar from '\.\.\/\.\.\/components\/camera\/CaptureToolbar\.uvue'/)
  assert.match(page, /import CaptureSettingBar from '\.\.\/\.\.\/components\/camera\/CaptureSettingBar\.uvue'/)
  assert.match(page, /class="camera-page"/)
  assert.match(page, /class="preview-wrap"/)
  assert.match(page, /class="capture-panel"/)
  assert.ok(page.indexOf('class="preview-wrap"') < page.indexOf('class="capture-panel"'), '取景画面必须排在底部操作面板之前')

  assert.match(page, /@cancel-capture="handleCancelCapture"/)
  assert.match(page, /@toggle-flash="toggleFlash"/)
  assert.match(page, /@change-zoom="applyZoom"/)
  assert.match(page, /@switch-capture-mode="switchCaptureMode"/)
  assert.match(page, /@switch-camera="switchCamera"/)
  assert.match(page, /buildCameraZoomOptions/)
  assert.match(page, /context\.setZoom\(\{/)
  assert.match(page, /:flash="flashMode"/)
  assert.match(page, /context\.startRecord\(/)
  assert.match(page, /context\.stopRecord\(/)
  assert.match(page, /context\.takePhoto\(/)

  assert.match(settingBar, /defineEmits\(\['cancel-capture', 'toggle-flash', 'change-zoom', 'switch-capture-mode', 'switch-camera'\]\)/)
  assert.match(settingBar, /\/static\/camera\/flip\.png/)
  assert.match(settingBar, /\/static\/camera\/flashoff\.png/)
  assert.match(settingBar, /\/static\/camera\/flashon\.png/)
  assert.match(settingBar, /translateText\('取消'\)/)
  assert.match(toolbar, /\/static\/camera\/shutter\.png/)
  assert.match(strip, /capture-thumb/)
  assert.match(strip, /remove-photo/)
})
