import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 本地数据页应展示全部页面详情与 SQLite 结果，并可复制完整内容而非当前单条。 */
test('local detail debug shows the full snapshot in bounded pages and copies everything', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const tab = await readFile('components/detail/LocalDataTab.uvue', 'utf8')
  assert.match(page, /buildLocalDetailDebugSnapshot\(storedDetail, detail\.value, itemResultRows\)/)
  assert.match(page, /getLocalDetailDebugPage\(localReportDebugFullText\.value, index\)/)
  assert.match(page, /const text = String\(localReportDebugFullText\.value \?\? ''\)/)
  assert.doesNotMatch(page, /pruneEmptyChildItemResults\(planId\.value\)/)
  assert.match(tab, /本地完整详情/)
  assert.match(tab, /复制完整数据/)
})

/** 普通及合并检查行保持固定高度，备注作为独立区域向下扩展。 */
test('checklist keeps the check column fixed while multiline remarks expand below it', async () => {
  const source = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.equal((source.match(/class="checklist-main"/g) ?? []).length, 2)
  assert.match(source, /\.checklist-item \{[^}]*flex-direction: column;[^}]*align-items: stretch;/)
  assert.match(source, /\.checklist-main \{[^}]*height: 120rpx;[^}]*flex-direction: row;[^}]*align-items: center;/)
  assert.match(source, /<\/view>\s*<text v-if="getItemComment\(child\.id\) !== ''" class="item-comment">/)
  assert.match(source, /<\/view>\s*<text v-if="getItemComment\(child\.id, plan\.id\) !== ''" class="item-comment">/)
  const rowStyle = source.match(/\.checklist-item \{([^}]*)\}/)?.[1] ?? ''
  assert.ok(!rowStyle.split(';').some((rule) => rule.trim().startsWith('height:')))
})

/** 弹层始终取当前检查项状态而非旧 checklistItems 快照。 */
test('checklist sheet reads the current result data for the selected row', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(page, /if \(direct\) return \{ \.\.\.direct, data: detail\.value\?\.checklistData\?\.\[key\] \?\? direct\.data \?\? \{\} \}/)
})

/** 相机入口只派发一次业务事件，避免重复调起选图和双份写库。 */
test('checklist camera dispatches one capture event', async () => {
  const source = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.ok(source.includes("emit('photo-capture', item, sonPlanId)"))
  assert.ok(!source.includes("emit('add-photo', item, sonPlanId)"))
})

/** 输入仅登记受影响的本地业务行，保存完成不以 SQLite 回读覆盖页面内存。 */
test('detail edits use coalesced row-level writes without rereading the page', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes("scheduleDraftSave('item', dataKey)"))
  assert.ok(source.includes("scheduleDraftSave('item', itemId)"))
  assert.ok(source.includes('changes: { defectIds: [defectId] }'))
  assert.ok(source.includes('changes: { removedDefectIds: [defectId] }'))
  assert.ok(source.includes('if (changes == null) detail.value = saved'))
  assert.ok(!source.includes('getPlanById(planId.value, snapshot)'))
})

/** H5 的必传照片标志兼容服务端布尔值和数值 1。 */
test('required photo badge accepts numeric flags and stays above the camera', async () => {
  const source = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.ok(source.includes("Number(raw['isPhotoRequired'] ?? 0) === 1"))
  assert.ok(source.includes('.required-star { position: absolute;'))
})

/** 订单信息不提供操作栏，疵点新增入口固定在页面右下角。 */
test('detail actions follow the H5 tab layout', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const defects = await readFile('components/detail/DefectListTab.uvue', 'utf8')
  assert.ok(!page.includes("activeTab === 'info'\" class=\"footer-actions"))
  assert.ok(page.includes('class="floating-defect-button"'))
  assert.ok(!defects.includes('class="add-button"'))
})

/** 上传完成事件可来自合并报告的共享组 ID，页面仍刷新照片状态。 */
test('upload completion refreshes the visible report across merged members', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes("state?.phase === 'uploaded') refreshPhotoState()"))
})

/** 合并报告最终提交只调用父计划一次，成功确认后以单个事务更新组级状态。 */
test('merged final submission targets the parent and does not save members one by one', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(source, /submitFinalReport\(\{ planId: payload\.planId, payload, photoPlanId: planId\.value \}\)/)
  assert.match(source, /waitForCurrentPlanReported\(\(currentPlanId\) => planApi\.getPlanDetail\(currentPlanId\), payload\.planId\)/)
  assert.doesNotMatch(source, /markMergedPlansReported/)
  assert.match(source, /photoPlanId: planId\.value/)
})

