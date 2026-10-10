import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 搜索结果中的合并下载同样须把已选成员卡片持久化。 */
test('merged search download forwards selected member cards', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  const action = source.split('async function downloadMergedPlan()')[1]?.split('async function ')[0] ?? ''
  assert.match(action, /planOperationService\.downloadToLocal\(mergedPlanId\.value,[\s\S]*?\[\], mergeSelectedItems\.value\)/)
})

test('search page wires reusable sheets and complete H5 operations', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')

  for (const component of ['SearchFilterSheet', 'MergePlanSheet', 'SplitPlanSheet', 'CopyPlanSheet']) {
    assert.match(source, new RegExp(`import ${component}`))
    assert.match(source, new RegExp(`<${component}`))
  }
  assert.match(source, /buildSearchParams/)
  assert.match(source, /planOperationService/)
  assert.match(source, /startDate/)
  assert.match(source, /endDate/)
  assert.match(source, /@action-unlock=/)
  assert.match(source, /@action-copy=/)
  assert.match(source, /@action-copy-merged=/)
  assert.match(source, /@action-split=/)
  assert.doesNotMatch(source, /refresher-enabled/)
})

test('inspection card exposes semantic remote-operation and merge-selection events', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')

  for (const eventName of ['action-unlock', 'action-copy', 'action-copy-merged', 'action-split', 'merge-toggle']) {
    assert.match(source, new RegExp(`['\"]${eventName}['\"]`))
  }
  assert.match(source, /selectionMode/)
  assert.match(source, /selectionDisabled/)
})

test('search operation sheets exist as separate reusable components', async () => {
  const paths = [
    'components/search/SearchFilterSheet.uvue',
    'components/search/MergePlanSheet.uvue',
    'components/search/SplitPlanSheet.uvue',
    'components/search/CopyPlanSheet.uvue'
  ]
  for (const path of paths) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /defineProps/)
    assert.match(source, /defineEmits/)
  }
})

/** 列表和搜索共用的合并确认弹层展示 H5 三列表格，而不是摘要卡片。 */
test('merge confirmation sheet renders order, item batch and product table', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  assert.match(source, /确认合并以下验货数据/)
  assert.match(source, /class="merge-table-header"[\s\S]*?t\('单号'\)[\s\S]*?t\('款号#批次'\)[\s\S]*?t\('产品名称'\)/)
  assert.match(source, /v-for="row in previewRows"[\s\S]*?row\.orderNo[\s\S]*?row\.itemBatch[\s\S]*?row\.productName/)
  assert.match(source, /getMergePreviewRow\(item\)/)
  assert.doesNotMatch(source, /class="preview-item"/)
  assert.doesNotMatch(source, /<table\b|<thead\b|<td\b/)
})

/** 搜索页从右下角加号进入合并，复用底部菜单、分组复选与操作栏。 */
test('search merge flow uses H5 floating entry and group selection', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  assert.doesNotMatch(source, /class="toolbar-btn merge"/)
  assert.match(source, /class="fab" @click="showActionMenu"/)
  assert.match(source, /<BottomActionSheet[\s\S]*?@select="handleFabAction"/)
  assert.match(source, /class="group-select-all"[\s\S]*?@change="toggleGroupSelectAll\(group\)"/)
  assert.match(source, /class="merge-action-bar"/)
  assert.match(source, /getMergedPlanId\(response\)/)
  assert.match(source, /markMergedSourcePlans\(results\.value, sourcePlanIds, mergedPlanId\.value\)/)
  assert.match(source, /if \(mergeTemplateId\.value === ''\)/)
})

/** 搜索页分组全选复用列表页的选中与禁用状态视觉。 */
test('search group checkbox has a solid disabled background and selected state', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  assert.match(source, /class="group-select-all" :class="\{ selected: isGroupAllSelected\(group\), disabled: !canGroupSelectAll\(group\) \}"/)
  assert.match(source, /v-if="!canGroupSelectAll\(group\)" class="group-disabled-mark"/)
  assert.match(source, /\.group-select-all\.selected\s*\{[^}]*background-color:\s*#ecfdf5/s)
  assert.match(source, /\.group-select-all\.disabled\s*\{[^}]*background-color:\s*#cbd5e1/s)
})

/** 搜索页解锁、重置应经同一服务处理整个合并组。 */
test('search release actions update every merged sibling', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.match(card, /emit\('action-reset', props\.item\)/)
  assert.match(source, /@action-reset="handleReset"/)
  assert.match(source, /planOperationService\.resetPlan\(item\)/)
  assert.match(source, /markReleasedGroupPlans\(results\.value, response\?\.removedIds, response\?\.parentPlanId\)/)
})

