import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('list local-data action opens the live database table browser', async () => {
  const listPage = await readFile('pages/report/list.uvue', 'utf8')
  const debugPage = await readFile('pages/debug/database.uvue', 'utf8')
  const pagesConfig = await readFile('pages.json', 'utf8')

  assert.match(listPage, /pages\/debug\/database/)
  assert.match(debugPage, /getLocalDatabaseSnapshot/)
  assert.match(debugPage, /qcm_inspection_plan/)
  assert.match(debugPage, /qcm_inspection_report/)
  assert.match(debugPage, /qcm_inspection_item_result/)
  assert.match(debugPage, /qcm_inspection_defect_record/)
  assert.doesNotMatch(debugPage, /'report_group'|'report_member'|'checklist'/)
  assert.match(debugPage, /photo/)
  assert.match(debugPage, /<picker[^>]*:range="tableOptions"[^>]*:value="activeTableIndex"[^>]*@change="changeTable"/)
  assert.match(debugPage, /tableOptions = computed\(\(\) => tables\.value\.map\(/)
  assert.match(debugPage, /TABLE_ORDER\[index\]/)
  assert.doesNotMatch(debugPage, /tabRowWidth|direction="horizontal"|direction="horizontal"/)
  assert.match(pagesConfig, /pages\/debug\/database/)
})
