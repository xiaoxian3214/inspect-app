import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('cloud sync status renders unified queue details on list and detail pages', async () => {
  const status = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  const listPage = await readFile('pages/report/list.uvue', 'utf8')
  const detailPage = await readFile('pages/report/detail.uvue', 'utf8')
  const detailHeader = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')

  assert.match(status, /queueItems/)
  assert.match(status, /待同步队列/)
  assert.match(status, /item\.syncType/)
  assert.match(status, /item\.content/)
  assert.match(status, /item\.meta/)
  assert.match(listPage, /:queue-items="pendingSyncItems"/)
  assert.match(detailPage, /:sync-queue-items="pendingSyncItems"/)
  assert.match(detailHeader, /:queue-items="syncQueueItems"/)
})
