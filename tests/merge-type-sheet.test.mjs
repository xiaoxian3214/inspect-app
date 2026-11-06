import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * 【选择合并验货类型】弹层的原生契约。
 *
 * 缺陷一（无法点击）：UTS 的 === 在 Kotlin 端编译为引用比较，父页面回传的 selectedInspectType
 * 与字典选项的 value 是不同字符串实例，选中态永远无法渲染，用户点击后看不到任何反馈。
 * 缺陷二（布局）：验货类型按内容宽度换行排布，行尾留下大片空白；H5 基准是
 * grid-template-columns: repeat(3, minmax(0, 1fr))，App 端需按每行 3 个等宽铺满实现。
 */
test('merge type chips select by content equality and pass plain strings', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  const template = source.split('</template>')[0]
  assert.match(template, /@click="selectInspectType\(cell\.value\)"/)
  assert.doesNotMatch(template, /selectInspectType\(cell\)/)
  assert.doesNotMatch(template, /selectInspectType\(option/)
  assert.match(template, /:class="\{ active: selectedInspectType == cell\.value \}"/)
  assert.doesNotMatch(template, /selectedInspectType === (cell|option)\.value/)
})

/** 每行固定 3 个、单元格 flex 平分整行，末行不足时补占位格保证同样三等分铺满。 */
test('merge type grid renders three equal columns per row', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const style = source.split('<style>')[1] ?? ''
  assert.match(source, /const MERGE_TYPE_COLUMNS = 3/)
  assert.match(source, /Math\.ceil\(options\.length \/ MERGE_TYPE_COLUMNS\)/)
  assert.match(template, /v-for="\(row, rowIndex\) in typeRows"[\s\S]*?v-for="cell in row"/)
  assert.match(template, /v-if="cell\.placeholder"[\s\S]*?v-else/)
  assert.match(style, /\.type-cell\s*\{[^}]*flex:\s*1/s)
  assert.match(style, /\.type-cell\s*\{[^}]*margin-left:\s*10rpx/s)
  assert.match(style, /\.type-cell\s*\{[^}]*margin-right:\s*10rpx/s)
  assert.match(style, /\.type-chip\s*\{[^}]*width:\s*100%/s)
  assert.match(style, /\.type-chip\s*\{[^}]*height:\s*112rpx/s)
})

/** 合并弹层改用 page-container 原生弹层：遮罩点击关闭，内容不再依赖 fixed 覆盖层与冒泡拦截。 */
test('merge sheet uses page-container popup with overlay close', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  assert.match(source, /<page-container\s+:show="visible"\s+position="bottom"\s+:overlay="true"[\s\S]*?@clickoverlay="closeSheet"/)
  assert.doesNotMatch(source, /class="sheet-overlay"|@click\.stop|position:\s*fixed/)
  assert.match(source, /function closeSheet\(\)[\s\S]*?emit\('close'\)/)
})

/** 搜索流程的其余底部弹层同样切换 page-container，层级保持原有 2200/3200 关系。 */
test('search flow sheets share the page-container popup pattern', async () => {
  const cases = [
    ['components/search/SearchFilterSheet.uvue', 2200],
    ['components/search/SplitPlanSheet.uvue', 2200],
    ['components/search/CopyPlanSheet.uvue', 2200],
    ['components/search/OptionSelectSheet.uvue', 3200]
  ]
  for (const [path, zIndex] of cases) {
    const source = await readFile(path, 'utf8')
    assert.match(
      source,
      new RegExp(`<page-container\\s+:show="visible"\\s+position="bottom"\\s+:overlay="true"\\s+:z-index="${zIndex}"[\\s\\S]*?@clickoverlay="closeSheet"`),
      path
    )
    assert.doesNotMatch(source, /position:\s*fixed/, path)
    assert.doesNotMatch(source, /@click\.stop/, path)
  }
})

/**
 * 【确认合并以下验货数据】弹层契约。
 *
 * 缺陷（数据多时无法滑动）：H5 基准（list.vue merge-confirm-modal）虽然限制 80vh，
 * 但浏览器会给超出部分纵向滚动条；App 端面板同样以 88% 窗口高兜底，却没有任何滚动容器，
 * 已选计划一多，超出面板的明细被直接裁掉：用户既看不到剩余计划，也够不到底部按钮。
 * 要求：标题与底部操作固定在滚动区之外，明细表格 + 清单模板放进纵向 scroll-view，
 * 滚动高度按窗口比例限制，面板继续以窗口高度兜底。
 */