/** 自动上传回写共享组时必须选真实成员入口保存草稿，避免创建旧 report 行。 */
test('automatic photo refresh resolves group IDs to a member before saving', async () => {
  const source = await readFile('runtime/appRuntime.uts', 'utf8')
  assert.match(source, /saveDraft\(localDetail\.planId, refreshed/)
})

/** 保证详情首次渲染时，总结弹层引用的统计数据已由响应式计算属性提供。 */
test('detail page defines the finish summary used by the submit sheet', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /const finishSummary\s*=\s*computed\(\(\)\s*=>\s*buildFinishSummary\(detail\.value/)
  for (const field of ['defectStats', 'exceedsAql', 'failedCheckpoints']) {
    assert.match(source, new RegExp(`finishSummary\\.${field}`))
  }
})

/** H5 规格卡先新增，再在卡片顶部翻组，删除和字段输入在导航之后。 */
test('measurement editor follows the H5 card action order', async () => {
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const section = source.split('v-if="itemType === \'Measurements\'"')[1].split('v-else-if="itemType === \'Text\'"')[0]
  for (const label of ['规格测量', '新增一组规格', '上一组', '下一组', '删除当前组', '规格汇总']) assert.ok(section.includes(label), `${label} missing`)
  assert.ok(section.indexOf('新增一组规格') < section.indexOf('上一组'))
  assert.ok(section.indexOf('上一组') < section.indexOf('删除当前组'))
  assert.ok(section.indexOf('删除当前组') < section.indexOf('v-for="attr in specAttributes"'))
  assert.match(section, /measurementIndex \+ 1/)
})

/** 翻动规格或文本组时输入节点随组切换，避免原生输入框保留前一组内容。 */
test('attribute inputs have group-specific keys like the H5 editor', async () => {
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const measurements = source.split('v-if="itemType === \'Measurements\'"')[1].split('v-else-if="itemType === \'Text\'"')[0]
  const textGroups = source.split('v-else-if="itemType === \'Text\'"')[1].split('v-else-if="itemType === \'Barcodes\'"')[0]
  assert.match(measurements, /:key="`\$\{measurementIndex\}_\$\{attr\.attrId\}`"/)
  assert.match(textGroups, /:key="`\$\{textGroupIndex\}_\$\{attr\.attrId\}`"/)
})

/** H5 复制流程按字段、目标计划、匹配检查项三步多选，媒体操作按媒体和目标两步多选。 */
test('copy and batch media sheets use fixed-height H5 selection flows', async () => {
  const copy = await readFile('components/detail/CopyCheckItemsSheet.uvue', 'utf8')
  const move = await readFile('components/detail/BatchMoveMediaSheet.uvue', 'utf8')
  for (const label of ['选择需要复制的信息', '选择目标单据', '选择要复制的检查项', '全选', 'copySpecs', 'copyText', 'copyBarcode', 'targetPlanIds', 'targetItemIds', 'currentStep']) assert.ok(copy.includes(label), `copy: ${label}`)
  for (const label of ['批量移动照片/视频', '选择目标检查点', '全选', 'fileIds', 'targetBizIds', 'currentStep', 'InspectionMediaImage']) assert.ok(move.includes(label), `move: ${label}`)
  assert.match(copy, /height:\s*dialogHeight/)
  assert.match(move, /height:\s*dialogHeight/)
  assert.match(copy, /windowHeightPx\(0\.9\)/)
  assert.match(move, /windowHeightPx\(0\.9\)/)
  assert.doesNotMatch(copy, /<picker\b/)
  assert.doesNotMatch(move, /<picker\b/)
})

/** 复制目标不含子行，媒体目标则按 H5 展示已有结果的子行。 */
test('copy filters merged children while batch media retains eligible child targets', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const copy = await readFile('components/detail/CopyCheckItemsSheet.uvue', 'utf8')
  const move = await readFile('components/detail/BatchMoveMediaSheet.uvue', 'utf8')
  assert.match(page, /<CopyCheckItemsSheet[^>]*:items="baseChecklistItems"/)
  assert.match(page, /selectCopyTargetPlans\(/)
  assert.match(page, /buildBatchMoveTargets\(detail\.value, moveSourceItemId\.value\)/)
  assert.match(page, /targetBizIds\.includes\(String\(item\?\.bizId/)
  assert.match(copy, /filter\(\(item: UTSJSONObject\): boolean => \(item\['sonPlanId'\]/)
  assert.match(copy, /id: firstNonEmptyText\(\[item\['baseItemId'\], item\['itemId'\], item\['id'\], item\['standardItemId'\]\]/)
  assert.match(move, /item\['bizId'\]/)
  assert.doesNotMatch(move, /filter\(\(item: UTSJSONObject\): boolean => \(item\['sonPlanId'\]/)
})

/** 目标单据联网以 H5 搜索接口为准，不叠加 SQLite 旧记录；离线再使用缓存。 */
test('copy target plans use current remote results and H5 order details', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const sheet = await readFile('components/detail/CopyCheckItemsSheet.uvue', 'utf8')
  assert.match(page, /selectCopyTargetPlans\(result\?\.records \?\? \[\], \[\], detail\.value, userId, true\)/)
  assert.match(page, /planApi\.searchPlans\(\{ inspectorId: userId !== '' \? userId : undefined, status: '0,1', lockFlag: 1, mergeType: 0 \}, 1, 200\)/)
  assert.doesNotMatch(page, /selectCopyTargetPlans\(\[\], localPlans, detail\.value, userId, false\)/)
  assert.doesNotMatch(page.split('async function loadCopyTargetPlans()')[1].split('async function openCopySheet()')[0], /const byId = new Map\(/)
  assert.match(sheet, /plan\.extra/)
  assert.match(sheet, /subGoodsNo.*batchNo/)
  assert.match(sheet, /plan\['goodsFlag'\]/)
  assert.doesNotMatch(sheet.split('const displayPlans = computed')[1].split('const sourceItem = computed')[0], /\.filter\(\(plan: CopyPlan\)/)
})

/** 目标单据标题旁展示当前实际可选条数，加载时不显示误导性的零。 */
test('copy target step shows the available plan count beside its title', async () => {
  const sheet = await readFile('components/detail/CopyCheckItemsSheet.uvue', 'utf8')
  const step = sheet.split('v-if="currentStep === 2"')[1].split('v-if="currentStep === 3"')[0]
  assert.match(step, /class="plan-step-heading"[\s\S]*?选择目标单据[\s\S]*?v-if="!loadingPlans"[^>]*class="plan-count"[^>]*>\{\{ displayPlans\.length \}\}/)
})

/** 原生端未选中的复制和批量媒体复选框也应有可见实线轮廓。 */
test('copy and batch media checkboxes show an unchecked border', async () => {
  for (const file of ['components/detail/CopyCheckItemsSheet.uvue', 'components/detail/BatchMoveMediaSheet.uvue']) {
    const source = await readFile(file, 'utf8')
    const unchecked = source.match(/\.checkbox\s*\{([^}]*)\}/)?.[1] ?? ''
    assert.match(unchecked, /border-width:\s*2rpx/)
    assert.match(unchecked, /border-style:\s*solid/)
    assert.match(unchecked, /border-color:\s*#94a3b8/)
    assert.match(unchecked, /background-color:\s*#ffffff/)
    assert.match(source, /\.checkbox\.checked\s*\{[^}]*background-color:\s*#1a5f3f/)
  }
})

/** 批量操作逐个目标复用本地复制模型，重置提示使用 H5 的初始状态说明。 */
test('detail page applies selected media to all targets and describes reset accurately', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(source, /targetBizIds/)
  assert.match(source, /fileIds/)
  assert.match(source, /onlineMediaService\.copyPhotos\(detail\.value, requests\)/)
  assert.match(source, /下载\/初始创建的状态/)
  assert.match(source, /planApi\.searchPlans\(/)
  assert.doesNotMatch(source, /reportRepository\.listPlanSummaries\(/)
  assert.match(source, /getCurrentSession\(/)
  assert.match(source, /const batchMoveTargets\s*=\s*computed/)
  assert.match(source, /makeChecklistDataKey\(baseId, sonPlanId\)/)
  assert.match(source, /:items="batchMoveTargets"/)
  assert.match(source, /const requestId = \+\+copyPlanLoadRequest/)
  assert.match(source, /if \(requestId === copyPlanLoadRequest && showCopySheet\.value\) copyTargetPlans\.value/)
})

/** 原生 text 不依赖父容器继承文字颜色，详情页选中条对齐列表页样式。 */
test('checklist finish label is white and detail tabs use the list indicator', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  const header = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')
  assert.match(checklist, /class="finish-button"[^>]*><text class="finish-button-label">/)
  assert.match(checklist, /\.finish-button-label\s*\{[^}]*color:\s*#ffffff;/)
  assert.match(header, /<view v-if="activeTab === tab\.key" class="tab-indicator"><\/view>/)
  assert.match(header, /\.tab-indicator\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0;[^}]*height:\s*6rpx;[^}]*background-color:\s*#ffffff;/)
  assert.doesNotMatch(header, /\.tab\.active\s*\{[^}]*border-bottom-color/)
})

/** 详情 Tab 不仅有白色选中条，尺寸、透明度、图文间距也应与验货列表一致。 */
test('detail tab layout matches the inspection list selected style', async () => {
  const source = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const cssRule = (text, selector) => text.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1]?.replace(/\s+/g, ' ').trim()
  for (const [detailSelector, listSelector] of [['tabs', 'status-tabs'], ['tab', 'status-tab'], ['tab.active', 'status-tab.active'], ['tab-icon', 'tab-icon'], ['tab-text', 'tab-text'], ['tab-indicator', 'tab-indicator']]) {
    const detailRule = cssRule(source, detailSelector.replace('.', '\\.'))
    const listRule = cssRule(list, listSelector.replace('.', '\\.'))
    assert.ok(detailRule, `${detailSelector} must exist`)
    assert.equal(detailRule, listRule, `${detailSelector} should match ${listSelector}`)
  }
})

/** 确保常驻弹层的 visible 绑定在脚本中都有初始状态，避免真机首次渲染崩溃。 */
test('detail page initializes every sheet visibility binding', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const visibleBindings = [...source.matchAll(/:visible="(\w+)"/g)].map((match) => match[1])

  for (const binding of visibleBindings) {
    assert.match(source, new RegExp(`const ${binding}\\s*=\\s*ref\\(`), `${binding} must be initialized`)
  }
})

/** 确保模板绑定的方法和弹层组件都存在，避免打开详情时渲染未注册节点。 */
test('detail page only renders registered sheets and defined event handlers', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const handlers = [...template.matchAll(/@[\w-]+="([A-Za-z_]\w*)"/g)].map((match) => match[1])
  const components = [...template.matchAll(/<([A-Z][A-Za-z]+)\b/g)].map((match) => match[1])

  for (const handler of handlers) {
    assert.match(source, new RegExp(`(?:async\\s+)?function\\s+${handler}\\s*\\(`), `${handler} must exist`)
  }
  for (const component of components) {
    assert.match(source, new RegExp(`import\\s+${component}\\s+from`), `${component} must be imported`)
  }
})

test('detail loading imports every view-model function it calls after reading SQLite', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const detailImport = source.match(/import\s*\{([^}]+)\}\s*from\s*'\.\.\/\.\.\/domain\/detailViewModel\.uts'/)

  assert.ok(detailImport, 'detail page should import its view model')
  const importedNames = detailImport[1].split(',').map((name) => name.trim())
  for (const name of ['normalizeOverallResult', 'buildFinishSummary']) {
    assert.match(source, new RegExp(`\\b${name}\\(`))
    assert.ok(importedNames.includes(name), `${name} is called during detail loading but not imported`)
  }
})

test('detail page is componentized and wires the offline inspection workflow', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  for (const component of [
    'InspectionDetailHeader',
    'ChecklistTab',
    'DefectListTab',
    'PlanInfoTab',
    'LocalDataTab',
    'CheckItemSheet',
    'QuickDefectSheet',
    'FinishInspectionSheet',
    'CopyCheckItemsSheet',
    'BatchMoveMediaSheet',
    'PhotoEditorSheet'
  ]) {
    assert.match(source, new RegExp(`import ${component}`))
    assert.match(source, new RegExp(`<${component}`))
  }

  assert.match(source, /inspectionDetailService\.loadDetail/)
  assert.match(source, /inspectionDetailService\.saveDraft/)
  assert.match(source, /uni\.chooseImage\(/)
  assert.match(source, /sourceType:\s*\['camera'\]/)
  assert.doesNotMatch(source, /\/pages\/report\/camera/)
  assert.match(source, /uni\.getFileSystemManager\(\)/)
  assert.match(source, /fileSystemManager\.saveFile/)
  assert.doesNotMatch(source, /uni\.saveFile/)
  assert.match(source, /inspectionMediaService\.addLocalPhoto/)
  assert.match(source, /inspectionMediaService\.uploadPendingPhotos/)
  assert.match(source, /inspectionSubmissionService\.submitFinalReport/)
  const finalSubmission = source.split('async function submitFinalReport()')[1].split('/** 打开详情更多操作菜单')[0]
  assert.match(finalSubmission, /await waitForAutomaticSyncIdle\(\)/)
  assert.equal((finalSubmission.match(/await persistDraft\(\{ markDirty: true, deferSync: true \}\)/g) || []).length, 2)
  assert.match(source, /提交成功，但报告状态尚未更新/)
  assert.match(source, /draftTouched/)
  assert.match(source, /onHide/)
  assert.match(source, /onUnload/)
  assert.match(source, /let leaveSaveTask = null/)
  assert.match(source, /function flushTouchedDraft/)
  assert.match(source, /if \(!draftTouched\.value\) return saveChain/)
  assert.match(source, /if \(leaveSaveTask != null\) return leaveSaveTask/)
  assert.match(source, /async function goBack\(\) \{ await flushTouchedDraft\(\); uni\.navigateBack\(\) \}/)
  assert.doesNotMatch(source, /persistDraft\(\{ markDirty: draftTouched\.value \}\)/)
  assert.match(source, /function processSyncQueueAfterChange\(\)/)
  assert.match(source, /if \(markDirty && options\?\.deferSync !== true\) processSyncQueueAfterChange\(\)/)
  assert.equal((source.match(/syncOfflineDataAutomatically\(\)/g) || []).length, 2, 'detail page should process the queue after content changes and from the explicit manual action')
  assert.doesNotMatch(source, /saveDraft\(planId\.value, detail\.value, \{ markDirty: false \}\)/)
  assert.doesNotMatch(source, /resumePendingUploads/)
  assert.match(source, /function handlePageShow\(\) \{ if \(pageLoaded\) refreshSyncOverview\(\) \}/)
  assert.doesNotMatch(source, /window\.|document\.|localStorage|indexedDB/)
})

test('detail media capture uses the H5 biz metadata contract', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const metadata = await readFile('domain/mediaUploadMetadata.uts', 'utf8')

  assert.match(source, /buildChecklistMediaMetadata/)
  assert.match(source, /buildDefectMediaMetadata/)
  assert.match(metadata, /bizId/)
  assert.match(metadata, /bizType/)
  assert.match(metadata, /subGoodsNo/)
  assert.match(metadata, /sortNo/)
})

test('check item sheet exposes native barcode and media actions through the detail page', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  for (const action of ['copy-items', 'batch-move', 'reset-item', 'add-checkpoint-photo']) {
    assert.match(sheet, new RegExp(`emit\\('${action}'`))
    assert.match(detail, new RegExp(`@${action}=`))
  }
  assert.match(sheet, /uni\.scanCode/)
  assert.match(sheet, /条码名称/)
  assert.match(sheet, /扫码格式/)
  assert.match(sheet, /上一组/)
  assert.match(sheet, /下一组/)
  assert.match(sheet, /draft\.measurements\.length > 1/)
  assert.match(sheet, /summaryRow\[attr\.attrId\]/)
  assert.match(sheet, /检查点图片/)
  assert.doesNotMatch(sheet, /document\.|window\.|navigator\./)
})

/** 条码检查项沿用 H5 的卡片、名称底部弹层和扫码操作，不直接编辑码值。 */
test('barcode check item follows the H5 card and name editor flow', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const barcode = sheet.split('v-else-if="itemType === \'Barcodes\'"')[1].split('class="notes-section"')[0]
  assert.match(barcode, /条码扫描/)
  assert.match(barcode, /barcode\.code \|\| '-'/)
  assert.match(barcode, /barcode\.format \|\| '-'/)
  assert.match(barcode, /scanBarcode\(index\)/)
  assert.match(barcode, /openBarcodeEditor\(-1\)/)
  assert.doesNotMatch(barcode, /@input="updateBarcode\(/)
  assert.match(sheet, /编辑条形码/)
  assert.match(sheet, /新增条码测试项/)
  assert.match(sheet, /editingBarcodeIndex >= 0 \? translateText\('保存'\) : translateText\('确认'\)/)
  assert.match(sheet, /item\['itemType'\] === 'Barcodes'[^\n]*barcodeItems\.length === 0[^\n]*name: '', code: '', format: ''/)
  assert.match(sheet, /scanType: \['qrCode', 'barCode'\]/)
  assert.match(sheet, /onlyFromCamera: false/)
})

/** 每个条码项卡片都绘制可见实线边框，与 H5 的卡片分隔一致。 */
test('each barcode item has a visible native card outline', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(sheet, /v-for="\(barcode, index\) in draft\.barcodeItems"[^>]*class="barcode-card"/)
  assert.match(sheet, /\.barcode-card \{[^}]*border-width: 2rpx;[^}]*border-style: solid;[^}]*border-color: #cbd5e1;/)
})

/** 长条码和右侧扫码按钮不能把卡片撑出带内边距的滚动区域。 */
test('barcode cards stay within the padded sheet on narrow screens', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const button = await readFile('components/common/AppButton.uvue', 'utf8')
  assert.match(sheet, /v-else-if="itemType === 'Barcodes'" class="type-section barcode-section"/)
  assert.match(sheet, /\.barcode-section \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*box-sizing: border-box;/)
  assert.match(sheet, /\.barcode-card \{[^}]*width: 100%;[^}]*box-sizing: border-box;/)
  assert.match(sheet, /\.barcode-row-value \{[^}]*flex: 1;[^}]*min-width: 0;[^}]*overflow: hidden;/)
  assert.match(button, /\.app-button\.block \{[^}]*width: 100%;[^}]*box-sizing: border-box;/)
})

