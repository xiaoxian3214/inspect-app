import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 合并下载须传入选中的卡片，才能分别保存成员的完整离线列表信息。 */
test('merged list download forwards selected member cards', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const action = source.split('async function downloadMergedPlan()')[1]?.split('async function openSplitPreview')[0] ?? ''
  assert.match(action, /planOperationService\.downloadToLocal\(mergedPlanId\.value,[\s\S]*?\[\], mergeSelectedItems\.value\)/)
})

/** 选中页签用真实视图渲染白色底部选中条，而非依赖不可见的边框。 */
test('active list tab shows a visible bottom indicator', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  assert.match(source, /<view v-if="activeTab === tab\.key" class="tab-indicator"><\/view>/)
  assert.match(source, /\.tab-indicator\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0;[^}]*height:\s*6rpx;[^}]*background-color:\s*#ffffff/s)
})

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

/** 合并标识使用 H5 轮廓生成的透明 PNG，避免原生线段拼接走形。 */
test('merged plan badge uses a native raster asset matching the H5 arrow', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const icon = await readFile('components/icons/MergePlanIcon.uvue', 'utf8')
  const image = await readFile('static/icons/merge-plan.png')
  assert.match(card, /<MergePlanIcon\s*\/>/)
  assert.match(icon, /<image[^>]*src="\/static\/icons\/merge-plan\.png"/)
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(image.readUInt32BE(16), 128)
  assert.equal(image.readUInt32BE(20), 128)
  assert.doesNotMatch(icon, /merge-segment/)
  assert.doesNotMatch(icon, /<svg|<path|document\.|window\./)
})

/** 卡片标识内的合并箭头放大，更多按钮改为三个原生实心圆点。 */
test('plan card uses enlarged merge glyph and solid more dots', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const mergeIcon = await readFile('components/icons/MergePlanIcon.uvue', 'utf8')
  const moreIcon = await readFile('components/icons/MoreDotsIcon.uvue', 'utf8')
  assert.match(mergeIcon, /\.merge-plan-icon\s*\{[^}]*width:\s*32rpx;\s*height:\s*32rpx/s)
  assert.match(card, /class="card-more-btn"[^>]*>[\s\S]*?<MoreDotsIcon\s*\/>/)
  assert.equal((moreIcon.match(/class="more-dot"/g) ?? []).length, 3)
  assert.match(moreIcon, /\.more-dot\s*\{[^}]*background-color:\s*#64748b/s)
  assert.doesNotMatch(moreIcon, /<svg|<path|document\.|window\./)
})

/** 已报告计划的卡片状态直接展示“报告”，不改变其状态分组。 */
test('plan card labels status three as report', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.match(source, /status\.value === 3 \? '报告'/)
})

/** 确认弹层不应受下载弹层的显示状态控制。 */
test('unlock and reset confirmation overlays are independent of the download overlay', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const viewTags = template.match(/<view\b[^>]*>|<\/view>/g) ?? []
  const openViews = []
  const confirmationOverlays = new Set()

  for (const tag of viewTags) {
    if (tag === '</view>') {
      openViews.pop()
      continue
    }
    const condition = tag.match(/\bv-if="([^"]+)"/)?.[1] ?? ''
    if (condition === 'showUnlockModal' || condition === 'showResetModal') {
      confirmationOverlays.add(condition)
      assert.equal(openViews.includes('showDownloadModal'), false,
        `${condition} must not depend on showDownloadModal`)
    }
    openViews.push(condition)
  }

  assert.deepEqual([...confirmationOverlays].sort(), ['showResetModal', 'showUnlockModal'])
  assert.equal(openViews.length, 0)
})

/** 解锁或重置成功时卡片应通知列表移除缓存，而非仅重读 SQLite。 */
test('list immediately removes released card rows from local and remote caches', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')

  assert.match(card, /const response = await planOperationService\.unlockPlan\(props\.item\)[\s\S]*?emit\('released', response\)/)
  assert.match(card, /const response = await planOperationService\.resetPlan\(props\.item\)[\s\S]*?emit\('released', response\)/)
  assert.match(list, /@released="handleCardReleased"/)
  assert.match(list, /function handleCardReleased\(payload[^)]*\)[\s\S]*?localPlans\.value = filterReleasedPlans\(/)
  assert.match(list, /function handleCardReleased\(payload[^)]*\)[\s\S]*?remoteListMap\[tab\.key\] = filterReleasedPlans\(/)
})

/** 下载时将当前卡片或合并成员传给保存服务，避免刷新后丢失展示字段。 */
test('plan card passes original list items into download persistence', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')

  assert.match(card, /planDownloadService\.downloadToLocal\(downloadPlanId,[\s\S]*?isMerged\.value \? downloadMergedItems\.value : \[props\.item\]\)/)
})

