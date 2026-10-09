import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('list local-data action opens the live database table browser', async () => {
  const listPage = await readFile('pages/report/list.uvue', 'utf8')
  const debugPage = await readFile('pages/debug/database.uvue', 'utf8')
  const pagesConfig = await readFile('pages.json', 'utf8')

  assert.match(listPage, /pages\/debug\/database/)
  assert.match(debugPage, /getLocalDatabaseSnapshot/)
  assert.match(debugPage, /report/)
  assert.match(debugPage, /checklist/)
  assert.match(debugPage, /photo/)
  assert.match(pagesConfig, /pages\/debug\/database/)
})