/** 原生扫码包含一维条形码，并在双平台打包启用扫码模块。 */
test('Android and iOS package the native barcode scanner', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const manifest = await readFile('manifest.json', 'utf8')
  const android = manifest.split('"app-android":')[1].split('"app-ios":')[0]
  const ios = manifest.split('"app-ios":')[1].split('"web":')[0]
  assert.match(sheet, /scanType: \[[^\]]*'barCode'/)
  for (const platform of [android, ios]) assert.match(platform, /"uni-barcode-scanning"\s*:\s*\{\}/)
  assert.match(ios, /NSCameraUsageDescription[^\n]*扫描条码/)
})

/** 条码名称弹层使用加大的通用按钮，并让输入区域有清晰边框。 */
test('barcode name editor has large actions and a visible input outline', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const button = await readFile('components/common/AppButton.uvue', 'utf8')
  assert.match(sheet, /<AppButton large variant="outline" @press="closeBarcodeEditor">/)
  assert.match(sheet, /<AppButton large variant="primary" @press="saveBarcodeName">/)
  assert.match(button, /large: \{ type: Boolean, default: false \}/)
  assert.match(button, /\.app-button\.large \{[^}]*min-height: 88rpx;[^}]*flex: 1;/)
  assert.match(button, /\.button-label\.large \{[^}]*font-size: 28rpx;/)
  assert.match(sheet, /\.barcode-name-input \{[^}]*border-width: 2rpx;[^}]*border-style: solid;[^}]*border-color: #94a3b8;/)
})

