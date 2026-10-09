import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('runtime uses lime-sqlite rather than qcm native SQLite or uniStorage', async () => {
  const runtime = await readFile('runtime/appRuntime.uts', 'utf8')
  const driver = await readFile('database/limeSqliteDriver.uts', 'utf8')
  const debugPage = await readFile('pages/debug/database.uvue', 'utf8')
  assert.match(runtime, /createSqliteDatabase/)
  assert.match(runtime, /createLimeSqliteDriver/)
  assert.match(driver, /from '@\/uni_modules\/lime-sqlite'/)
  assert.doesNotMatch(runtime + driver, /qcm-native-sqlite/)
  assert.doesNotMatch(runtime, /createUniStorageDatabase/)
  assert.match(debugPage, /当前实际存储引擎：SQLite/)
})

test('camera pages use xview and persisted detail media does not silently keep failed temp paths', async () => {
  const camera = await readFile('pages/report/camera.uvue', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(camera, /<xview-camera-view/)
  assert.doesNotMatch(camera, /qcm-native-camera/)
  assert.doesNotMatch(detail, /fail:\s*\(\)\s*=>\s*resolve\(tempPath\)/)
})

test('catalog and UI preferences no longer write business state into uniStorage', async () => {
  const runtime = await readFile('runtime/appRuntime.uts', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const login = await readFile('pages/login/login.uvue', 'utf8')
  const category = await readFile('components/detail/DefectCategorySheet.uvue', 'utf8')
  for (const source of [runtime, list, login, category]) assert.doesNotMatch(source, /uni\.setStorageSync/)
  assert.match(runtime, /createAppSettingsRepository/)
})

test('uploaded images fall back to remote previews when a legacy local path is missing', async () => {
  const mediaImage = await readFile('components/detail/InspectionMediaImage.uvue', 'utf8')
  assert.match(mediaImage, /@error="handleImageError"/)
  assert.match(mediaImage, /localPath:\s*''/)
})
