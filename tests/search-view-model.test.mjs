import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/searchViewModel.uts')

/** 搜索页解锁也须识别嵌套空值后的平铺合并父计划。 */
test('search unlocks merged siblings with flat parentPlanId', () => {
  const sibling = { planId: 'child-1', parentPlanId: 'merged-1', plan: { parentPlanId: '', lockFlag: 1 } }
  assert.equal(viewModel.getItemParentPlanId(sibling), 'merged-1')
  assert.equal(viewModel.markReleasedGroupPlans([sibling], [], 'merged-1')[0].plan.lockFlag, 0)
})

/** 拆分标记不应让平铺卡片的产品名称退化为“未命名产品”。 */
test('split keeps flat product names in result table and list card', () => {
  const flatItem = { planId: 'member-1', parentPlanId: 'merged-1', mergeType: 2, goodsName: '平铺产品', subGoodsNo: 'SKU-1' }
  const [result] = viewModel.markSplitSourcePlans([flatItem], ['member-1'])
  assert.equal(viewModel.getMergePreviewRow(result).productName, '平铺产品')
  assert.equal(result.plan.goodsName, undefined)
  assert.equal(viewModel.getMergePreviewRow({ plan: { goodsCname: '中文品名' } }).productName, '中文品名')
})

/** 拆分生成的 plan 包装不应遮蔽原卡片平铺的验货类型和名称。 */
test('split preserves the original inspection type for flat and nested cards', () => {
  const flat = { planId: 'flat-1', mergeType: 2, inspectType: 'FINAL', inspectTypeName: '最终验货' }
  const nested = { planId: 'nested-1', mergeType: 2, plan: { inspectType: '', inspectTypeName: '' }, inspectType: 'MID' }
  const [flatResult, nestedResult] = viewModel.markSplitSourcePlans([flat, nested], ['flat-1', 'nested-1'])

  assert.equal(viewModel.getItemInspectType(flatResult), 'FINAL')
  assert.equal(viewModel.getPlanInspectTypeLabel(flatResult), '最终验货')
  assert.equal(viewModel.getItemInspectType(nestedResult), 'MID')
  assert.equal(viewModel.getPlanInspectTypeLabel(nestedResult), 'MID')
  assert.equal(flatResult.inspectType, 'FINAL')
})

test('builds H5-compatible search params without inspector id', () => {
  const params = viewModel.buildSearchParams('  PO-100  ', {
    status: 'progress',
    inspectType: 'FINAL',
    startDate: '2026-09-01',
    endDate: '2026-09-17'
  })

  assert.equal(params.keyword, 'PO-100')
  assert.equal(params.status, 1)
  assert.equal(params.inspectType, 'FINAL')
  assert.equal(params.startDate, new Date('2026-09-01T00:00:00.000').toISOString())
  assert.equal(params.endDate, new Date('2026-09-17T23:59:59.999').toISOString())
  assert.equal('inspectorId' in params, false)
})

test('omits empty filters and maps report status', () => {
  assert.deepEqual(viewModel.buildSearchParams('ABC', {
    status: 'report',
    inspectType: '',
    startDate: '',
    endDate: ''
  }), {
    keyword: 'ABC',
    status: 3
  })
})

/** 计划日期筛选必须换算为所选日期的当天边界，而不是构造瞬间的当前时间。 */
test('date filters resolve to the picked day boundaries', () => {
  assert.equal(viewModel.toDateBoundaryIso('2026-10-22', false), new Date(2026, 9, 22, 0, 0, 0, 0).toISOString())
  assert.equal(viewModel.toDateBoundaryIso('2026-10-22', true), new Date(2026, 9, 22, 23, 59, 59, 999).toISOString())
  assert.equal(viewModel.toDateBoundaryIso('', true), '')
  assert.equal(viewModel.toDateBoundaryIso('not-a-date', true), '')
})