test('check item actions use padded reusable native buttons', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const button = await readFile('components/common/AppButton.uvue', 'utf8')
  assert.match(sheet, /import AppButton from/)
  for (const handler of ['addMeasurement', 'addTextGroup', 'openPhotoSort', 'requestCopyItems', 'requestBatchMove', 'requestResetItem', 'addCheckPointPhoto', 'scanBarcode']) {
    assert.match(sheet, new RegExp(`<AppButton[^\n]*@press="${handler}`))
  }
  assert.match(sheet, /class="result-circle"[^>]*@click="confirmResult\(option\.value\)"/)
  assert.match(button, /<view class="app-button"/)
  assert.match(button, /padding:/)
  assert.doesNotMatch(sheet, /class="add-value" @click/)
})

test('check point photos use a separate upload biz type and reset removes their local records', async () => {
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(detail, /bizType: 'checkPoint'/)
  assert.match(detail, /async function resetChecklistItem/)
  assert.match(detail, /await removePhotoRecord\(photo\)/)
  assert.match(detail, /ConfirmActionSheet :visible="showResetItemConfirm"/)
})

test('list and detail headers share the same cloud component and queue overview', async () => {
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  const header = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')

  assert.match(list, /getOfflineSyncOverview/)
  assert.match(detail, /getOfflineSyncOverview/)
  assert.match(header, /import OfflineSyncStatus/)
  assert.match(header, /<OfflineSyncStatus/)
  assert.match(detail, /:pending-sync-count="pendingSyncCount"/)
  assert.match(detail, /:failed-sync-count="failedSyncCount"/)
  assert.doesNotMatch(header, /class="upload-badge"/)
})

test('detail media views use the shared H5-compatible display resolver', async () => {
  for (const path of [
    'components/detail/ChecklistTab.uvue',
    'components/detail/DefectListTab.uvue',
    'components/detail/PhotoEditorSheet.uvue',
    'components/detail/BatchMoveMediaSheet.uvue',
    'components/detail/InspectionMediaItem.uvue'
  ]) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /InspectionMediaImage/)
  }

  for (const path of [
    'components/detail/CheckItemSheet.uvue',
    'components/detail/QuickDefectSheet.uvue'
  ]) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /InspectionMediaGrid/)
  }
})

test('quantity operations stay offline while copy and media actions require online APIs', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /checklistCopyService\.copyOnline/)
  assert.match(source, /onlineMediaService\.copyPhotos/)
  assert.match(source, /onlineMediaService\.sortPhotos/)
  assert.match(source, /applyFinishQuantityRows/)
  assert.match(source, /applySampleQuantity/)
  assert.doesNotMatch(source, /planApi\.copyCheckItems/)
  assert.doesNotMatch(source, /planApi\.copyPhotosToItems/)
  assert.doesNotMatch(source, /planApi\.updateFinishQuantity/)
  assert.doesNotMatch(source, /planApi\.updateSampleQuantity/)
})

/** 跨单复制及批量媒体使用在线接口，不再将专用操作延后入队。 */
test('copy and batch media call online services without queuing file operations', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const copyFlow = source.split('async function submitCopyItems(payload)')[1].split('async function openBatchMoveSheet()')[0]
  assert.match(copyFlow, /if \(!\(await isNetworkOnline\(\)\)\) throw new Error\('复制到其他验货需要联网'\)/)
  assert.match(copyFlow, /checklistCopyService\.copyOnline\(detail\.value, \{ \.\.\.payload, targetPlanIds \}\)/)
  assert.match(copyFlow, /await flushTouchedDraft\(\)/)
  assert.doesNotMatch(source, /persistentOperationService\.enqueuePhotoCopy\(/)
  assert.match(source, /buildBatchPhotoCopyRequests\(detail\.value, fileIds, targets\)/)
  assert.match(source, /onlineMediaService\.copyPhotos\(detail\.value, requests\)/)
})

/** 批量复制和批量移动的目标失败时，沿用底部弹层显示汇总和具体原因。 */
test('detail copy and media move display business failures in the original bottom sheet', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  const copyFlow = source.split('async function submitCopyItems(payload)')[1].split('async function openBatchMoveSheet()')[0]
  const moveFlow = source.split('async function submitBatchMove(payload)')[1].split('function openReadyQuantity()')[0]
  assert.match(source, /<ConfirmActionSheet :visible="showBatchResult" :title="batchResultTitle"/)
  for (const flow of [copyFlow, moveFlow]) {
    assert.match(flow, /if \(result\.failCount > 0\)/)
    assert.match(flow, /batchResultMessage\.value = \[summary, \.\.\.result\.errorMessages\]\.join\('\\n'\)/)
    assert.match(flow, /showBatchResult\.value = true/)
  }
  assert.match(copyFlow, /if \(result\.successCount > 0\) showCopySheet\.value = false/)
  assert.match(moveFlow, /if \(result\.successCount > 0\) showBatchMoveSheet\.value = false/)
  assert.match(copyFlow, /catch \(error\) \{ showBatchFailure\('复制检查项失败',/)
  assert.match(moveFlow, /catch \(error\) \{ showBatchFailure\('批量移动失败',/)
  assert.match(copyFlow, /: '复制成功'\)/)
  assert.match(moveFlow, /: '移动成功'\)/)
})

test('shared cloud icon only expands queue state and never starts synchronization itself', async () => {
  const source = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')

  assert.doesNotMatch(source, /emit\('sync-request'\)/)
  assert.doesNotMatch(source, /点击云图标即可继续同步/)
  assert.match(source, /恢复网络后会自动同步/)
})

test('detail page uses the native app-x list container so swipe cells do not block vertical scrolling', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(source, /<list-view class="content"/)
  assert.ok((source.match(/<list-item/g) || []).length >= 3)
  assert.doesNotMatch(source, /<scroll-view class="content"/)
  assert.match(source, /\.page\s*\{[^}]*flex:\s*1/)
  assert.match(source, /\.content\s*\{[^}]*flex:\s*1/)
})

