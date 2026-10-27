import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { loadUtsModule } from './load-uts-module.mjs'

const captureDomain = await loadUtsModule('domain/cameraCapture.uts')

test('editing replaces only the selected path and preserves capture order', () => {
  const paths = ['/photos/one.jpg', '/photos/two.jpg', '/photos/three.jpg']
  assert.deepEqual(captureDomain.replaceCapturePath(paths, 1, '/photos/edited.png'), ['/photos/one.jpg', '/photos/edited.png', '/photos/three.jpg'])
  assert.deepEqual(paths, ['/photos/one.jpg', '/photos/two.jpg', '/photos/three.jpg'])
  assert.deepEqual(captureDomain.replaceCapturePath(paths, -1, '/photos/edited.png'), paths)
  assert.deepEqual(captureDomain.replaceCapturePath(paths, 1, ''), paths)
})

test('standalone camera session commits captured and edited media to SQLite without inventing a report id', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const { createSqliteDatabase } = await loadUtsModule('database/sqliteDatabase.uts')
  const { schemaSqlList } = await loadUtsModule('database/schema.uts')
  const { createCameraCaptureRepository } = await loadUtsModule('repositories/cameraCaptureRepository.uts')
  const database = createSqliteDatabase({
    open: async () => {},
    query: async (sql) => sqlite.prepare(sql).all(),
    executeBatch: async (statements) => {
      sqlite.exec('BEGIN TRANSACTION')
      try { statements.forEach((statement) => sqlite.exec(statement)); sqlite.exec('COMMIT') }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }, schemaSqlList)
  try {
    await database.open()
    const repository = createCameraCaptureRepository(database)
    await repository.saveAll('session-1', [
      { path: '/local/one.jpg', mediaType: 'image', durationSeconds: 0 },
      { path: '/local/two.jpg', mediaType: 'image', durationSeconds: 0 }
    ])
    await repository.saveAll('session-2', [{ path: '/local/other.jpg', mediaType: 'image', durationSeconds: 0 }])
    await repository.saveAll('session-1', [
      { path: '/local/one.jpg', mediaType: 'image', durationSeconds: 0 },
      { path: '/local/edited.png', mediaType: 'image', durationSeconds: 0 }
    ])
    assert.deepEqual((await repository.listBySessionId('session-1')).map((item) => item.path), ['/local/one.jpg', '/local/edited.png'])
    assert.deepEqual((await repository.listBySessionId('session-2')).map((item) => item.path), ['/local/other.jpg'])
    await repository.saveAll('session-1', [{ path: '/local/edited.png', mediaType: 'image', durationSeconds: 0 }])
    assert.deepEqual((await repository.listBySessionId('session-1')).map((item) => item.path), ['/local/edited.png'])
  } finally { sqlite.close() }
})

test('camera strip uses per-photo corner numbers and opens a reusable preview', async () => {
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')
  assert.doesNotMatch(strip, /capture-strip-count|countLabel|已拍 \{count\} 张/)
  assert.match(strip, /class="capture-thumb-number"/)
  assert.match(strip, /index \+ 1/)
  assert.match(strip, /@click="previewPhoto\(index\)"/)
  assert.match(strip, /emit\('preview-photo', index\)/)
  assert.match(page, /@preview-photo="openCapturePreview"/)
  assert.match(page, /<CapturePreview[\s\S]*?@edited="savePreviewEdit"/)
  assert.match(preview, /<ImageMarkupEditor/)
  assert.match(preview, /@edited="finishImageEdit"/)
  assert.match(preview, /@click="openImageEditor"/)
  assert.match(preview, /type="2d"|ImageMarkupEditor/)
  assert.doesNotMatch(preview, /document\.|window\.|<svg\b/)
})

/** 大图预览的相邻下标换算：首尾不循环，越界返回 -1 表示没有可切换的媒体。 */
test('adjacent capture index stays inside the captured list', () => {
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(0, 3, 1), 1)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(2, 3, -1), 1)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(1, 3, -1), 0)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(1, 3, 1), 2)
  // 边界不循环：第一张没有上一张，最后一张没有下一张。
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(0, 3, -1), -1)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(2, 3, 1), -1)
  // 非法入参：没有媒体、下标未知或没有偏移量时都不切换。
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(0, 0, 1), -1)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(-1, 3, 1), -1)
  assert.equal(captureDomain.resolveAdjacentCaptureIndex(1, 3, 0), -1)
})

