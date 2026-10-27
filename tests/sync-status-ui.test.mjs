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

/** 云图标改用 Uni Icons 字体：闲置显示空心云上传图标，同步中切换为实心云上传图标并呼吸闪烁。 */
test('sync cloud uses uni-icons glyphs and switches between outline and filled', async () => {
  const status = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  const icon = await readFile('components/icons/AppIcon.uvue', 'utf8')
  assert.match(status, /const isArrowActive = computed\(\(\) => props\.isSyncing \|\| props\.isUploading\)/)
  assert.match(status, /<AppIcon :type="isArrowActive \? 'cloudUploadFilled' : 'cloudUpload'"/)
  assert.match(status, /opacity: isArrowActive \? \(arrowLit \? 1 : 0\.35\) : 1/)
  assert.match(icon, /if \(props\.type === 'cloudUpload'\) return '\\ue645'/)
  assert.match(icon, /if \(props\.type === 'cloudUploadFilled'\) return '\\ue648'/)
  assert.doesNotMatch(status, /SyncCloudShape/)
  assert.doesNotMatch(status, /sync-arrow-shaft|sync-upload-arrow/)
  assert.doesNotMatch(status, /<AppIcon type="arrowDown"/)
})

/** 详情加载时不展示临时提示卡，同时保留失败重试和数据渲染。 */
test('detail page does not show a loading message before its content', async () => {
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  assert.doesNotMatch(detail, /正在加载验货详情/)
  assert.match(detail, /v-if="!loading && errorMessage !== ''"/)
  assert.match(detail, /v-else-if="!loading && detail != null"/)
  assert.match(detail, /@click="loadDetail"/)
})

test('cloud sync timers and watcher callbacks declare native-compatible types', async () => {
  const status = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  assert.match(status, /let autoHideTimer: number \| null = null/)
  assert.match(status, /let uploadAnimationTimer: number \| null = null/)
  assert.match(status, /function handleUploadingChange\(uploading: boolean\)/)
  assert.match(status, /function handlePendingCountChange\(value: number\)/)
  assert.doesNotMatch(status, /String\(props\.pendingCount\)/)
  assert.match(status, /displayQueueItems = computed\(\(\): SyncQueueRow\[\]/)
  assert.match(status, /function translateText\(key: string\): string/)
  assert.doesNotMatch(status, /\{\{ t\(/)
})