test('detail header preserves the safe area and all tabs are reusable components', async () => {
  const header = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')
  assert.match(header, /<TopSafeArea/)
  assert.match(header, /subGoodsNo/)
  assert.match(header, /checklist/)
  assert.match(header, /defects/)
  assert.match(header, /info/)
  assert.match(header, /local/)

  for (const path of [
    'components/detail/ChecklistTab.uvue',
    'components/detail/DefectListTab.uvue',
    'components/detail/PlanInfoTab.uvue',
    'components/detail/LocalDataTab.uvue',
    'components/detail/CheckItemSheet.uvue',
    'components/detail/QuickDefectSheet.uvue',
    'components/detail/FinishInspectionSheet.uvue',
    'components/detail/CopyCheckItemsSheet.uvue',
    'components/detail/BatchMoveMediaSheet.uvue',
    'components/detail/PhotoSortSheet.uvue',
    'components/detail/InspectionMediaGrid.uvue',
    'components/detail/InspectionMediaItem.uvue',
    'components/detail/PhotoEditorSheet.uvue'
  ]) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /defineProps/)
    assert.match(source, /defineEmits/)
  }
})

test('check item editor sorts photos through a reusable native bottom sheet', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const editor = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const sheet = await readFile('components/detail/PhotoSortSheet.uvue', 'utf8')

  assert.match(editor, /import PhotoSortSheet/)
  assert.match(editor, /mediaPhotos\.length > 1/)
  assert.match(editor, /@sorted="confirmPhotoSort"/)
  assert.match(editor, /emit\('photos-sorted'/)
  assert.match(sheet, /import \{[^}]*moveMediaItem/)
  assert.match(sheet, /emit\('sorted'/)
  assert.match(sheet, /按住照片拖拽可调整顺序/)
  assert.match(sheet, /height:\s*sheetHeight/)
  assert.match(sheet, /windowHeightPx\(0\.9\)/)
  for (const event of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    assert.match(sheet, new RegExp(`@${event}=`))
  }
  assert.match(sheet, /pressTimer = setTimeout\(/)
  assert.match(sheet, /clearTimeout\(timer\)/)
  assert.match(sheet, /Math\.abs\(deltaX\) > 12 \|\| Math\.abs\(deltaY\) > 12/)
  assert.match(sheet, /resolveMediaDragTarget/)
  assert.doesNotMatch(sheet, /selectPosition\(/)
  assert.doesNotMatch(sheet, /document\.|window\.|getBoundingClientRect/)
  assert.match(page, /@photos-sorted="sortChecklistPhotos"/)
  assert.match(page, /function sortChecklistPhotos/)
  assert.match(page, /onlineMediaService\.sortPhotos\(detail\.value, itemId, payload\?\.photos\)/)
})

/** 照片重排入口与 H5 一样位于底部操作区的批量移动入口上方。 */
test('photo sorting action appears immediately above batch move below the media grid', async () => {
  const editor = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const mediaSection = editor.slice(editor.indexOf('<view class="media-section">'), editor.indexOf('<view v-if="defects.length"'))
  assert.match(mediaSection, /<InspectionMediaGrid[^>]*\/>[\s\S]*<AppButton[^>]*@press="requestCopyItems"[^>]*>[\s\S]*<AppButton v-if="mediaPhotos\.length > 1" block @press="openPhotoSort">[\s\S]*照片重新排序[\s\S]*<AppButton v-if="mediaPhotos\.length" block @press="requestBatchMove">/)
  assert.doesNotMatch(mediaSection, /section-title-row[^\n]*openPhotoSort/)
})

test('checklist tab keeps the H5 section hierarchy and direct photo action', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')

  assert.match(checklist, /expandedSections/)
  assert.match(checklist, /sectionName/)
  assert.match(checklist, /photo-capture/)
  assert.match(checklist, /retry-detail/)
  assert.match(page, /@photo-capture="handleChecklistItemPhotoCapture"/)
  assert.match(page, /@retry-detail="loadDetail"/)
})

/** 原生总结弹层保留联网说明，页面仍负责最终提交的联网阻断。 */
test('finish sheet clearly explains online and photo upload requirements', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(source, /最终提交需要联网/)
  assert.match(source, /pendingUploadCount > 0/)
  assert.match(source, /图片等待上传/)
  assert.match(page, /isNetworkOnline\(\)/)
  assert.match(page, /最终提交需要联网/)
  assert.match(source, /overallResult/)
  assert.match(source, /overallRemarks/)
})

test('check item editor supports measurements text and barcode item types', async () => {
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(source, /Measurements/)
  assert.match(source, /Text/)
  assert.match(source, /Barcodes/)
  assert.match(source, /measurements/)
  assert.match(source, /textGroups/)
  assert.match(source, /barcodeItems/)
  assert.match(source, /specAttributes/)
  assert.match(source, /新增一组规格/)
  assert.match(source, /新增一组文本/)
})

test('check item editor follows the H5 fixed result footer and immediate result workflow', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')

  assert.match(source, /import AppIcon/)
  assert.match(source, /class="current-result-banner"/)
  assert.match(source, /class="modal-footer-fixed"/)
  assert.match(source, /class="result-circles-row"/)
  assert.ok((source.match(/class="circle-icon"/g) || []).length >= 1)
  for (const label of ['检查 - 合格', '检查 - 不合格', '检查 - 待定', '检查 - 不适用']) {
    assert.match(source, new RegExp(label))
  }
  for (const icon of ['check', 'warning', 'help', 'clear']) {
    assert.match(source, new RegExp(`icon: '${icon}'`))
  }
  assert.match(source, /emit\('select-result'/)
  assert.match(source, /emit\('auto-save'/)
  assert.match(source, /emit\('open-defect'/)
  assert.match(source, /\.sheet\s*\{[^}]*position:\s*absolute[^}]*top:\s*15%[^}]*bottom:\s*0/)
  assert.doesNotMatch(source, /\.sheet\s*\{[^}]*(?:height|min-height|max-height):\s*\d+vh/)
  assert.match(source, /\.sheet\s*\{[^}]*flex-direction:\s*column/)
  assert.match(source, /\.sheet-body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*padding-bottom:\s*24rpx/)
  assert.match(source, /\.modal-footer-fixed\s*\{[^}]*flex-shrink:\s*0/)
  assert.doesNotMatch(source, /\.modal-footer-fixed\s*\{[^}]*position:\s*absolute/)
  assert.doesNotMatch(source, /class="result-options"/)
  assert.doesNotMatch(source, /保存检查项/)

  assert.match(page, /:defects="editingItemDefects"/)
  assert.match(page, /@select-result="selectChecklistItemResult"/)
  assert.match(page, /@auto-save="autoSaveChecklistItem"/)
  assert.match(page, /@open-defect="openDefect"/)
  assert.match(page, /function selectChecklistItemResult/)
  assert.match(page, /if \(result === 'fail'\) openNewDefect/)
})

test('defect editor consumes the cached defect category tree', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(page, /defectTree/)
  assert.match(page, /:category-tree=/)
  assert.match(sheet, /categoryTree/)
  assert.match(sheet, /tier1Code/)
  assert.match(sheet, /tier2Code/)
  assert.match(sheet, /tier3Code/)
  assert.match(sheet, /commonFlag/)
  assert.match(sheet, /普遍性疵点/)
})