test('merge confirm sheet scrolls overflowing rows and keeps actions reachable', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const style = source.split('<style>')[1] ?? ''
  // 明细区包在纵向 scroll-view 中：占满面板剩余高度，并以窗口比例高度兜底
  const scrollTag = template.match(/<scroll-view[^>]*confirm-body[^>]*>/)?.[0] ?? ''
  assert.match(scrollTag, /direction="vertical"/)
  assert.match(scrollTag, /:style="\{ maxHeight: confirmBodyMaxHeight \}"/)
  assert.match(style, /\.confirm-body\s*\{[^}]*flex:\s*1/s)
  assert.match(style, /\.confirm-body\s*\{[^}]*min-height:\s*0/s)
  // 滚动高度按窗口比例计算，且低于面板 88% 上限，为标题和底部按钮留出空间
  assert.match(source, /const confirmBodyMaxHeight = computed\(\(\): string => windowHeightPx\(0\.62\)\)/)
  assert.match(source, /const sheetMaxHeight = computed\(\(\): string => windowHeightPx\(0\.88\)\)/)
  // 表格在滚动区内，清单选择行固定在滚动区外，计划再多也无需滚动才能选清单
  const bodyStart = template.indexOf(scrollTag)
  const bodyEnd = template.indexOf('</scroll-view>', bodyStart)
  assert.ok(bodyStart > 0 && bodyEnd > bodyStart)
  const bodyBlock = template.slice(bodyStart, bodyEnd)
  assert.match(bodyBlock, /class="merge-table"/)
  assert.match(bodyBlock, /v-for="row in previewRows"/)
  assert.doesNotMatch(bodyBlock, /class="select-field"/)
  // 标题、清单选择行、合并成功提示和底部按钮都在滚动区之外，计划再多也始终可见
  const titleIndex = template.indexOf('class="sheet-title"')
  const selectIndex = template.indexOf('class="select-field"')
  const successIndex = template.indexOf('class="success-box"')
  const actionsIndex = template.indexOf('class="sheet-actions"')
  assert.ok(titleIndex > 0 && titleIndex < bodyStart)
  assert.ok(selectIndex > bodyEnd && selectIndex < successIndex)
  assert.ok(successIndex > bodyEnd && successIndex < actionsIndex)
  assert.ok(actionsIndex > bodyEnd)
  // 面板仍以窗口高度兜底，不做无限增高
  assert.match(template, /:style="\{ maxHeight: sheetMaxHeight, minHeight: sheetMinHeight \}"/)
  assert.match(source, /confirmStage[\s\S]*?windowHeightPx\(0\.7\)/)
  // 只滚动整个明细区，表格自身不再单独套一层滚动容器
  assert.doesNotMatch(source, /<scroll-view[^>]*merge-table-body/)
  assert.doesNotMatch(source, /\.merge-table-body\s*\{[^}]*max-height/)
})

