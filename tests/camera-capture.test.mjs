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

/** 校验连续拍照页使用原生相机事件与安全的相册回退。 */
test('continuous camera page uses xview-camera-view', async () => {
  const page = await readFile('pages/report/camera.uvue', 'utf8')
  const pages = JSON.parse(await readFile('pages.json', 'utf8'))

  assert.equal(pages.pages.some((item) => item.path === 'pages/report/camera'), true)
  assert.equal(pages.pages.find((item) => item.path === 'pages/report/camera')?.style?.navigationBarTitleText, '连续拍照')
  assert.match(page, /<xview-camera-view/)
  assert.match(page, /ref="nativeCameraRef"/)
  assert.match(page, /@onCameraOpened="handleCameraReady"/)
  assert.match(page, /@onPictureTaken="handleNativePhoto"/)
  assert.match(page, /@onCameraError="handleCameraError"/)
  assert.match(page, /class="camera-title">\{\{ t\('连续拍照'\) \}\}</)
  assert.doesNotMatch(page, /<camera\b/)
  assert.doesNotMatch(page, /uni\.createCameraContext/)
  assert.match(page, /takePhoto/)
  assert.match(page, /capturedPaths\.value/)
  assert.match(page, /appendCapturePaths/)
  assert.match(page, /resolveMediaPreviewRotation/)
  assert.match(page, /const tempPath = String\(event\?\.detail\?\.path \?\? ''\)\.trim\(\)/)
  assert.match(page, /if \(tempPath === ''\) \{ capturing\.value = false; uni\.showToast/)
  assert.match(page, /:style="getThumbnailImageStyle\(index\)"/)
  assert.match(page, /capturedRotations/)
  assert.match(page, /resolveMediaPreviewRotationDelta/)
  assert.match(page, /function appendCapturedMedia/)
  assert.match(page, /pendingCaptureRotation = thumbnailRotation\.value/)
  assert.match(page, /const captureRotation = pendingCaptureRotation/)
  assert.match(page, /appendCapturedMedia\(\[tempPath\], captureRotation\)/)
  assert.match(page, /appendCapturedMedia\(result\?\.tempFilePaths \?\? \[\], selectionRotation\)/)
  assert.match(page, /uni\.onAccelerometerChange\(accelerometerListener\)/)
  assert.match(page, /uni\.startAccelerometer\(\{[^}]*interval:\s*'ui'/)
  assert.match(page, /uni\.offAccelerometerChange\(accelerometerListener\)/)
  assert.match(page, /uni\.stopAccelerometer/)
  assert.match(page, /function handlePageShow\(\) \{[^}]*startThumbnailOrientationTracking\(\)/)
  assert.match(page, /function handlePageHide\(\) \{[^}]*stopThumbnailOrientationTracking\(\)/)
  assert.match(page, /onShow\(handlePageShow\)/)
  assert.match(page, /onHide\(handlePageHide\)/)
  assert.doesNotMatch(page, /persistCapturedPath/)
  assert.doesNotMatch(page, /normalizeMediaOrientation|normalizeMediaPaths/)
  assert.doesNotMatch(page, /uni\.getImageInfo|uni\.compressImage/)
  assert.doesNotMatch(page, /uni\.saveFile/)
  assert.match(page, /devicePosition/)
  assert.match(page, /flashMode/)
  assert.match(page, /nativeCameraRef\.value\?\.\$callMethod\('takePhoto'/)
  assert.match(page, /sourceType:\s*\['album'\]/)
  assert.match(page, /uni\.\$emit/)
  assert.match(page, /<TopSafeArea/)
  assert.match(page, /cameraReady/)
  assert.match(page, /相机启动中/)
  assert.match(page, /cameraErrorMessage/)
  assert.match(page, /function handleCameraReady/)
  assert.match(page, /function handleCameraStopped/)
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
  assert.match(checkItem, /class="section-title">\{\{ t\('媒体库'\) \}\}</)
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
