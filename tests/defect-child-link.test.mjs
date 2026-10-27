import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/detailViewModel.uts')

/**
 * 合并子验货项疵点关联契约（对齐 H5 getItemResultIdForItem）。
 *
 * H5 打开疵点录入时用 getItemResultIdForItem(standardItemId, sonPlanId) 解析
 * checkItemResultId：优先取 itemResults 中已存在的子行真实主键（standardItemId+sonPlanId 匹配），
 * 不存在时才回退合成 `${原始主键}_${sonPlanId}`。
 * App 端 openNewDefect 直接拼 `${baseId}_${sonPlanId}`，一旦子行经同步/下载落库，
 * 其真实主键与合成串不同，疵点的 itemResultId 就指向不存在的行——疵点无法关联到子验货项。
 */
test('resolves an existing child item-result id before synthesizing one', () => {
  const detail = {
    itemResults: [
      { id: 'ir-100', standardItemId: 'std-1', sonPlanId: null },
      { id: 'srv-child-9', standardItemId: 'std-1', sonPlanId: 'child-9' }
    ]
  }
  // 子行已存在：必须返回真实主键
  assert.equal(
    viewModel.resolveDefectItemResultId(detail, 'base-1', 'std-1', 'child-9'),
    'srv-child-9'
  )
})

/** 子行尚不存在时按 H5 惯例合成 `原主键_子计划`，作为提交后服务端落库的 ID。 */
test('synthesizes the composite id when no child row exists yet', () => {
  const detail = { itemResults: [{ id: 'ir-100', standardItemId: 'std-1', sonPlanId: null }] }
  assert.equal(
    viewModel.resolveDefectItemResultId(detail, 'ir-100', 'std-1', 'child-9'),
    'ir-100_child-9'
  )
  // 没有任何结果行时回退 baseId 拼接，保持可预测
  assert.equal(
    viewModel.resolveDefectItemResultId({ itemResults: [] }, 'base-1', 'std-1', 'child-9'),
    'base-1_child-9'
  )
})

/** 主行（无子计划）取主行真实主键；standardItemId 缺失时退回按行 ID 匹配。 */
test('falls back through base row id when template ids are missing', () => {
  const detail = { itemResults: [{ id: 'ir-100', sonPlanId: null }, { id: 'ir-100_child-9', sonPlanId: 'child-9', baseItemResultId: 'ir-100' }] }
  // 无 standardItemId：按 baseId 直接匹配主行 → 子行合成串
  assert.equal(viewModel.resolveDefectItemResultId(detail, 'ir-100', '', 'child-9'), 'ir-100_child-9')
  // 主行场景：返回主行真实主键
  assert.equal(viewModel.resolveDefectItemResultId(detail, 'ir-100', '', ''), 'ir-100')
})

/** 页面打开疵点录入必须走真实主键解析，禁止再硬拼 baseId_sonPlanId。 */
test('detail page resolves real child result ids when opening defect sheet', async () => {
  const { readFile } = await import('node:fs/promises')
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(page, /resolveDefectItemResultId\(detail\.value, baseId,/)
  const opener = page.split('function openNewDefect(')[1].split('/** 打开已有疵点编辑弹层')[0]
  assert.match(opener, /resolveDefectItemResultId\(detail\.value, baseId,/)
  assert.doesNotMatch(opener, /makeItemResultId\(baseId, childPlanId\)/)
})

/** 展示侧：携带真实子行主键的疵点（H5 保存或服务端回传）也要落在对应子行下。 */
test('matches defects carrying real child row ids onto the child row', () => {
  const itemResults = [
    { id: 'ir-100', standardItemId: 'std-1', sonPlanId: null },
    { id: 'srv-child-9', standardItemId: 'std-1', sonPlanId: 'child-9' }
  ]
  const realIdDefect = { checkItemId: 'base-1', checkItemResultId: 'srv-child-9' }
  const compositeDefect = { checkItemId: 'base-1', checkItemResultId: 'ir-100_child-9' }

  assert.equal(viewModel.isDefectLinkedToItem(realIdDefect, 'base-1', 'std-1', 'child-9', itemResults), true)
  assert.equal(viewModel.isDefectLinkedToItem(compositeDefect, 'base-1', 'std-1', 'child-9', itemResults), true)
  // 别的子计划的疵点不得混入
  assert.equal(viewModel.isDefectLinkedToItem(realIdDefect, 'base-1', 'std-1', 'child-8', itemResults), false)
})

/** 主行匹配规则保持 H5 语义：checkItemResultId 为空或等于主行主键。 */
test('keeps H5 parent-row defect matching semantics', () => {
  const itemResults = [{ id: 'ir-100', standardItemId: 'std-1', sonPlanId: null }]
  assert.equal(viewModel.isDefectLinkedToItem({ checkItemId: 'ir-100', checkItemResultId: '' }, 'ir-100', 'std-1', '', itemResults), true)
  assert.equal(viewModel.isDefectLinkedToItem({ checkItemId: 'ir-100', checkItemResultId: 'ir-100' }, 'ir-100', 'std-1', '', itemResults), true)
  assert.equal(viewModel.isDefectLinkedToItem({ checkItemId: 'ir-100', checkItemResultId: 'ir-100_child-9' }, 'ir-100', 'std-1', '', itemResults), false)
})

/** 清单 Tab 与检查项弹层的疵点匹配必须统一走 isDefectLinkedToItem，避免两套规则。 */
test('checklist tab and item sheet share the same defect matcher', async () => {
  const { readFile } = await import('node:fs/promises')
  const tab = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(tab, /isDefectLinkedToItem\(defect, itemId, '', sonPlanId, props\.itemResults/)
  assert.match(tab, /itemResults: \{ type: Array, default: \(\) => \[\] \}/)
  assert.match(page, /:item-results="detail\?\.itemResults \?\? \[\]"/)
  assert.match(page, /isDefectLinkedToItem\(defect, baseId, templateId, sonPlanId, detail\.value\?\.itemResults\)/)
})