/** Android 的 new Date(string) 解析无时区串会退化为当前时间，必须用数字构造器换算边界。 */
test('toDateBoundaryIso never parses date text through the string Date constructor', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile('domain/searchViewModel.uts', 'utf8')
  const body = source.split('export function toDateBoundaryIso')[1]?.split('\n}')[0] ?? ''
  assert.ok(body.length > 0, 'toDateBoundaryIso should exist')
  assert.doesNotMatch(body, /new Date\(`/)
  assert.doesNotMatch(body, /new Date\((?!year)[a-zA-Z]/)
  assert.match(body, /new Date\(year, monthIndex, day/)
})

test('local downloaded record fully overrides the same remote plan', () => {
  const remote = [{ id: 'p-1', status: 0, goodsName: 'remote' }, { id: 'p-2' }]
  const local = [{ planId: 'p-1', status: 1, goodsName: 'local', photos: [{ id: 'photo-1' }] }]

  assert.deepEqual(viewModel.mergeRemoteWithLocal(remote, local), [local[0], remote[1]])
})

test('evaluates merge base eligibility and anchor compatibility', () => {
  const anchor = {
    id: 'p-1',
    status: 0,
    lockFlag: 0,
    mergeType: 0,
    inspectType: 'FINAL',
    factoryNo: 'F-1',
    goodsClass: 'SHOES'
  }
  const compatible = { ...anchor, id: 'p-2' }
  const wrongFactory = { ...anchor, id: 'p-3', factoryNo: 'F-2' }
  const locked = { ...anchor, id: 'p-4', lockFlag: 1 }

  assert.equal(viewModel.isBaseMergeEligible(anchor, 'FINAL'), true)
  assert.equal(viewModel.isBaseMergeEligible(locked, 'FINAL'), false)
  assert.equal(viewModel.isMergeSelectable(compatible, 'FINAL', anchor), true)
  assert.equal(viewModel.isMergeSelectable(wrongFactory, 'FINAL', anchor), false)
})

/** 未选时按 H5 取同组最大兼容集合，选定锚点后禁用不同工厂、货类或类型。 */
test('selects the largest compatible group and respects the first merge anchor', () => {
  const first = { id: 'p-1', status: 0, lockFlag: 0, mergeType: 0, inspectType: 'FINAL', factoryNo: 'F-1', goodsClass: 'SHOES' }
  const second = { ...first, id: 'p-2' }
  const otherFactory = { ...first, id: 'p-3', factoryNo: 'F-2' }
  const locked = { ...first, id: 'p-4', lockFlag: 1 }
  const group = { items: [otherFactory, first, second, locked] }

  assert.deepEqual(viewModel.getMergeGroupTargets(group, 'FINAL', []), [first, second])
  assert.deepEqual(viewModel.getMergeGroupTargets(group, 'FINAL', [otherFactory]), [otherFactory])
  assert.deepEqual(viewModel.getMergeGroupTargets(group, 'MID', []), [])
})

/** 合并接口可能直接返回 ID 或嵌套 data，下载必须使用真实父计划 ID。 */
test('extracts H5 merge result ID from primitive and nested responses', () => {
  assert.equal(viewModel.getMergedPlanId('merged-1'), 'merged-1')
  assert.equal(viewModel.getMergedPlanId(12), '12')
  assert.equal(viewModel.getMergedPlanId({ id: 'merged-2' }), 'merged-2')
  assert.equal(viewModel.getMergedPlanId({ data: { planId: 'merged-3' } }), 'merged-3')
  assert.equal(viewModel.getMergedPlanId({ data: 'merged-4' }), 'merged-4')
  assert.equal(viewModel.getMergedPlanId({ parentPlanId: 'merged-5' }), 'merged-5')
})

/** 合并确认表格优先读取嵌套计划字段，并在缺失时使用 H5 同款占位值。 */
test('builds H5 merge confirmation columns from nested and flat plans', () => {
  assert.deepEqual(viewModel.getMergePreviewRow({
    plan: { clientOrderNo: 'PO-1', subGoodsNo: 'SKU-1', batchNo: 'B-1', goodsName: '鞋子' },
    clientOrderNo: 'OLD'
  }), { orderNo: 'PO-1', itemBatch: 'SKU-1#B-1', productName: '鞋子' })
  assert.deepEqual(viewModel.getMergePreviewRow({ domeNo: 'D-2', goodsNo: 'IGNORED', productName: '外套' }), {
    orderNo: 'D-2', itemBatch: '-#-', productName: '外套'
  })
  assert.deepEqual(viewModel.getMergePreviewRow({ plan: { clientOrderNo: '', subGoodsNo: '', batchNo: '', goodsName: '' } }), {
    orderNo: '未分组', itemBatch: '-#-', productName: '-'
  })
})

/** 合并下载默认清单优先沿用计划自带模板，再兼容平铺与 raw 包装，缺失时退化为空串。 */
test('resolves the plan checklist template for the merge download default', () => {
  assert.deepEqual(viewModel.getItemDownloadTemplate({
    plan: { templateId: 't-1', templateName: '鞋类清单' },
    templateId: 'ignored', templateName: 'ignored'
  }), { id: 't-1', name: '鞋类清单' })
  assert.deepEqual(viewModel.getItemDownloadTemplate({ templateId: 't-2' }), { id: 't-2', name: 't-2' })
  assert.deepEqual(viewModel.getItemDownloadTemplate({ raw: { templateId: 't-3', templateName: '服装清单' } }), { id: 't-3', name: '服装清单' })
  assert.deepEqual(viewModel.getItemDownloadTemplate({ plan: { templateId: '', templateName: '' } }), { id: '', name: '' })
})

/** 合并成功后立即标记来源计划，防止远程列表刷新前再次选择。 */
test('marks merged source cards without changing unrelated rows', () => {
  const source = { plan: { id: 'p-1', status: 0, mergeType: 0 }, raw: { id: 'p-1' } }
  const other = { plan: { id: 'p-2', status: 0, mergeType: 0 } }
  const result = viewModel.markMergedSourcePlans([source, other], ['p-1'], 'merged-1')

  assert.equal(result[0].plan.mergeType, 2)
  assert.equal(result[0].raw.parentPlanId, 'merged-1')
  assert.equal(result[0].parentPlanId, 'merged-1')
  assert.equal(viewModel.isBaseMergeEligible(result[0], 'FINAL'), false)
  assert.equal(result[1], other)
  assert.equal(source.plan.mergeType, 0)
})

/** 拆分后立即恢复组内卡片标记，释放后同组搜索卡片一起解除锁定。 */
test('updates split and released merged-group cards without mutating unrelated rows', () => {
  const first = { plan: { id: 'p-1', mergeType: 2, lockFlag: 1, parentPlanId: 'merged-1' } }
  const second = { id: 'p-2', raw: { mergeType: 2, lockFlag: 1, parentPlanId: 'merged-1' } }
  const unrelated = { id: 'p-3', parentPlanId: 'other', lockFlag: 1 }

  const split = viewModel.markSplitSourcePlans([first, second, unrelated], ['p-1', 'p-2'])
  assert.equal(split[0].plan.mergeType, 1)
  assert.equal(split[1].raw.mergeType, 1)
  assert.equal(split[2], unrelated)

  const released = viewModel.markReleasedGroupPlans([first, second, unrelated], ['p-1'], 'merged-1')
  assert.equal(released[0].plan.lockFlag, 0)
  assert.equal(released[1].raw.lockFlag, 0)
  assert.equal(released[2], unrelated)
  assert.equal(first.plan.lockFlag, 1)
})

/** 拆分入口仅对未锁定、已定计划中的合并成员可用。 */
test('allows splitting only unlocked planned merged members', () => {
  const merged = { plan: { id: 'p-1', mergeType: 2, lockFlag: 0, status: 0 } }
  assert.equal(viewModel.isSplitAvailable(merged), true)
  assert.equal(viewModel.isSplitAvailable({ plan: { ...merged.plan, lockFlag: 1 } }), false)
  assert.equal(viewModel.isSplitAvailable({ plan: { ...merged.plan, status: 1 } }), false)
  assert.equal(viewModel.isSplitAvailable({ plan: { ...merged.plan, mergeType: 1 } }), false)
})

test('deduplicates split preview rows and prefers local versions', () => {
  const remote = [
    { id: 'p-1', parentPlanId: 'merged-1', goodsName: 'remote' },
    { id: 'p-2', parentPlanId: 'merged-1' },
    { id: 'p-3', parentPlanId: 'other' }
  ]
  const local = [{ planId: 'p-1', parentPlanId: 'merged-1', goodsName: 'local' }]

  assert.deepEqual(viewModel.buildSplitPreview(remote, local, 'merged-1'), [local[0], remote[1]])
})

test('extracts operation ids from nested plan shapes', () => {
  assert.equal(viewModel.getPlanOperationId({ plan: { planId: 'nested-1' } }), 'nested-1')
  assert.equal(viewModel.extractCopiedPlanId({ report: { id: 'report-1' } }), 'report-1')
})