/** 横向滑动换算成翻页方向：向左滑看下一张、向右滑看上一张，未过阈值时不翻页。 */
test('horizontal swipe resolves to the next or previous capture', () => {
  assert.equal(captureDomain.CAPTURE_PREVIEW_SWIPE_THRESHOLD_PX, 60)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(-80), 1)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(80), -1)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(-10), 0)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(0), 0)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(Number.NaN), 0)
  // 阈值可覆盖：小位移手势在更低的阈值下也要能翻页。
  assert.equal(captureDomain.resolveCapturePreviewSwipe(-30, 20), 1)
  assert.equal(captureDomain.resolveCapturePreviewSwipe(30, 20), -1)
})

/**
 * 大图预览只用左右滑动切换媒体，不在左右两侧放上一页/下一页热区；
 * 切换只提交下标，媒体地址仍由拍照页统一下发。
 */
test('capture preview navigates with horizontal swipe only', async () => {
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  // 组件接收已拍总数并把切换结果交回页面，自身不持有媒体列表。
  assert.match(preview, /total: \{ type: Number, default: 0 \}/)
  assert.match(preview, /defineEmits\(\['close-preview', 'edited', 'change-index'\]\)/)
  assert.match(preview, /emit\('change-index', target\)/)
  assert.match(preview, /requestIndex\(resolveAdjacentCaptureIndex\(props\.index, props\.total, offset\)\)/)

  // 画面上不出现任何左右侧翻页热区。
  assert.doesNotMatch(preview, /preview-nav|goPrevious|goNext|canGoPrevious|canGoNext/)
  assert.doesNotMatch(preview, /<AppIcon/)

  // 位置角标仍然显示"第几张 / 共几张"。
  assert.match(preview, /\{\{ index \+ 1 \}\} \/ \{\{ total \}\}/)

  // 左右滑动：先锁定手势方向，横向才翻页；纵向手势不参与切换。
  assert.match(preview, /@touchstart="handleTouchStart"/)
  assert.match(preview, /@touchend="handleTouchEnd"/)
  assert.match(preview, /resolveGestureAxis\(/)
  assert.match(preview, /resolveCapturePreviewSwipe\(/)

  // 页面把总数交给预览，并在切换时沿用 openCapturePreview 的方向检查，不能靠滑动看到未回正原图。
  assert.match(page, /const captureTotal = computed\(\(\): number => capturedPaths\.value\.length\)/)
  assert.match(page, /:total="captureTotal"/)
  assert.match(page, /@change-index="handlePreviewIndexChange"/)
  const navigate = page.split('function handlePreviewIndexChange(index: number): void')[1]?.split('/** 关闭预览时只切换可见性')[0] ?? ''
  assert.match(navigate, /pendingUprightPaths\.value\.includes\(path\) \|\| failedUprightPaths\.value\.includes\(path\)\) return/)
  assert.match(navigate, /selectedCaptureIndex\.value = index/)
})

test('native capture keeps camera temp paths until finish, then persists through the injected service', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.match(page, /appendCapturedMedia\(shotPaths, 'image', 0, shutterRotation\)/)
  assert.match(page, /capturedPaths\.value = appendCapturePaths\(capturedPaths\.value, \[path\]\)/)
  assert.match(page, /import \{ createAppMediaPersistenceService \} from '\.\.\/\.\.\/services\/mediaPersistenceService\.uts'/)
  assert.match(page, /const mediaPersistenceService = createAppMediaPersistenceService\(\)/)
  const shutter = page.split('function takePhoto()')[1].split('function captureFromSystemCamera()')[0]
  assert.doesNotMatch(shutter, /persistMediaPath|copyFile|saveFile/)
  // 画质要求：应用内快门必须按原图画质拍摄，不能沿用 high 这类有损档位。
  assert.match(shutter, /quality: 'original'/)
  assert.doesNotMatch(shutter, /quality: 'high'|quality: 'normal'|quality: 'low'/)
  const finish = page.split('async function handleFinishCapture')[1].split('function handleCancelCapture')[0]
  assert.match(finish, /await mediaPersistenceService\.persistMediaPath\(/)
  assert.match(finish, /emitCaptureResult\(false, savedPaths\)/)
  assert.doesNotMatch(page, /cameraCaptureRepository|initializeRuntime/)
  assert.doesNotMatch(page, /captureSessionId|notifyPersistFailure/)
})

test('standalone camera returns persisted local paths through both event and setImage', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.match(page, /emitCaptureResult\(false, savedPaths\)/)
  assert.match(page, /goBackWithResult\(savedPaths\)/)
  assert.doesNotMatch(page, /const savedPaths = capturedPaths\.value\.slice\(\)/)
  assert.match(page, /\$callMethod\('setImage', \{ path: savedPaths\[0\], paths: savedPaths \}\)/)
  assert.match(page, /uni\.\$emit\(buildCameraCaptureEventName\(requestId\.value\)/)
})

test('camera preview uses the already written editor image and replaces the strip and finish paths', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /<canvas/)
  assert.match(editor, /createCanvasContextAsync/)
  assert.match(editor, /function renderEditor\(rc: CanvasRenderingContext2D/)
  assert.match(editor, /toDataURL\(/)
  // 编辑结果必须是已落盘的可上传 jpg：PNG 只作转码输入放缓存目录，最终经持久化链路写入 inspection_media。
  assert.match(editor, /CACHE_PATH/)
  assert.match(editor, /persistMediaPath\(jpegPath, false\)/)
  assert.match(page, /replaceCapturePath\(capturedPaths\.value, index, localPath\)/)
  assert.doesNotMatch(page, /await persistCapturePath\(|cameraCaptureRepository\.saveAll\(/)
  assert.match(page, /goBackWithResult\(savedPaths\)/)
  assert.doesNotMatch(page, /canvasToTempFilePath\(/)
})

/** 外部系统相机临时抢占摄像头后，自定义取景必须在返回页面时重建，不能把超时误判为权限拒绝。 */
test('system camera return remounts the native camera and suspends its ready watchdog while away', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.match(page, /<camera v-if="cameraMounted" :key="cameraSession"/)
  assert.match(page, /externalCameraPending = true/)
  assert.match(page, /externalCameraPending = true\s*cameraMounted\.value = false/)
  assert.match(page, /if \(!disposed && externalCameraPending && cameraPageVisible\) resumeCameraAfterSystemCapture\(\)/)
  assert.match(page, /onHide\(\(\) => \{[\s\S]*?clearReadyFallbackTimer\(\)[\s\S]*?cameraMounted\.value = false/)
  assert.match(page, /onShow\(\(\) => \{[\s\S]*?if \(!externalCameraPending\) return[\s\S]*?resumeCameraAfterSystemCapture\(\)/)
  assert.match(page, /function resumeCameraAfterSystemCapture\(\): void \{[\s\S]*?cameraSession\.value \+= 1[\s\S]*?cameraMounted\.value = true/)
  assert.match(page, /if \(disposed \|\| externalCameraPending\) return/)
  assert.doesNotMatch(page.split('function armCameraReadyFallback()')[1].split('function stopRecordingTimer()')[0], /检查系统相机权限/)
})

test('standalone camera offers a system camera entry that reuses the same capture pipeline', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const service = await readFile('services/mediaPersistenceService.uts', 'utf8')

  assert.match(page, /import AppButton from '\.\.\/\.\.\/components\/common\/AppButton\.uvue'/)
  assert.match(page, /@press="captureFromSystemCamera"/)
  assert.match(page, /translateText\('系统拍照'\)/)
  assert.match(page, /class="system-camera-entry"/)
  assert.match(page, /:disabled="systemCameraDisabled"/)

  // 系统拍照与应用内相机共用同一条后置链路：先追加到拍摄清单，只在“完成”时统一落盘。
  const entry = page.split('function captureFromSystemCamera()')[1].split('function removeCapture(')[0]
  assert.match(entry, /sourceType: \['camera'\]/)
  assert.match(entry, /sizeType: \['original'\]/)
  assert.match(entry, /appendCapturedMedia\(shotPaths, 'image', 0\)/)
  assert.doesNotMatch(entry, /persistMediaPath|copyFile|saveFile|USER_DATA_PATH/)

  // 自定义相机使用 takePhoto 原始临时路径；系统相机路径仍按原有规则保存。
  assert.match(service, /isExternalStorageMediaPath/)
  assert.match(service, /needsPersistentMediaCopy/)
  assert.doesNotMatch(service, /compressImage|moveIntoSandbox/)
})
