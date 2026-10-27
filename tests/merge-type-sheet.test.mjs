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
 * H5 基准（list.vue merge-confirm-modal）：明细表整体随弹窗自然展开，表格本身没有内部滚动；
 * App 端原实现给表格套了 max-height: 360rpx 的 scroll-view，条目稍多就要上下滚动，
 * 与 H5 不一致且小屏上操作局促。要求：明细表不再内滚、全部展开；确认阶段弹层加高。
 */
test('merge confirm sheet expands rows without inner scrolling and grows taller', async () => {
  const source = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  // 明细表不得再套 scroll-view 或 max-height 限制
  assert.doesNotMatch(source, /<scroll-view[^>]*merge-table-body/)
  assert.doesNotMatch(source, /\.merge-table-body\s*\{[^}]*max-height/)
  // 确认阶段弹层整体最小高度加高（> 50% 窗口高），不足时撑开
  assert.match(source, /confirmStage[\s\S]*?windowHeightPx\(0\.7\)/)
  // 面板通过 :style 绑定 confirm 阶段高度，同时保留 maxHeight 兜底
  assert.match(source, /:style="\{ maxHeight: sheetMaxHeight, minHeight: sheetMinHeight \}"/)
})