/** 新增及编辑疵点均固定从底部展开，占屏幕九成并保留独立滚动内容与底部操作栏。 */
test('defect editor occupies the bottom 90 percent of the native screen', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')

  assert.match(sheet, /:style="\{ top: dialogTop, maxHeight: dialogMaxHeight \}"/)
  assert.match(sheet, /dialogTop = computed\(\(\): string => windowHeightPx\(0\.1\)\)/)
  assert.match(sheet, /dialogMaxHeight = computed\(\(\): string => windowHeightPx\(0\.9\)\)/)
  assert.match(sheet, /\.dialog\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*0;/)
  assert.match(sheet, /\.dialog-body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/)
  assert.match(sheet, /<\/scroll-view><view class="actions">/)
  assert.match(sheet, /<DefectCategorySheet/)
})

test('defect category picker stays at 90 percent height on every selection step', async () => {
  const category = await readFile('components/detail/DefectCategorySheet.uvue', 'utf8')
  assert.match(category, /\.category-sheet\s*\{[^}]*position:\s*absolute;[^}]*top:\s*10%;[^}]*bottom:\s*0;/)
  assert.match(category, /\.category-list\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;/)
  assert.doesNotMatch(category, /height:\s*78vh/)
})

test('checklist photo count badges stay inside thumbnails in normal and merged rows', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.equal((checklist.match(/class="photo-count"/g) ?? []).length, 2)
  assert.equal((checklist.match(/class="defect-photo-count"/g) ?? []).length, 2)
  for (const selector of ['photo-count', 'defect-photo-count']) {
    const style = checklist.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    assert.match(style, /top:\s*0;/)
    assert.match(style, /right:\s*0;/)
    assert.match(style, /z-index:\s*[1-9]/)
    assert.doesNotMatch(style, /(?:top|right):\s*-/)
  }
})

test('defect editor mirrors the quick defect actions and keeps linked checkpoint read-only', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(sheet, /class="header-camera"[^>]*@press="addPhoto"/)
  assert.match(sheet, /class="header-camera"[^>]*icon-type="camera"/)
  assert.match(sheet, /class="checkpoint"/)
  assert.doesNotMatch(sheet, /<picker[^>]*:range="itemLabels"/)
  assert.match(sheet, /v-for="quantity in 19"/)
  assert.match(sheet, /class="qty-other"/)
  assert.match(sheet, /@press="requestDelete"/)
  assert.match(page, /@delete="confirmRemoveDefect"/)
  assert.match(page, /:editing="isEditingDefect"/)
  assert.match(page, /isEditingDefect\.value = false; editingDefect\.value/)
  assert.ok(sheet.indexOf('媒体库') < sheet.indexOf('严重性'))
})

test('native sheet buttons render labels and icons through view-based components', async () => {
  const button = await readFile('components/common/AppButton.uvue', 'utf8')
  const defect = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  const checkItem = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(button, /<AppIcon v-if="iconType !== ''" :type="iconType"/)
  assert.match(button, /<text v-else class="button-label"[^>]*><slot\s*\/><\/text>/)
  assert.doesNotMatch(button, /<button\b/)
  for (const sheet of [defect, checkItem]) {
    assert.match(sheet, /<AppButton[^>]*icon-type="close"[^>]*\/>/)
    assert.match(sheet, /<AppButton[^>]*icon-type="camera"[^>]*\/>/)
  }
  assert.match(checkItem, /<view v-for="option in resultOptions"[^>]*class="result-circle"/)
  assert.match(checkItem, /class="circle-icon"[^>]*><AppIcon :type="option\.icon"/)
  assert.doesNotMatch(checkItem, /<AppButton v-for="option in resultOptions"/)
  assert.match(defect, /:label-color="draft\.type === option\.value \? '#16a34a' : '#334155'"/)
  assert.match(defect, /class="footer-button save"[^>]*label-color="#ffffff"/)
})

/** 编辑疵点的类别选择和评论框与 H5 一样展示完整浅灰色边框。 */
test('defect category picker and comment field have visible H5-style borders', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(sheet, /\.category-trigger \{[^}]*border-width: 2rpx;[^}]*border-style: solid;[^}]*border-color: #e5e7eb;[^}]*border-radius: 16rpx;/)
  assert.match(sheet, /\.comment-input \{[^}]*border-width: 2rpx;[^}]*border-style: solid;[^}]*border-color: #e5e7eb;[^}]*border-radius: 16rpx;/)
})

/** 1–19 与“其他”同在横向滚动区，仍可填写和校验自定义数量。 */
test('defect editor scrolls through 1–19 and the H5 other quantity option', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(sheet, /<scroll-view class="quantity-scroll" direction="horizontal"><view class="quantity-row"[^>]*><AppButton v-for="quantity in 19"[\s\S]*?<AppButton class="qty-other"[^>]*@press="selectQuantity\('other'\)"[\s\S]*?<\/view><\/scroll-view>/)
  assert.doesNotMatch(sheet, /<\/scroll-view>\s*<AppButton class="qty-other"/)
  assert.match(sheet, /\.quantity-scroll \{[^}]*width: 100%;/)
  assert.match(sheet, /\.quantity-row \{[^}]*width: 2100rpx;[^}]*flex-direction: row;/)
  assert.match(sheet, /\.qty-item, \.qty-other \{[^}]*flex-shrink: 0;/)
  assert.match(sheet, /<input v-if="draft\.quantity === 'other' && draft\.commonFlag !== 1" class="other-input"[^>]*@input="updateField\('customQuantity', \$event\)"/)
  assert.match(sheet, /\.other-input \{[^}]*border-width: 2rpx;[^}]*border-style: solid;[^}]*border-color: #e5e7eb;/)
  assert.match(sheet, /quantity: getDefectQuantity\(draft\.value\)/)
})

/** 类别标题和必选标签共享一行的垂直中心及下方间距。 */
test('defect category required marker aligns with its label', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(sheet, /class="label category-label">\{\{ translateText\('疵点类别'\) \}\}/)
  assert.match(sheet, /\.label-row \{[^}]*align-items: center;[^}]*margin-bottom: 20rpx;/)
  assert.match(sheet, /\.category-label \{[^}]*margin-bottom: 0;/)
})

/** 清单备注位于媒体库之前，始终可写且与疵点评论共用白底浅灰边框视觉。 */
test('check item remarks match H5 placement and defect comment styling', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const defect = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.ok(sheet.indexOf('class="notes-section"') < sheet.indexOf('class="media-section"'))
  assert.match(sheet, /<text class="section-title">\{\{ translateText\('备注'\) \}\}<\/text>/)
  assert.match(sheet, /<textarea class="remarks" :value="noteDraft"[^>]*:placeholder="translateText\('写评论'\)"/)
  assert.doesNotMatch(sheet, /class="notes-preview"/)
  for (const source of [sheet, defect]) {
    const style = source.match(/\.(?:remarks|comment-input) \{([^}]*)\}/)?.[1] ?? ''
    for (const declaration of ['min-height: 150rpx;', 'padding: 20rpx 24rpx;', 'border-width: 2rpx;', 'border-style: solid;', 'border-color: #e5e7eb;', 'border-radius: 16rpx;', 'font-size: 28rpx;', 'background-color: #ffffff;']) assert.ok(style.includes(declaration), declaration)
  }
})

