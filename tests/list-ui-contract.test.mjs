import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('list page does not enable pull-to-refresh', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')

  assert.doesNotMatch(source, /refresher-enabled/)
  assert.doesNotMatch(source, /refresher-triggered/)
  assert.doesNotMatch(source, /@refresherrefresh/)
})

test('plan card uses the filled download icon instead of the outline glyph', async () => {
  const iconSource = await readFile('components/icons/AppIcon.uvue', 'utf8')
  const cardSource = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')

  assert.match(iconSource, /downloadFilled/)
  assert.match(cardSource, /'downloadFilled'/)
  assert.match(cardSource, /\.download-icon-wrapper\s*\{[^}]*border-radius:\s*16rpx/s)
  assert.match(cardSource, /\.card-left\s*\{[^}]*overflow:\s*visible/s)
  assert.match(cardSource, /\.download-icon-wrapper\s*\{[^}]*left:\s*0/s)
})

/** 卡片先通过本地优先服务缓存线上详情，再导航到本地详情页。 */
test('plan card caches uncached online detail before navigation', async () => {
  const cardSource = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const detailSource = await readFile('pages/report/detail.uvue', 'utf8')
  const iconSource = await readFile('components/icons/AppIcon.uvue', 'utf8')
  const pagesSource = JSON.parse(await readFile('pages.json', 'utf8'))

  assert.match(cardSource, /resolveCardClickAction/)
  assert.match(cardSource, /await inspectionDetailService\.loadDetail\(planId\)/)
  assert.match(cardSource, /uni\.navigateTo\(\{\s*url:\s*`\/pages\/report\/detail\?planId=/s)
  assert.doesNotMatch(cardSource, /showContinueTip|showReportTip|showDetailModal/)
  assert.match(detailSource, /<InspectionDetailHeader/)
  assert.match(detailSource, /inspectionDetailService\.loadDetail/)
  assert.match(iconSource, /props\.type === 'back'/)
  assert.equal(pagesSource.pages.some((page) => page.path === 'pages/report/detail'), true)
})

/** 列表只以 SQLite 报告记录判定本地缓存，不依赖线上下载时间字段。 */
test('list distinguishes remote rows with download timestamps from stored local plans', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')

  assert.match(source, /:is-local-downloaded="isStoredLocally\(item\)"/)
  assert.match(source, /function isStoredLocally\(item\)/)
  assert.doesNotMatch(source, /:is-local-downloaded="Boolean\(item\?\.downloadedAt\)"/)
})

test('list keeps H5 remote cache when local data refreshes after card click', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')

  assert.match(source, /remoteListMap/)
  assert.match(source, /localPlans/)
  assert.match(source, /mergePlansLocalFirst/)
  assert.match(source, /listPlanSummaries/)
  assert.doesNotMatch(source, /async function refreshLocalList\(\)[\s\S]*?loadPage\(1, \{ remote: false/)
})

test('list has an all-local SQLite tab with raw report rows and no remote pagination', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const record = await readFile('components/inspection/LocalReportRecord.uvue', 'utf8')

  assert.match(source, /key: 'local', label: '本地下载'/)
  assert.match(source, /reportRepository\.listStoredReportRows\(\)/)
  assert.match(source, /activeTab === 'local'[\s\S]*?<LocalReportRecord/)
  assert.match(source, /v-if="activeTab !== 'local' && !loading" class="pagination-bar"/)
  assert.match(source, /if \(activeTab\.value === 'local'\) \{[\s\S]*?await refreshLocalList\(\)/)
  assert.match(record, /JSON\.stringify\(props\.row, null, 2\)/)
  assert.match(record, /完整 SQLite 数据/)
})

test('list FAB completes the H5 merge inspection workflow', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const iconSource = await readFile('components/icons/AppIcon.uvue', 'utf8')

  assert.match(source, /import MergePlanSheet/)
  assert.match(source, /:selection-mode="mergeMode"/)
  assert.match(source, /:selection-checked="isMergeChecked\(item\)"/)
  assert.match(source, /:selection-disabled="mergeMode && !isMergeSelectableItem\(item\)"/)
  assert.match(source, /@merge-toggle="toggleMergeSelect"/)
  assert.match(source, /class="merge-mode-bar"/)
  assert.match(source, /<MergePlanSheet/)
  assert.match(source, /planApi\.getInspectTypeDict/)
  assert.match(source, /planOperationService\.mergePlans/)
  assert.match(source, /planOperationService\.downloadToLocal/)
  assert.match(source, /function openMergeFlow/)
  assert.match(source, /function cancelMergeMode/)
  assert.doesNotMatch(source, /function showMergeTip/)
  assert.ok(iconSource.includes("if (props.type === 'merge') return '\\ue633'"))
})