/**
 * 解析 pages.json：HBuilderX 运行时会写入 // #ifdef 条件编译注释，需先剥离注释再做 JSON 解析。
 * @param source pages.json 原文
 * @returns 解析后的配置对象
 */
function parsePagesConfig(source) {
  return JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))
}

/** 本机未下载的卡片不得通过详情接口绕开下载弹框直接导航。 */
test('plan card requires local download before detail navigation', async () => {
  const cardSource = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const detailSource = await readFile('pages/report/detail.uvue', 'utf8')
  const iconSource = await readFile('components/icons/AppIcon.uvue', 'utf8')
  const pagesSource = parsePagesConfig(await readFile('pages.json', 'utf8'))

  assert.match(cardSource, /resolveCardClickAction/)
  assert.match(cardSource, /if \(action === 'open-download'\) return openDownloadModal\(\)/)
  assert.doesNotMatch(cardSource, /inspectionDetailService\.loadDetail|recoverLocalDetailAndOpen/)
  assert.match(cardSource, /function openDetailPage\(\)[\s\S]*?if \(!props\.isLocalDownloaded\)/)
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
  assert.match(source, /function isStoredLocally\(item: UTSJSONObject\)/)
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

/** “加载更多”按 H5 重新请求第一页，翻页按钮才改变远程页码。 */
test('list load-more refreshes page one while next-page advances separately', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const loadMore = source.match(/async function loadMore\(\)[^{]*\{([\s\S]*?)\n\t\}/)?.[1] ?? ''

  assert.match(loadMore, /await loadPage\(1, \{ remote: true, appendMessage: true, loadingMore: true \}\)/)
  assert.doesNotMatch(loadMore, /currentPage\.value|totalPages\.value/)
  assert.match(source, /const useLoadingMore = options\?\.loadingMore === true \|\|/)
  assert.match(source, /async function loadNextPage\(\)[\s\S]*?await loadPage\(currentPage\.value \+ 1, \{ remote: true, appendMessage: true \}\)/)
})

/** 信息弹框每一项下方都应有明显分割线，覆盖复制、下载及卡片详情。 */
test('plan information sheets show a divider under every row', async () => {
  for (const file of ['components/search/CopyPlanSheet.uvue', 'components/inspection/PlanDownloadDetails.uvue', 'components/inspection/InspectionPlanCard.uvue']) {
    const source = await readFile(file, 'utf8')
    assert.match(source, /\.(?:copy-)?info-row\s*\{[^}]*border-bottom(?:-width)?:\s*2rpx/s, file)
  }
})

test('list has an all-local SQLite tab with individual plan rows and no remote pagination', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const record = await readFile('components/inspection/LocalReportRecord.uvue', 'utf8')

  assert.match(source, /key: 'local', label: '本地下载'/)
  assert.match(source, /reportRepository\.listStoredInspectionPlanRows\(\)/)
  assert.match(source, /activeTab === 'local'[\s\S]*?<LocalReportRecord/)
  assert.match(source, /v-if="activeTab !== 'local' && !loading" class="pagination-bar"/)
  assert.match(source, /if \(activeTab\.value === 'local'\) \{[\s\S]*?await refreshLocalList\(\)/)
  assert.match(record, /JSON\.stringify\(props\.row\.data, null, 2\)/)
  assert.match(record, /验货计划原始行/)
})

/** 大体积 SQLite JSON 复制失败时提示原因，同时提供短诊断内容供用户反馈。 */
test('local report record exposes compact diagnostic copy and full copy failure feedback', async () => {
  const record = await readFile('components/inspection/LocalReportRecord.uvue', 'utf8')
  assert.match(record, /<view class="record-action" @click="copyDiagnostic">/)
  assert.match(record, /buildLocalReportDiagnostic\(props\.row\)/)
  assert.match(record, /<view v-if="expanded" class="record-action" @click="copyRawData">/)
  assert.match(record, /uni\.setClipboardData\(\{[\s\S]*?fail: \(error\) =>/)
})

/** 完整 JSON 可绕过单次剪贴板复制，通过 App 本地文件交给系统分享。 */
test('local report record can share its complete JSON as a native file', async () => {
  const record = await readFile('components/inspection/LocalReportRecord.uvue', 'utf8')
  assert.match(record, /<view v-if="expanded" class="record-action" @click="shareRawData">/)
  assert.match(record, /uni\.env\.USER_DATA_PATH/)
  assert.match(record, /uni\.getFileSystemManager\(\)\.writeFile\(\{[\s\S]*?data: rawData\.value/)
  assert.match(record, /uni\.shareWithSystem\(\{\s*type: 'file',\s*filePaths: \[filePath\]/)
  assert.match(record, /fail: \(error\) =>/)
})

test('list FAB completes the H5 merge inspection workflow', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const iconSource = await readFile('components/icons/AppIcon.uvue', 'utf8')

  assert.match(source, /import MergePlanSheet/)
  assert.match(source, /:selection-mode="mergeMode"/)
  assert.match(source, /:selection-checked="isMergeChecked\(item\)"/)
  assert.match(source, /:selection-disabled="mergeMode && !isMergeSelectableItem\(item\)"/)
  assert.match(source, /@merge-toggle="toggleMergeSelect"/)
  assert.match(source, /class="merge-action-bar"/)
  assert.match(source, /<MergePlanSheet/)
  assert.match(source, /planApi\.getInspectTypeDict/)
  assert.match(source, /planOperationService\.mergePlans/)
  assert.match(source, /planOperationService\.downloadToLocal/)
  assert.match(source, /function openMergeFlow/)
  assert.match(source, /function cancelMergeMode/)
  assert.doesNotMatch(source, /function showMergeTip/)
  assert.ok(iconSource.includes("if (props.type === 'merge') return '\\ue633'"))
})

/** 合并模式使用 H5 同款卡片及分组复选框、底部操作栏和清单校验。 */
test('merge selection and download follow H5 card and footer behavior', async () => {
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')

  assert.match(card, /<checkbox-group[^>]*class="merge-check-wrapper"[^>]*@change="toggleMergeSelection"/s)
  assert.match(card, /<checkbox[^>]*:checked="selectionChecked"[^>]*:disabled="selectionDisabled"/s)
  assert.match(list, /class="group-select-all"[^>]*@change="toggleGroupSelectAll\(group\)"/s)
  assert.match(list, /<\/scroll-view>\s*<view v-if="mergeMode" class="merge-action-bar"/)
  assert.match(list, /class="merge-action-btn confirm"[^>]*:disabled="mergeSelectedItems\.length < 2 \|\| operationSubmitting"/s)
  assert.match(list, /getMergedPlanId\(response\)/)
  assert.match(list, /markMergedSourcePlans\(localPlans\.value, sourcePlanIds, mergedPlanId\.value\)/)
  assert.match(list, /markMergedSourcePlans\(remoteListMap\[tab\.key\], sourcePlanIds, mergedPlanId\.value\)/)
  assert.match(list, /if \(mergeTemplateId\.value === ''\)[\s\S]*?请选择清单/)
})

/** 不可选项使用实色灰底及横杠，选中项使用绿色强调，不依赖半透明度区分状态。 */
test('merge checkboxes clearly distinguish selected and disabled states', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')

  assert.match(card, /class="merge-check-wrapper" :class="\{ selected: selectionChecked, disabled: selectionDisabled \}"/)
  assert.match(card, /v-if="selectionDisabled" class="merge-disabled-mark"/)
  assert.match(card, /\.merge-check-wrapper\.selected\s*\{[^}]*background-color:\s*#ecfdf5/s)
  assert.match(card, /\.merge-check-wrapper\.disabled\s*\{[^}]*background-color:\s*#cbd5e1/s)
  assert.doesNotMatch(card, /\.merge-check-wrapper\.disabled\s*\{[^}]*opacity:/s)
  assert.match(list, /class="group-select-all" :class="\{ selected: isGroupAllSelected\(group\), disabled: !canGroupSelectAll\(group\) \}"/)
  assert.match(list, /\.group-select-all\.disabled\s*\{[^}]*background-color:\s*#cbd5e1/s)
})

/** 列表合并卡片显示拆分入口，并复用预览、拆分与逐条下载弹层。 */
test('list card completes the H5 split workflow', async () => {
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.match(list, /:show-action-split="isSplitAvailable\(item\)"/)
  assert.match(list, /@action-split="openSplitPreview"/)
  assert.match(list, /<SplitPlanSheet[\s\S]*?@confirm="confirmSplit"[\s\S]*?@download="downloadSplitItem"/)
  assert.match(list, /planOperationService\.splitPlan\(splitTargetPlanId\.value\)/)
  assert.match(list, /markSplitSourcePlans\(/)
  assert.match(list, /planOperationService\.downloadToLocal\(planId,[\s\S]*?\}, \[\], \[item\]\)/)
  assert.match(card, /if \(actionKey === 'split'\)\s*\{\s*emit\('action-split', props\.item\)/)
  assert.match(card, /const productName = computed\(\(\) => getMergePreviewRow\(props\.item\)\.productName\)/)
  assert.match(card, /const inspectType = computed\(\(\) => getPlanInspectTypeLabel\(props\.item\)\)/)
  assert.doesNotMatch(card, /拆分验货功能待接入/)
  assert.match(list, /async function openSplitPreview\(item: UTSJSONObject\)[\s\S]*?await isNetworkOnline\(\)/)
  assert.match(list, /async function confirmSplit\(\)[\s\S]*?await isNetworkOnline\(\)[\s\S]*?planOperationService\.splitPlan/)
})