/** 原生弹层不应混排文本节点，检查点文字应直接设置原生 text 样式。 */
test('popup text nodes and checkpoint label retain native styling', async () => {
  const comments = await readFile('components/detail/CommentsSheet.uvue', 'utf8')
  const defect = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.doesNotMatch(comments, /<text class="author">\{\{ reply\.authorName[^<]*<text/)
  assert.doesNotMatch(defect, /<text class="label">疵点类别\s*<text/)
  assert.match(defect, /<text class="checkpoint-text">\{\{ selectedItemLabel \}\}<\/text>/)
  assert.match(defect, /\.checkpoint-text\s*\{[^}]*color:\s*#334155;[^}]*font-size:\s*28rpx/)
})

test('native popup icons load the bundled font from static assets', async () => {
  const icon = await readFile('components/icons/AppIcon.uvue', 'utf8')
  const font = await readFile('static/fonts/uniicons.ttf')
  assert.match(icon, /src:\s*url\(['"]?\/static\/fonts\/uniicons\.ttf['"]?\)/)
  assert.match(icon, /font-family:\s*QcmUniIcons/)
  assert.ok(font.length > 0)
})

test('checklist tab follows the H5 normal and merged inspection contract', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  const swipeCell = await readFile('components/common/SwipeResultCell.uvue', 'utf8')

  for (const contract of ['standardItems', 'hasMergedInspectionPlans', 'inspectionPlanRows', 'checklistData', 'defects', 'severityOptions']) {
    assert.match(checklist, new RegExp(contract))
  }
  assert.match(checklist, /clientOrderNo/)
  assert.match(checklist, /subGoodsNo/)
  assert.match(checklist, /batchNo/)
  assert.match(checklist, /open-defect/)
  assert.match(checklist, /set-result/)
  assert.match(checklist, /photo-capture/)
  assert.match(checklist, /import SwipeResultCell/)
  assert.ok((checklist.match(/<SwipeResultCell/g) || []).length >= 2)
  assert.match(checklist, /@left-open=/)
  assert.match(checklist, /@select-result=/)
  assert.match(swipeCell, /@touchstart=/)
  assert.match(swipeCell, /@touchmove=/)
  assert.match(swipeCell, /@touchend=/)
  assert.match(swipeCell, /合格/)
  assert.match(swipeCell, /不合格/)
  assert.match(swipeCell, /待定/)
  assert.match(swipeCell, /不适用/)
  assert.match(page, /:standard-items=/)
  assert.match(page, /:inspection-plan-rows=/)
  assert.match(page, /@set-result=/)
})

test('checklist uses the shared icon font instead of temporary text glyphs', async () => {
  const appIcon = await readFile('components/icons/AppIcon.uvue', 'utf8')
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  const swipeCell = await readFile('components/common/SwipeResultCell.uvue', 'utf8')

  for (const iconType of ['arrowRight', 'arrowDown', 'camera', 'star', 'check', 'warning', 'help', 'clear']) {
    assert.match(appIcon, new RegExp(`props\\.type === '${iconType}'`))
  }
  assert.ok(appIcon.includes("if (props.type === 'arrowRight') return '\\ue6b5'"))
  assert.ok(appIcon.includes("if (props.type === 'arrowDown') return '\\ue6b8'"))
  assert.match(checklist, /import AppIcon/)
  assert.match(checklist, /type="camera"/)
  assert.match(checklist, /type="star"/)
  assert.match(checklist, /expandedSections\[section\.id\] \? 'arrowDown' : 'arrowRight'/)
  assert.match(swipeCell, /import AppIcon/)
  assert.match(swipeCell, /action\.icon/)
  assert.doesNotMatch(checklist, /⌄|▣/)
})

test('checklist rows use compact vertical spacing and visible separators', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.match(checklist, /\.section-children\s*\{[^}]*border-top-width:\s*1rpx/)
  assert.match(checklist, /\.section-children\s*\{[^}]*border-top-color:\s*#e5e7eb/)
  assert.match(checklist, /\.checklist-row-wrap\s*\{[^}]*border-bottom-width:\s*1rpx/)
  assert.match(checklist, /\.checklist-row-wrap\s*\{[^}]*border-bottom-color:\s*#e5e7eb/)
  assert.match(checklist, /\.inspection-plan-card\s*\{[^}]*border-top-width:\s*1rpx/)
  assert.match(checklist, /\.checklist-main\s*\{[^}]*height:\s*120rpx/)
  assert.match(checklist, /\.checklist-item\s*\{[^}]*padding:\s*0 16rpx 0 28rpx/)
  assert.match(checklist, /\.inspection-plan-row\s*\{[^}]*padding:\s*0 24rpx 0 28rpx/)
  assert.match(checklist, /\.checklist-section\s*\{[^}]*margin-bottom:\s*12rpx/)
})

/** 疵点标记必须是独立可绘制的原生视图，覆盖普通行和合并子行的整块高度。 */
test('checklist renders a full-height defect marker in both row types', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.equal((checklist.match(/class="defect-indicator"/g) ?? []).length, 2)
  assert.match(checklist, /v-if="getItemDefects\(child\.id\)\.length > 0" class="defect-indicator" :class="getItemResult\(child\.id\)"/)
  assert.match(checklist, /v-if="getItemDefects\(child\.id, plan\.id\)\.length > 0" class="defect-indicator" :class="getItemResult\(child\.id, plan\.id\)"/)
  assert.match(checklist, /\.defect-indicator\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*bottom:\s*0;[^}]*background-color:\s*#ef4444/)
})

/** 合并子行须与主行共用左边缘，结果色条不能被子行内容内边距推离边框。 */
test('merged checklist rows place result and defect markers at the outer left edge', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  const listStyle = checklist.match(/\.inspection-plan-list\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.doesNotMatch(listStyle, /padding-left:\s*34rpx/)
  assert.match(checklist, /v-if="getItemResult\(child\.id, plan\.id\) !== '' && getItemDefects\(child\.id, plan\.id\)\.length === 0" class="status-indicator checklist-result-indicator"/)
  assert.match(checklist, /\.checklist-result-indicator\s*\{[^}]*position:\s*absolute;[^}]*left:\s*0;[^}]*top:\s*0;[^}]*bottom:\s*0;/)
  assert.match(checklist, /class="check-item-block inspection-plan-card"[\s\S]*?class="status-indicator checklist-result-indicator"[\s\S]*?class="inspection-plan-row checklist-item"/)
})

/** 主行与子行使用相同的内容左距，结果标记贴边且不挤动主行文字。 */
test('parent checklist row shares merged child left padding regardless of result', async () => {
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.match(checklist, /v-if="getItemResult\(child\.id\) !== '' && getItemDefects\(child\.id\)\.length === 0" class="status-indicator checklist-result-indicator"/)
  assert.match(checklist, /class="check-item-block"[\s\S]*?class="status-indicator checklist-result-indicator"[\s\S]*?class="checklist-item"/)
})

/** 窄屏右划时右侧结果按钮不能从左侧快捷操作下方露出。 */
test('swipe cell mounts result actions only while swiping left', async () => {
  const swipeCell = await readFile('components/common/SwipeResultCell.uvue', 'utf8')
  assert.match(swipeCell, /<view v-if="showRightActions" class="swipe-right-actions">/)
  assert.match(swipeCell, /\.swipe-left-action\s*\{[^}]*z-index:\s*1/)
  assert.match(swipeCell, /function close\([^)]*\)[\s\S]*?scheduleRightActionsHide\(\)/)
  assert.match(swipeCell, /function scheduleRightActionsHide\([^)]*\)[^\n]*setTimeout\([^\n]*SWIPE_TRANSITION_MS/)
  assert.match(swipeCell, /if \(gestureAxis !== 'horizontal'\) \{ if \(offsetX\.value >= 0\) scheduleRightActionsHide\(\); return \}/)
})

/** 右滑快捷块缩窄，左滑选择检查结果时不渲染左侧遮挡层。 */
test('checklist swipe keeps its left result block narrow and out of right actions', async () => {
  const swipeCell = await readFile('components/common/SwipeResultCell.uvue', 'utf8')
  assert.match(swipeCell, /<view v-if="offsetX > 0" class="swipe-left-action"/)
  assert.match(swipeCell, /function leftActionWidth\(\) \{ return uni\.rpx2px\(120\) \}/)
  assert.match(swipeCell, /\.swipe-left-action \{[^}]*width: 120rpx;/)
  assert.match(swipeCell, /<view v-if="showRightActions" class="swipe-right-actions">/)
})

/** 多次快速检查只在空闲后保存最新草稿，不让本地写入压住回弹动画。 */
test('checklist draft saves after the swipe rebound and flushes on exit', async () => {
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(detail, /detail\.value = updateChecklistResult\(detail\.value, dataKey, result\)/)
  assert.match(detail, /const CHECKLIST_SAVE_IDLE_MS = 750/)
  assert.match(detail, /saveTimer = setTimeout\(\(\) => \{ saveTimer = null; persistDraft\(\{ markDirty: true, skipIfClean: true \}\) \}, CHECKLIST_SAVE_IDLE_MS\)/)
  assert.match(detail, /function flushTouchedDraft\(\)/)
})

/** 检查备注失焦后自动保存，不依赖确认按钮；关闭和选结果也不丢失未失焦输入。 */
test('check item notes save on blur without separate close or confirm actions', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(sheet, /<textarea class="remarks" :value="noteDraft"/)
  assert.match(sheet, /@blur="saveNotesOnBlur"/)
  assert.doesNotMatch(sheet, /class="notes-actions"/)
  assert.match(sheet, /function updateComment\([^)]*\) \{ noteDraft\.value = event\.detail\.value \}/)
  assert.match(sheet, /function saveNotesOnBlur\([^)]*\)[^\n]*autoSaveDraft\(\)/)
  assert.match(sheet, /function closeSheet\([^)]*\) \{ saveNotesOnBlur\(\); emit\('close'\) \}/)
  assert.match(sheet, /function confirmResult\([^)]*\)[^\n]*saveNotesOnBlur\(\)/)
  assert.doesNotMatch(sheet, /function updateComment\([^)]*\)[^\n]*autoSaveDraft\(\)/)
})

