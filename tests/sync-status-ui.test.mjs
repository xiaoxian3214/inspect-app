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

/** 闲置与待同步只显示云朵，上传过程中才叠加箭头。 */
test('sync cloud keeps its upload arrow exclusive to active uploads', async () => {
  const status = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  const cloud = await readFile('components/sync/SyncCloudShape.uvue', 'utf8')
  assert.match(status, /<SyncCloudShape :color="iconColor"\s*\/>/)
  assert.match(status, /<view v-if="isUploading" class="sync-upload-arrow"/)
  assert.match(status, /class="sync-arrow-shaft"/)
  assert.match(status, /class="sync-arrow-head"/)
  assert.doesNotMatch(status, /<AppIcon type="arrowDown"/)
  assert.doesNotMatch(status, /<AppIcon type="cloudUpload"/)
  assert.match(cloud, /class="cloud-base"/)
  assert.match(cloud, /\.cloud-base \{[^}]*border-width: 2px;/)
  assert.match(cloud, /\.cloud-crown \{[^}]*border-width: 2px;/)
  assert.doesNotMatch(cloud, /backgroundColor: color/)
  assert.doesNotMatch(cloud, /<svg|document\.|window\./)
})

/** 对照 H5 的 24×24 SVG，云朵保留外围留白，上传箭头用相同颜色的细线绘制。 */
test('native sync cloud follows the H5 cloud and arrow proportions', async () => {
  const cloud = await readFile('components/sync/SyncCloudShape.uvue', 'utf8')
  const status = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  assert.match(cloud, /\.cloud-shape \{[^}]*width: 24px; height: 24px;/)
  assert.match(cloud, /\.cloud-base \{[^}]*left: 3px; top: 9px; width: 18px; height: 10px;/)
  assert.match(cloud, /\.cloud-crown \{[^}]*left: 7px; top: 5px; width: 10px;/)
  assert.match(status, /\.sync-arrow-shaft \{[^}]*background-color: #ffffff;/)
  assert.match(status, /\.sync-arrow-head \{[^}]*border-color: #ffffff;/)
  assert.match(status, /\.sync-arrow-head \{[^}]*border-right-width: 0; border-bottom-width: 0;/)
})

/** 空心云的底边、云顶和遮盖层共用水平中心，避免图标向一侧偏斜。 */
test('outlined cloud layers align on one horizontal center', async () => {
  const cloud = await readFile('components/sync/SyncCloudShape.uvue', 'utf8')
  const centerOf = (name) => {
    const style = cloud.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? ''
    const left = Number(style.match(/left: (\d+)px/)?.[1])
    const width = Number(style.match(/width: (\d+)px/)?.[1])
    assert.ok(Number.isFinite(left) && Number.isFinite(width), `${name} needs numeric bounds`)
    return left + width / 2
  }
  const center = centerOf('cloud-base')
  assert.equal(centerOf('cloud-crown'), center)
  assert.equal(centerOf('cloud-notch'), center)
  assert.equal(centerOf('cloud-crown-cover'), center)
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
