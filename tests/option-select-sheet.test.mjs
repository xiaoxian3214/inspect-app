import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * 下载验货弹框内【选择清单】弹层的原生契约。
 *
 * 崩溃根因：父组件传入的选项数组元素是自定义类型实例（DownloadTemplateOption / CopyOption），
 * 组件内 `props.options as UTSJSONObject[]` 后用 option['value'] 索引取值；Android 端
 * UTS 编译为 Kotlin，对非 UTSJSONObject 实例调用索引取值会触发原生 abort（signal 6，闪退）。
 * 同理 confirm 事件把 OptionRow 自定义类型实例 emit 给按 UTSJSONObject 取值的父组件。
 * 修复约束：选项跨组件只传 UTSJSONObject 字面量；点击行只传字符串；confirm 只回传
 * UTSJSONObject 字面量；行 key 使用索引避免重复 id 键引发 keyed diff 崩溃。
 */
test('option sheet passes native-safe values through click and confirm events', async () => {
  const selector = await readFile('components/search/OptionSelectSheet.uvue', 'utf8')
  // 点击清单行只回传字符串值，禁止把 v-for 对象传入原生事件闭包
  assert.match(selector, /@click="chooseOption\(option\.value\)"/)
  assert.match(selector, /function chooseOption\(value: string\): void/)
  assert.doesNotMatch(selector, /chooseOption\(option\)/)
  // confirm 事件只回传 UTSJSONObject 字面量，父组件按 option['raw'] 读取原始模板
  assert.match(selector, /emit\('confirm', \{ value: selected\.value, label: selected\.label, raw: selected\.raw \}\)/)
  assert.doesNotMatch(selector, /emit\('confirm', selectedOption\.value\)/)
  // 行 key 使用索引，模板 id 缺失时不会出现重复键导致原生 keyed diff 崩溃
  assert.match(selector, /v-for="\(option, index\) in optionRows" :key="index"/)
})

/** 选中态必须用内容比较：UTS 的 === 在 Kotlin 端编译为引用比较，跨数据源字符串永远不相等。 */
test('option sheet compares selection by content equality', async () => {
  const selector = await readFile('components/search/OptionSelectSheet.uvue', 'utf8')
  assert.doesNotMatch(selector, /option\.value === draftValue/)
  assert.match(selector, /option\.value == draftValue/)
  assert.match(selector, /option\.value == draftValue\.value/)
})

/** 弹层更高：面板使用按窗口计算的固定高度，选项列表随之撑满并在窗口内限高。 */
test('option sheet is taller with window-based list height', async () => {
  const selector = await readFile('components/search/OptionSelectSheet.uvue', 'utf8')
  assert.match(selector, /const sheetHeight = computed\(\(\): string => windowHeightPx\(0\.88\)\)/)
  assert.match(selector, /<view class="option-panel" :style="\{ height: sheetHeight \}">/)
  assert.match(selector, /const listMaxHeight = computed\(\(\): string => windowHeightPx\(0\.7\)\)/)
  assert.match(selector, /:style="\{ maxHeight: listMaxHeight \}"/)
  assert.match(selector, /\.option-list\s*\{[^}]*flex:\s*1/s)
  assert.match(selector, /\.option-list\s*\{[^}]*min-height:\s*0/s)
  assert.doesNotMatch(selector, /max-height:\s*640rpx/)
})

/** 清单之间必须有分割线：原生端不显式声明 border-bottom-style: solid 时边框不渲染。 */
test('option sheet renders dividers between options', async () => {
  const selector = await readFile('components/search/OptionSelectSheet.uvue', 'utf8')
  assert.match(selector, /\.option-row\s*\{[^}]*border-bottom-width:\s*2rpx/)
  assert.match(selector, /\.option-row\s*\{[^}]*border-bottom-style:\s*solid/)
  assert.match(selector, /\.option-row\s*\{[^}]*border-bottom-color:\s*#[0-9a-f]{6}/)
})

/** 父组件只能向选择弹层传入真正的 UTSJSONObject 选项，禁止自定义类型实例跨组件传递。 */
test('parents feed option sheet with real UTSJSONObject arrays', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const copy = await readFile('components/search/CopyPlanSheet.uvue', 'utf8')
  const merge = await readFile('components/search/MergePlanSheet.uvue', 'utf8')
  assert.match(card, /const downloadTemplateOptions = computed\(\(\): UTSJSONObject\[\] =>/)
  assert.match(card, /value: \(item\['id'\] \?\? ''\)\.toString\(\), label: \(item\['name'\] \?\? ''\)\.toString\(\), raw: item/)
  assert.doesNotMatch(card, /type DownloadTemplateOption/)
  assert.match(copy, /const pickerOptions = computed\(\(\): UTSJSONObject\[\] =>/)
  assert.doesNotMatch(copy, /type CopyOption/)
  // 合并弹层的清单选择同样只传 UTSJSONObject 字面量，确认事件按 raw 取回原始模板
  assert.match(merge, /const templateOptionRows = computed\(\(\): UTSJSONObject\[\] =>/)
  assert.match(merge, /value: \(item\['id'\] \?\? ''\)\.toString\(\), label: \(item\['name'\] \?\? ''\)\.toString\(\), raw: item/)
  assert.doesNotMatch(merge, /type MergeTemplateOption/)
  assert.match(merge, /const raw = \(option\['raw'\] as UTSJSONObject \| null\) \?\? option/)
  assert.match(merge, /emit\('update-template', raw\)/)
})