/** 检查项滚动内容用外边距留白，避免 100% 宽度叠加内边距后右侧边框被裁切。 */
test('check item sheet gives every bordered control symmetric scroll gutters', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(sheet, /<scroll-view class="sheet-body"[^>]*>\s*<view class="sheet-body-content">/)
  assert.match(sheet, /\.sheet-body \{[^}]*width: 100%;[^}]*box-sizing: border-box;/)
  assert.match(sheet, /\.sheet-body-content \{[^}]*margin-left: 28rpx;[^}]*margin-right: 28rpx;[^}]*padding-top: 24rpx;/)
  assert.doesNotMatch(sheet, /\.sheet-body-content \{[^}]*width: 100%;/)
  assert.doesNotMatch(sheet, /\.sheet-body \{[^}]*padding: 24rpx 28rpx;/)
  assert.match(sheet, /<textarea class="remarks"[^>]*>/)
  assert.match(sheet, /<AppButton[^>]*block @press="requestCopyItems"/)
})

/** 四态结果按钮不显示外框，其他复用操作按钮仍有原生描边。 */
test('check item result choices are borderless while other actions keep borders', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const button = await readFile('components/common/AppButton.uvue', 'utf8')
  assert.doesNotMatch(sheet, /\.result-circle\s*\{[^}]*border-(?:width|style|color):/)
  assert.doesNotMatch(sheet, /\.result-circle\.active\s*\{[^}]*border-/)
  assert.match(button, /\.app-button\s*\{[^}]*border-width:\s*2rpx;[^}]*border-style:\s*solid;[^}]*border-color:\s*#cbd5e1/)
  assert.match(button, /\.app-button\.icon\s*\{[^}]*border-width:\s*2rpx;[^}]*border-color:\s*#cbd5e1/)
  assert.doesNotMatch(button, /\.app-button\.result\.selected\s*\{\s*border-width:\s*0/)
})

/** 所有详情业务弹层使用原生底部弹层，最终确认另在总结弹层内居中展示。 */
test('every detail business popup is implemented as a bottom sheet', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const sheetContracts = [
    ['components/detail/CheckItemSheet.uvue', 'overlay'],
    ['components/detail/QuickDefectSheet.uvue', 'overlay'],
    ['components/detail/FinishInspectionSheet.uvue', 'overlay'],
    ['components/inspection/ReadyQuantitySheet.uvue', 'ready-overlay'],
    ['components/detail/CopyCheckItemsSheet.uvue', 'overlay'],
    ['components/detail/BatchMoveMediaSheet.uvue', 'overlay'],
    ['components/detail/PhotoEditorSheet.uvue', 'overlay'],
    ['components/detail/SampleQuantitySheet.uvue', 'overlay'],
    ['components/common/ConfirmActionSheet.uvue', 'overlay']
  ]

  for (const [path, overlayClass] of sheetContracts) {
    const source = await readFile(path, 'utf8')
    assert.match(source, new RegExp(`\\.${overlayClass}\\s*\\{[^}]*justify-content:\\s*flex-end`))
  }
  assert.match(page, /import SampleQuantitySheet/)
  assert.match(page, /import ConfirmActionSheet/)
  assert.doesNotMatch(page, /uni\.showModal/)
})

test('plan info tab contains every H5 field and merged inspection cards', async () => {
  const source = await readFile('components/detail/PlanInfoTab.uvue', 'utf8')
  for (const label of ['产品名称', '需验数量', '样品数量', '供应商名称', '交货日期', '清单', '验货类型', '抽样标准', '供应商编号', '客户名称', '客户编号', '货号', '客户订单号', '采购合同号', '制造令', '模具色卡号', '批次', '验货员']) {
    assert.match(source, new RegExp(label))
  }
  assert.match(source, /mergeType/)
  assert.match(source, /inspectionPlans/)
  assert.match(source, /合并验货/)
  assert.match(source, /总数量/)
})

test('defect tab follows H5 grouping and card fields', async () => {
  const source = await readFile('components/detail/DefectListTab.uvue', 'utf8')
  assert.match(source, /defectCounts/)
  assert.match(source, /defectGroups/)
  assert.match(source, /affectedTotal/)
  assert.match(source, /defectCode/)
  assert.match(source, /defectDesc/)
  assert.match(source, /createdAt/)
  assert.match(source, /open-defect/)
})

test('local data tab exposes full detail refresh and copy workflow', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const source = await readFile('components/detail/LocalDataTab.uvue', 'utf8')
  assert.match(source, /updatedAt/)
  assert.match(source, /contentText/)
  assert.match(source, /本地完整详情/)
  assert.match(source, /emit\('refresh'\)/)
  assert.match(source, /emit\('copy'\)/)
  assert.match(page, /refreshLocalReportDebug/)
  assert.match(page, /copyLocalReportDebug/)
  assert.match(page, /uni\.setClipboardData/)
})

/** 本地数据默认展示接口式详情，原始绑定排查数据按需切换。 */
test('local data defaults to API-shaped detail and keeps diagnostic access', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const tab = await readFile('components/detail/LocalDataTab.uvue', 'utf8')
  assert.match(page, /buildLocalDetailResponse\(storedDetail\)/)
  assert.match(page, /localReportDebugMode\.value === 'diagnostic'/)
  assert.match(tab, /@click="toggleMode"/)
  assert.match(tab, /mode === 'diagnostic'/)
})
