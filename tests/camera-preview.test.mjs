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
  assert.match(editor, /drawAnnotationToCanvas/)
  assert.match(editor, /toDataURL\(/)
  assert.match(editor, /USER_DATA_PATH/)
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
