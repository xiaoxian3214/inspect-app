import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const captureModule = await loadUtsModule('domain/cameraCapture.uts')

test('appends unique captures in order without truncating the session', () => {
  assert.deepEqual(captureModule.appendCapturePaths(
    ['/saved/a.jpg'],
    ['/saved/a.jpg', '/saved/b.jpg', '/saved/c.jpg']
  ), ['/saved/a.jpg', '/saved/b.jpg', '/saved/c.jpg'])

  const manyPaths = []
  for (let index = 0; index < 24; index++) manyPaths.push(`/saved/shot-${index}.jpg`)
  assert.equal(captureModule.appendCapturePaths([], manyPaths).length, 24)
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

test('detail page opens the reusable capture page and consumes its request-scoped result', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.doesNotMatch(source, /uni\.chooseImage\(/)
  assert.match(source, /import \{ buildCameraCaptureEventName, normalizeCameraCaptureMedia \} from '\.\.\/\.\.\/domain\/cameraCapture\.uts'/)
  assert.match(source, /uni\.\$on\(eventName, handler\)/)
  assert.match(source, /url: `\/pages\/report\/simple-camera\?requestId=\$\{encodeURIComponent\(requestId\)\}`/)
  assert.doesNotMatch(source, /uni\.\$once/)
  assert.match(source, /function settleCameraCapture\(payload: UTSJSONObject \| null\): void/)
  assert.match(source, /if \(pendingCaptureEventName !== eventName\) return/)
  assert.match(source, /settleCameraCapture\(null\)/)
})

/** 自定义相机的结果事件以 requestId 隔离，完成时必须在返回详情前发出包含全部本地路径的媒体条目。 */
test('custom capture sends every saved media item to the detail media library', async () => {
  const camera = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(camera, /const items = cancelled \? \(\[\] as UTSJSONObject\[\]\) : buildResultItems\(savedPaths\)/)
  assert.match(camera, /uni\.\$emit\(buildCameraCaptureEventName\(requestId\.value\), \{ paths: paths, items: items, cancelled: cancelled \}\)/)
  assert.ok(camera.indexOf('emitCaptureResult(false, savedPaths)') < camera.indexOf('goBackWithResult(savedPaths)'))
  assert.match(detail, /normalizeCameraCaptureMedia\(payload\)/)
  assert.match(detail, /inspectionMediaService\.addLocalPhoto\(planId\.value, localPath/)
})

/** 疵点照片在拍照返回后只入库为草稿，点击保存才激活待上传状态与同步。 */
test('detail defers defect photo upload until saving the defect', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const add = source.split('async function addDefectPhoto(')[1].split('async function removeDefectPhoto(')[0]
  const save = source.split('async function saveDefect(')[1].split('function confirmRemoveDefect(')[0]
  assert.match(add, /createLocalPhotos\('defect', defectId, \{ \.\.\.uploadMetadata, uploadStatus: 'draft' \}\)/)
  assert.doesNotMatch(add, /persistDraft\(|processSyncQueueAfterChange\(|uploadPendingPhotos\(/)
  assert.match(save, /activateDefectPhotos\(\(next\.photos/)
  assert.match(save, /persistDraft\(\{ markDirty: true/)
  assert.match(source, /@close="discardDefectSheet"/)
  assert.match(source, /async function discardDefectSheet\(\): Promise<void>[\s\S]*?photoRepository\.remove\(planId\.value, photo\.photoId\)/)
  assert.ok(save.indexOf('activateDefectPhotos((next.photos') > save.indexOf('persistDraft({ markDirty: true, changes: { defectIds: [defectId] }, deferSync: true })'))
  assert.ok(save.indexOf('activateDefectPhotos((next.photos') < save.indexOf('await persistDraft({ markDirty: true, changes: { defectIds: [defectId] } })'))
})

test('detail page routes camera results through the shared media persistence service', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /import \{ createAppMediaPersistenceService \} from '\.\.\/\.\.\/services\/mediaPersistenceService\.uts'/)
  assert.match(source, /const mediaPersistenceService = createAppMediaPersistenceService\(\)/)
  assert.match(source, /mediaPersistenceService\.persistMediaPath\(tempPath, isVideo\)/)
  assert.doesNotMatch(source, /uni\.saveFile/)
  assert.doesNotMatch(source, /fileSystemManager\.saveFile/)
})

test('zoom presets keep only the 1x/2x/3x levels the capture flow cycles through', () => {
  assert.deepEqual(captureModule.buildCameraZoomOptions(0), [1])
  assert.deepEqual(captureModule.buildCameraZoomOptions(1), [1])
  assert.deepEqual(captureModule.buildCameraZoomOptions(2), [1, 2])
  assert.deepEqual(captureModule.buildCameraZoomOptions(3), [1, 2, 3])
  assert.deepEqual(captureModule.buildCameraZoomOptions(4), [1, 2, 3])
  assert.deepEqual(captureModule.buildCameraZoomOptions(10), [1, 2, 3])
  assert.deepEqual(captureModule.buildCameraZoomOptions(Number.NaN), [1])
})

test('zoom button switches to the next supported level and wraps back to 1x', () => {
  assert.equal(captureModule.resolveNextCameraZoom([1, 2, 3], 1), 2)
  assert.equal(captureModule.resolveNextCameraZoom([1, 2, 3], 2), 3)
  assert.equal(captureModule.resolveNextCameraZoom([1, 2, 3], 3), 1)
  assert.equal(captureModule.resolveNextCameraZoom([1, 2], 2), 1)
  assert.equal(captureModule.resolveNextCameraZoom([1], 1), 1)
  assert.equal(captureModule.resolveNextCameraZoom([1, 2, 3], 7), 1)
  assert.equal(captureModule.resolveNextCameraZoom([], 2), 1)
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
 * 完成只返回持久化本地图片，相册入口从自定义相机页面和操作条一并删除。
 */
test('custom camera finish keeps local paths and offers no album picker', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controls = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')
  const finish = page.split('async function handleFinishCapture()')[1].split('function handleCancelCapture()')[0]
  assert.match(finish, /persistMediaPath\(/)
  assert.doesNotMatch(finish, /uploadPendingPhotos|uploadInspectFile|addLocalPhoto|processSyncQueueAfterChange/)
  assert.doesNotMatch(page, /captureFromAlbum|@pick-album|sourceType:\s*\['album'\]/)
  assert.doesNotMatch(controls, /pick-album|pickAlbum|xiangce\.png|translateText\('相册'\)/)
})

/** 取景页底部保留取消、闪光灯、倍率、拍照、录像、翻转和完成等操作。 */
test('capture page wires the bottom control panel the inspection flow needs', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')

  assert.match(page, /import CaptureStrip from '\.\.\/\.\.\/components\/camera\/CaptureStrip\.uvue'/)
  assert.match(page, /import CaptureControlBar from '\.\.\/\.\.\/components\/camera\/CaptureControlBar\.uvue'/)
  assert.match(page, /class="camera-page"/)
  assert.match(page, /class="preview-wrap"/)
  assert.match(page, /class="capture-panel"/)
  assert.ok(page.indexOf('class="preview-wrap"') < page.indexOf('class="capture-panel"'), '取景画面必须排在底部操作面板之前')

  assert.match(page, /@cancel-capture="handleCancelCapture"/)
  assert.match(page, /@toggle-flash="toggleFlash"/)
  assert.match(page, /@change-zoom="applyZoom"/)
  assert.match(page, /@switch-capture-mode="switchCaptureMode"/)
  assert.match(page, /@switch-camera="switchCamera"/)
  assert.match(page, /@press-shutter="takePhoto"/)
  assert.match(page, /@finish-capture="handleFinishCapture"/)
  assert.match(page, /:shutter-disabled="shutterDisabled"/)
  assert.match(page, /:finish-enabled="captureEnabled"/)
  assert.match(page, /buildCameraZoomOptions/)
  assert.match(page, /context\.setZoom\(\{/)
  assert.match(page, /:flash="flashMode"/)
  assert.match(page, /context\.startRecord\(/)
  assert.match(page, /context\.stopRecord\(/)
  assert.match(page, /context\.takePhoto\(/)

  assert.match(controlBar, /defineEmits\(\['cancel-capture', 'toggle-flash', 'change-zoom', 'switch-capture-mode', 'switch-camera', 'press-shutter', 'finish-capture'\]\)/)
  assert.match(controlBar, /\/static\/camera\/flip\.png/)
  assert.match(controlBar, /\/static\/camera\/flashoff\.png/)
  assert.match(controlBar, /\/static\/camera\/flashon\.png/)
  assert.match(controlBar, /\/static\/camera\/shutter\.png/)
  assert.match(controlBar, /translateText\('取消'\)/)
  assert.match(controlBar, /translateText\('完成'\)/)
  assert.match(strip, /capture-thumb/)
  assert.match(strip, /remove-photo/)
})

/**
 * 快门与操作行必须落在同一行：左右两组等宽，快门夹在中间保持居中。
 */
test('shutter and operation row share one centered control row', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')

  assert.match(page, /<CaptureControlBar[\s\S]*?\/>/)
  assert.doesNotMatch(page, /<CaptureSettingBar/)
  assert.doesNotMatch(page, /<CaptureToolbar/)
  assert.match(controlBar, /class="capture-control-row"/)
  assert.match(controlBar, /class="control-side control-side-left"/)
  assert.match(controlBar, /class="shutter-wrap"/)
  assert.match(controlBar, /class="control-side control-side-right"/)
  const leftIndex = controlBar.indexOf('control-side-left')
  const shutterIndex = controlBar.indexOf('shutter-wrap"')
  const rightIndex = controlBar.indexOf('control-side-right')
  assert.ok(leftIndex < shutterIndex && shutterIndex < rightIndex, '快门必须夹在左右两组操作项之间')
  assert.match(controlBar, /\.control-side\s*\{[^}]*flex:\s*1/)
  assert.match(controlBar, /\.capture-control-row\s*\{[^}]*flex-direction:\s*row[^}]*align-items:\s*center/)
})

/**
 * 底部版式：取消固定在最左侧，已拍照片区排在控制条之后，留在整个页面最下方。
 */
test('cancel sits leftmost and the captured media strip stays at the very bottom', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')

  const leftGroupStart = controlBar.indexOf('control-side-left')
  const cancelIndex = controlBar.indexOf("translateText('取消')")
  assert.ok(leftGroupStart >= 0 && leftGroupStart < cancelIndex, '取消必须位于左侧操作组内')
  assert.ok(cancelIndex < controlBar.indexOf('@click="toggleFlash"'), '取消必须是左侧操作组的第一项（最左侧）')

  assert.ok(page.indexOf('<CaptureControlBar') < page.indexOf('<CaptureStrip'), '照片区必须排在控制条之后')
  assert.ok(page.indexOf('<CaptureStrip') > page.indexOf('class="capture-panel"'), '照片区必须留在页面最下方')
  assert.doesNotMatch(page, /<CaptureStrip[\s\S]*?<CaptureControlBar/)
})

/**
 * 倍率不再平铺所有档位：底部只展示当前档位一个圆形按钮，点一次切到下一档并循环。
 */
test('zoom control shows a single circular button and cycles the level on each tap', async () => {
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')

  assert.doesNotMatch(controlBar, /v-for="\(zoom, index\) in zoomLevels"/)
  assert.match(controlBar, /import \{ resolveNextCameraZoom \}/)
  assert.match(controlBar, /class="control-cell" @click="cycleZoom"/)
  assert.match(controlBar, /class="zoom-circle"/)
  assert.match(controlBar, /\.zoom-circle\s*\{[^}]*width:\s*44rpx[^}]*height:\s*44rpx[^}]*border-radius:\s*22rpx/)
  assert.match(controlBar, /zoomLabel\(activeZoom\)/)
  assert.match(controlBar, /emit\('change-zoom', resolveNextCameraZoom\(levels, props\.activeZoom\)\)/)
  assert.match(controlBar, /zoomLevels\.length > 1/)
  assert.doesNotMatch(controlBar, /selectZoom/)
})

/**
 * 取景框铺满取景区：宽度占满屏幕、高度用满面板以上的全部空间，用户能看到最多画面。
 * 取景比例由系统相机的预览流协商（预览 aspectFill 裁剪、成片不按预览裁剪），页面不再自行限定 4:3 / 16:9。
 */
test('viewfinder fills the whole preview area instead of a fixed photo ratio', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /<view class="preview-frame">/)
  assert.match(page, /\.preview-frame \{[^}]*flex: 1;[^}]*width: 100%;/)
  assert.match(page, /\.preview-wrap \{[^}]*flex: 1;[^}]*overflow: hidden;/)
  assert.match(page, /\.camera-preview \{ width: 100%; height: 100%; \}/)
  // 取景框不再由脚本按比例算高，也不再读取成片像素校正比例。
  assert.doesNotMatch(page, /previewFrameStyle|resolveCaptureFrameSize|captureAspectRatio/)
  assert.doesNotMatch(page, /learnCaptureAspectRatio|resolveCaptureAspectRatio|getImageInfo/)
})

/**
 * 拍照按钮保持紧凑的圆形底板，里面的相机图标放大：图标按当前握持角反向补角，横屏竖屏都保持正向。
 */
test('compact shutter button carries a larger upright camera glyph that follows the handset', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')

  const shutterSize = parseInt(/\.shutter-wrap \{[^}]*width: (\d+)rpx/.exec(controlBar)?.[1] ?? '0')
  const iconSize = parseInt(/\.shutter-icon \{[^}]*width: (\d+)rpx/.exec(controlBar)?.[1] ?? '0')
  const rowHeight = parseInt(/\.capture-control-row \{ height: (\d+)rpx/.exec(controlBar)?.[1] ?? '0')
  const glyphSize = parseInt(/<AppIcon type="camera" :size="(\d+)"/.exec(controlBar)?.[1] ?? '0')
  // 按钮直径收回紧凑档（156rpx 那一档过大），操作行只需比按钮略高即可放下。
  assert.ok(shutterSize >= 116 && shutterSize <= 136, `拍照按钮应保持在 116~136rpx，当前 ${shutterSize}rpx`)
  assert.ok(iconSize < shutterSize && iconSize >= shutterSize - 12, `按钮底板要略小于按钮直径，当前 ${iconSize}rpx`)
  assert.ok(rowHeight >= shutterSize && rowHeight <= shutterSize + 28, `操作行高度要贴合按钮，当前 ${rowHeight}rpx`)
  // 按钮变小后图标反而要更显眼：Camera 图标放大到 36px 以上（AppIcon 的 size 是 px）。
  assert.ok(glyphSize >= 36, `按钮内的相机图标需要放大到 36px 以上，当前 ${glyphSize}px`)

  // 按钮内叠加可复用的相机图标；录像模式仍显示录制/停止图标，不叠加相机图标。
  assert.match(controlBar, /import AppIcon from '\.\.\/icons\/AppIcon\.uvue'/)
  assert.match(controlBar, /v-if="captureMode === 'photo'" class="shutter-glyph"/)
  assert.match(controlBar, /<AppIcon type="camera" :size="\d+" color="#0f172a" \/>/)
  // 相机图标绝对居中压在底板上，旋转容器必须自己建立定位上下文。
  assert.match(controlBar, /\.shutter-rotate \{[^}]*position: relative;/)
  assert.match(controlBar, /\.shutter-glyph \{[^}]*position: absolute;/)
  // 图标按当前握持角反向补角：手机横过来时按钮里的相机图标仍然朝上。
  assert.match(controlBar, /deviceRotation: \{ type: Number, default: 0 \}/)
  assert.match(controlBar, /resolveThumbnailRotation\(props\.deviceRotation\)/)
  assert.match(controlBar, /class="shutter-rotate"/)
  assert.match(page, /<CaptureControlBar[^>]*:device-rotation="deviceRotation"/)
})

/** 保存的文件由回正队列转正；底部缩略图跟随机身反向旋转便于观看，大图仍按照片自身像素展示。 */
test('custom capture previews keep the uprighted file while the strip follows the handset', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')
  assert.match(page, /startDeviceRotationTracking\(\)/)
  assert.match(page, /stopDeviceRotationTracking\(\)/)
  assert.match(page, /uni\.startAccelerometer\(\{[\s\S]*?interval: 'ui'/)
  assert.match(page, /const shutterRotation = deviceRotation\.value/)
  // 底部缩略图按当前握持角反向补角，观看者始终看到正向图片；文件字节不变。
  assert.match(page, /<CaptureStrip :items="captureItems" :device-rotation="deviceRotation" @remove-photo="removeCapture" @preview-photo="openCapturePreview" \/>/)
  assert.match(strip, /:style="thumbnailRotationStyle"/)
  assert.match(strip, /resolveThumbnailRotation\(props\.deviceRotation\)/)
  // 大图按照片自身已回正的像素展示，不再叠加机身角度。
  assert.doesNotMatch(preview, /deviceRotation|resolveThumbnailRotation|previewRotationStyle|preview-media-rotated/)
  assert.match(preview, /<image class="preview-media" :src="displaySource" mode="aspectFit" \/>/)
  // 自定义原生方向插件已移除：拔掉的是插件本身，不是方向能力。
  assert.doesNotMatch(page, /inspection-device-orientation|startDeviceOrientation|stopDeviceOrientation/)
  assert.doesNotMatch(page, /document\.|window\./)
})

/** Vapor 横向 scroll-view 必须有超出可视区域的内容宽度，不能让 flex 把缩略图压缩进屏幕。 */
test('captured media strip exposes a wider row for horizontal swipe', async () => {
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  assert.match(strip, /<scroll-view[^>]*class="capture-strip-scroll"[^>]*direction="horizontal"/)
  assert.match(strip, /class="capture-strip-row"[^>]*:style="\{ width: stripRowWidth \}"/)
  // 缩略图之间的间距收窄到 12rpx 以内，照片多了也不至于把画面挤散。
  const thumbGap = parseInt(/\.capture-thumb-wrap\s*\{[^}]*margin-right:\s*(\d+)rpx/.exec(strip)?.[1] ?? '0')
  assert.ok(thumbGap > 0 && thumbGap <= 12, `缩略图之间的间距需要收窄，当前 ${thumbGap}rpx`)
  // 内容宽度必须按每张缩略图实际尺寸加实际间距计算，改尺寸或改间距时不能漏改这里。
  const thumbSize = parseInt(/\.capture-thumb \{ width: (\d+)rpx;/.exec(strip)?.[1] ?? '0')
  const rowStep = parseInt(/mediaItems\.value\.length \* (\d+)/.exec(strip)?.[1] ?? '0')
  assert.equal(rowStep, thumbSize + thumbGap, `横向内容宽度必须按缩略图 ${thumbSize}rpx + ${thumbGap}rpx 间距计算，当前 ${rowStep}rpx`)
  assert.match(strip, /\.capture-thumb-wrap\s*\{[^}]*flex-shrink:\s*0/)
})

test('captured thumbnails normalize native absolute paths before rendering', async () => {
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')

  assert.match(strip, /import \{ resolveLocalMediaDisplayPath \} from '\.\.\/\.\.\/domain\/deviceCapture\.uts'/)
  assert.match(strip, /<image v-else class="capture-thumb" :src="item\.previewPath"[^>]*:style="thumbnailRotationStyle"[^>]*mode="aspectFill"[^>]*\/>/)
  assert.match(strip, /@error="handleThumbError"/)
  assert.doesNotMatch(strip, /:src="item\.path"/)
  assert.match(strip, /previewPath: resolveLocalMediaDisplayPath\(\(item\['previewPath'\] \?\? item\['path'\] \?\? ''\)\.toString\(\)\)/)
})
