import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/** 保证详情首次渲染时，总结弹层引用的统计数据已由响应式计算属性提供。 */
test('detail page defines the finish summary used by the submit sheet', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /const finishSummary\s*=\s*computed\(\(\)\s*=>\s*buildFinishSummary\(detail\.value/)
  for (const field of ['defectStats', 'exceedsAql', 'failedCheckpoints']) {
    assert.match(source, new RegExp(`finishSummary\\.${field}`))
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
  assert.match(source, /if \(markDirty\) processSyncQueueAfterChange\(\)/)
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

test('detail offline operations update local data instead of calling copy and quantity APIs directly', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /copyChecklistItemToDetail/)
  assert.match(source, /copyChecklistPhotoToItem/)
  assert.match(source, /applyFinishQuantityRows/)
  assert.match(source, /applySampleQuantity/)
  assert.doesNotMatch(source, /planApi\.copyCheckItems/)
  assert.doesNotMatch(source, /planApi\.copyPhotosToItems/)
  assert.doesNotMatch(source, /planApi\.updateFinishQuantity/)
  assert.doesNotMatch(source, /planApi\.updateSampleQuantity/)
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
  assert.match(sheet, /先选择图片，再点击目标位置/)
  assert.match(page, /@photos-sorted="sortChecklistPhotos"/)
  assert.match(page, /function sortChecklistPhotos/)
  assert.match(page, /scheduleDraftSave\(\)/)
})

test('checklist tab keeps the H5 section hierarchy and direct photo action', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const checklist = await readFile('components/detail/ChecklistTab.uvue', 'utf8')

  assert.match(checklist, /expandedSections/)
  assert.match(checklist, /sectionName/)
  assert.match(checklist, /add-photo/)
  assert.match(checklist, /retry-detail/)
  assert.match(page, /@add-photo="addChecklistPhoto"/)
  assert.match(page, /@retry-detail="loadDetail"/)
})

test('finish sheet clearly explains online and photo upload requirements', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.match(source, /需要联网/)
  assert.match(source, /图片上传/)
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
  assert.match(source, /\.modal-footer-fixed\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*0/)
  assert.match(source, /\.sheet-body\s*\{[^}]*padding-bottom:\s*300rpx/)
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

  assert.match(sheet, /\.dialog\s*\{[^}]*position:\s*absolute;[^}]*top:\s*10%;[^}]*bottom:\s*0;/)
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
  assert.match(checklist, /\.checklist-item\s*\{[^}]*min-height:\s*96rpx[^}]*padding:\s*16rpx 24rpx/)
  assert.match(checklist, /\.checklist-section\s*\{[^}]*margin-bottom:\s*12rpx/)
})

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

test('local data tab exposes the H5 raw JSON refresh and copy workflow', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const source = await readFile('components/detail/LocalDataTab.uvue', 'utf8')
  assert.match(source, /updatedAt/)
  assert.match(source, /contentText/)
  assert.match(source, /本地报告数据/)
  assert.match(source, /emit\('refresh'\)/)
  assert.match(source, /emit\('copy'\)/)
  assert.match(page, /refreshLocalReportDebug/)
  assert.match(page, /copyLocalReportDebug/)
  assert.match(page, /uni\.setClipboardData/)
})
