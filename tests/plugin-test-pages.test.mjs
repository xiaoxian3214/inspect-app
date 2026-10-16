import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

test('lime sqlite test page exercises the installed plugin API', async () => {
  const page = await readFile('pages/debug/lime-sqlite.uvue', 'utf8')
  const pages = await readFile('pages.json', 'utf8')

  assert.match(pages, /pages\/debug\/lime-sqlite/)
  assert.match(page, /from '@\/uni_modules\/lime-sqlite'/)
  assert.match(page, /openDatabase/)
  assert.match(page, /executeSql/)
  assert.match(page, /selectSql/)
  assert.match(page, /closeDatabase/)
  assert.match(page, /getDatabasePath/)
  assert.match(page, /CREATE TABLE IF NOT EXISTS plugin_test/)
  assert.match(page, /INSERT INTO plugin_test/)
  assert.match(page, /DELETE FROM plugin_test/)
  assert.ok(page.indexOf('function queryTestRows()') < page.indexOf('function insertTestRow()'))
  assert.doesNotMatch(page, /\bString\s*\(/)
})

test('home page links both plugin test pages above logout', async () => {
  const page = await readFile('pages/index/index.uvue', 'utf8')

  assert.match(page, /lime-sqlite 插件测试/)
  assert.match(page, /xview-camera-view 插件测试/)
  assert.match(page, /openPluginTest\('\/pages\/debug\/lime-sqlite'\)/)
  assert.match(page, /openPluginTest\('\/pages\/debug\/xview-camera'\)/)
  assert.match(page, /lime-sqlite 插件测试[\s\S]*xview-camera-view 插件测试[\s\S]*退出登录/)
})

test('legacy qcm native plugins are removed from the project', async () => {
  const runtime = await readFile('runtime/appRuntime.uts', 'utf8')

  await assert.rejects(access('uni_modules/qcm-native-sqlite'))
  await assert.rejects(access('uni_modules/qcm-native-camera'))
  assert.doesNotMatch(runtime, /qcm-native-(sqlite|camera)/)
})