/** 搜索页拆分结果下载应保留原卡片字段。 */
test('search split download forwards its original card', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  assert.match(source, /planOperationService\.downloadToLocal\(planId,[\s\S]*?\}, \[\], \[item\]\)/)
})

/** 搜索页也必须在打开预览和真正拆分前阻止离线调用。 */
test('search split workflow rejects offline operations', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')
  assert.match(source, /async function openSplitPreview\(item\)[\s\S]*?await isNetworkOnline\(\)/)
  assert.match(source, /async function confirmSplit\(\)[\s\S]*?await isNetworkOnline\(\)[\s\S]*?planOperationService\.splitPlan/)
})

/** 拆分前后共用带网格线的三列成员表，拆分结果保留逐条下载操作。 */
test('split preview and result use bordered member table', async () => {
  const sheet = await readFile('components/search/SplitPlanSheet.uvue', 'utf8')
  const table = await readFile('components/inspection/PlanMemberTable.uvue', 'utf8')
  assert.match(sheet, /<PlanMemberTable[^>]*:items="displayItems"[^>]*:downloadable="resultItems\.length > 0"[^>]*@download="downloadItem"/)
  assert.match(sheet, /:localized-headers="true"/)
  assert.match(table, /localizedHeaders: \{ type: Boolean, default: false \}/)
  assert.doesNotMatch(sheet, /getItemSubtitle|未命名产品/)
  assert.match(table, /class="member-cell member-heading cell-divider"/)
  assert.match(table, /class="member-cell cell-divider"/)
  assert.match(table, /\.cell-divider\s*\{[^}]*border-right-width:\s*2rpx/s)
  assert.match(table, /\.member-row\s*\{[^}]*border-top-width:\s*2rpx/s)
  assert.match(table, /emit\('download', item\)/)
})

/** 复制弹层提供 H5 七行字段和合并成员表格，并用原生组件选择清单与检查类型。 */
test('copy sheet matches H5 details and uses selection sheets', async () => {
  const source = await readFile('components/search/CopyPlanSheet.uvue', 'utf8')
  const selector = await readFile('components/search/OptionSelectSheet.uvue', 'utf8')
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const search = await readFile('pages/report/search.uvue', 'utf8')
  assert.match(source, /v-if="mode === 2"[\s\S]*?<PlanMemberTable/)
  assert.match(source, /v-for="field in infoFields"/)
  assert.match(source, /<OptionSelectSheet[\s\S]*?@confirm="confirmOption"/)
  assert.match(source, /selectedTemplateName: \{ type: String, default: '' \}/)
  assert.match(source, /props\.selectedTemplateName/)
  assert.match(card, /:selected-template-name="copyTemplateName"/)
  assert.match(search, /:selected-template-name="copyTemplateName"/)
  assert.doesNotMatch(source, /<picker\b/)
  assert.match(selector, /scroll-view[\s\S]*?v-for="option in options"/)
  assert.match(selector, /defineEmits\(\['close', 'confirm'\]\)/)
  assert.match(card, /:merged-items="copyMergedItems"/)
  assert.match(card, /loadCopyMergedItems\(\)/)
  assert.match(search, /:merged-items="copyMergedItems"/)
  assert.match(search, /loadCopyMergedItems\(item\)/)
})

/** 合并下载详情始终显示带英文表头的成员表格。 */
test('merged download shows H5 Order Item Name table', async () => {
  const details = await readFile('components/inspection/PlanDownloadDetails.uvue', 'utf8')
  const table = await readFile('components/inspection/PlanMemberTable.uvue', 'utf8')
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.match(details, /v-if="isMerged"[\s\S]*?<PlanMemberTable/)
  assert.match(card, /<PlanDownloadDetails[^>]*:is-merged="isMerged"/)
  for (const heading of ['Order', 'Item', 'Name']) assert.match(table, new RegExp(`: '${heading}'`))
  assert.match(table, /getMergePreviewRow\(item\)/)
  assert.doesNotMatch(table, /<table\b|<thead\b|<td\b/)
})