/** 清单仅在合并成功后可见；合并完成即预置默认清单，下载前仍可改选。 */
test('merge checklist is deferred until download in both entry pages', async () => {
  const sheet = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  const confirmBody = sheet.split('<scroll-view v-else class="confirm-body"')[1]?.split('</scroll-view>')[0] ?? ''
  assert.doesNotMatch(confirmBody, /class="select-field"/)
  assert.match(sheet, /v-if="mergedPlanId !== '' && stage !== 'type'" class="section">[\s\S]*?class="select-field" @click="openTemplatePicker"/)
  // 清单用下拉选择行展示：左侧标题、右侧值 + 展开箭头，和复制弹层的选择项样式一致
  assert.doesNotMatch(sheet, /<picker\b/)
  assert.match(sheet, /class="select-field" @click="openTemplatePicker"/)
  assert.match(sheet, /class="select-label">\{\{ translateText\('清单模板'\) \}\}/)
  assert.match(sheet, /class="select-text"[^>]*>\{\{ templateValueText \}\}/)
  assert.match(sheet, /class="select-chevron">›<\/text>/)
  // 选择清单改用可调高度的底部选项弹层，不再是系统 picker
  assert.match(sheet, /import OptionSelectSheet from '\.\/OptionSelectSheet\.uvue'/)
  assert.match(sheet, /<OptionSelectSheet[^>]*:visible="showTemplateSheet"[^>]*:options="templateOptionRows"[^>]*:selected-value="selectedTemplateId"[^>]*@confirm="confirmTemplateOption"/)
  // 选择框优先回显页面预置的清单名称，未选择时才提示“请选择清单”
  assert.match(sheet, /selectedTemplateName: \{ type: String, default: '' \}/)
  assert.match(sheet, /const templateValueText = computed/)
  assert.match(sheet, /if \(props\.selectedTemplateName != ''\) return props\.selectedTemplateName/)
  assert.match(sheet, /name != '' \? name : translateText\('请选择清单'\)/)
  for (const page of ['pages/report/search.uvue', 'pages/report/list.uvue']) {
    const source = await readFile(page, 'utf8')
    const openConfirm = source.match(/function openMergeConfirm\(\): void \{([\s\S]*?)\n\t\}/)?.[1] ?? ''
    const merge = source.split('async function confirmMerge()')[1]?.split('async function downloadMergedPlan()')[0] ?? ''
    const templateLoader = source.split('async function prepareMergeTemplates()')[1]?.split('async function ')[0] ?? ''
    const defaultTemplate = source.split('function applyDefaultMergeTemplate(): void {')[1]?.split('async function ')[0] ?? ''
    const download = source.split('async function downloadMergedPlan()')[1]?.split('async function ')[0] ?? ''
    // 打开确认弹层时既不请求清单，也不预选清单；合并成功后才预置默认清单
    assert.doesNotMatch(openConfirm, /loadTemplateOptions|setMergeTemplate/)
    assert.match(openConfirm, /mergeTemplateId\.value = ''/)
    assert.match(openConfirm, /mergeTemplateName\.value = ''/)
    assert.match(openConfirm, /mergedPlanId\.value = ''/)
    assert.match(merge, /planOperationService\.mergePlans\(sourcePlanIds\)/)
    assert.match(merge, /await prepareMergeTemplates\(\)[\s\S]*?applyDefaultMergeTemplate\(\)/)
    assert.match(templateLoader, /await loadTemplateOptions\(\)/)
    // 默认清单优先取首个已选计划自带的模板（与 H5 一致），否则退回模板列表第一条
    assert.match(defaultTemplate, /getItemDownloadTemplate\(mergeSelectedItems\.value\[0\]\)/)
    assert.match(defaultTemplate, /setMergeTemplate\(templateOptions\.value\[0\]\)/)
    assert.match(source, /:selected-template-name="mergeTemplateName"/)
    // 下载前未定清单时阻止并提示
    assert.match(download, /if \(mergeTemplateId\.value === ''\)/)
    assert.match(download, /t\('请选择清单'\)/)
  }
})

/**
 * 【选择合并验货类型】阶段的溢出兜底。
 *
 * 类型弹层原先与确认阶段同病：面板只以 88% 窗口高兜底，类型网格没有任何滚动容器。
 * 字典验货类型较多或系统字号放大时，“开始选择”按钮会被顶出面板下缘、无法触达。
 * 要求：类型网格放进纵向 scroll-view，按窗口比例限制高度，底部按钮固定在滚动区外。
 */
test('merge type grid scrolls when inspect types overflow the panel', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const style = source.split('<style>')[1] ?? ''
  const scrollTag = template.match(/<scroll-view[^>]*type-body[^>]*>/)?.[0] ?? ''
  assert.match(scrollTag, /direction="vertical"/)
  assert.match(scrollTag, /:style="\{ maxHeight: typeBodyMaxHeight \}"/)
  assert.match(style, /\.type-body\s*\{[^}]*width:\s*100%/s)
  // 类型阶段面板 minHeight 为 0，类型区不能加 flex:1（会把网格塌成 0 高），只能靠 maxHeight 限高
  assert.doesNotMatch(style, /\.type-body\s*\{[^}]*flex:\s*1/s)
  assert.match(source, /const typeBodyMaxHeight = computed\(\(\): string => windowHeightPx\(0\.55\)\)/)
  const bodyStart = template.indexOf(scrollTag)
  const bodyEnd = template.indexOf('</scroll-view>', bodyStart)
  assert.ok(bodyStart > 0 && bodyEnd > bodyStart)
  const bodyBlock = template.slice(bodyStart, bodyEnd)
  assert.match(bodyBlock, /v-for="\(row, rowIndex\) in typeRows"/)
  // “开始选择”按钮在滚动区之外，类型再多也始终可点
  const actionsIndex = template.indexOf('class="sheet-actions"')
  assert.ok(actionsIndex > bodyEnd)
})
