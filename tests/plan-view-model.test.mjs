import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const planModule = await loadUtsModule('domain/planViewModel.uts')

test('normalizes H5 plan statuses into three app tabs', () => {
  assert.equal(planModule.normalizePlanStatus(0), 0)
  assert.equal(planModule.normalizePlanStatus('DOWNLOADED'), 0)
  assert.equal(planModule.normalizePlanStatus(2), 1)
  assert.equal(planModule.normalizePlanStatus('IN_PROGRESS'), 1)
  assert.equal(planModule.normalizePlanStatus('SUBMITTED'), 3)
})

test('uses the same plan identity fallbacks as H5', () => {
  assert.equal(planModule.getPlanUniqueId({ plan: { id: 'plan-1' }, reportId: 'report-1' }), 'plan-1')
  assert.equal(planModule.getPlanUniqueId({ planId: 'plan-2' }), 'plan-2')
  assert.equal(planModule.getPlanUniqueId({ reportId: 'report-3' }), 'report-3')
})

test('merges remote plans without replacing local downloaded data', () => {
  const local = [{ planId: 'p-1', status: 1, localOnly: true }]
  const remote = [
    { planId: 'p-1', status: 0, remoteOnly: true },
    { planId: 'p-2', status: 0 }
  ]

  assert.deepEqual(planModule.mergePlansLocalFirst(local, remote), [
    local[0],
    remote[1]
  ])
})

/** 下载后的稀疏本地摘要应保留本地状态，并从远程缓存补齐原卡片展示字段。 */
test('keeps plan card fields when a sparse downloaded summary replaces a remote row', () => {
  const local = { planId: 'p-1', status: 0, downloadedAt: '2026-10-09', plan: { id: 'p-1', goodsName: '', clientOrderNo: '' } }
  const remote = { planId: 'p-1', status: 0, plan: {
    id: 'p-1', goodsName: '原产品', subGoodsNo: 'SKU-1', batchNo: 'B-1',
    clientOrderNo: 'PO-1', factoryName: '原供应商', createDate: '2026-10-01'
  } }

  const [card] = planModule.mergePlansLocalFirst([local], [remote])

  assert.equal(card.status, 0)
  assert.equal(card.downloadedAt, '2026-10-09')
  assert.equal(card.plan.goodsName, '原产品')
  assert.equal(card.plan.subGoodsNo, 'SKU-1')
  assert.equal(card.plan.batchNo, 'B-1')
  assert.equal(card.plan.clientOrderNo, 'PO-1')
  assert.equal(card.plan.factoryName, '原供应商')
  assert.equal(card.plan.createDate, '2026-10-01')
  assert.equal(local.plan.goodsName, '')
})

/** 拆分的 plan 包装中字段为空时应从原卡片平铺字段补回验货类型。 */
test('fills split download inspection type from flat source when nested type is empty', () => {
  const record = { planId: 'p-1', plan: { id: 'p-1', inspectType: '' } }
  const source = { planId: 'p-1', inspectType: 'FINAL', inspectTypeName: '最终验货', plan: { mergeType: 1, inspectType: '' } }
  const result = planModule.fillMissingPlanCardFields(record, source)
  assert.equal(result.plan.inspectType, 'FINAL')
  assert.equal(result.plan.inspectTypeName, '最终验货')
  assert.equal(record.plan.inspectType, '')
})

/** 释放成功后从本地及远程缓存移除目标计划，合并计划则移除同组成员。 */
test('filters released plans from cached rows by ID or merged parent', () => {
  const rows = [
    { planId: 'p-1', status: 1 },
    { plan: { id: 'p-2', parentPlanId: 'merged-1' }, status: 1 },
    { planId: 'p-3', raw: { parentPlanId: 'merged-1' }, status: 1 },
    { planId: 'p-4', parentPlanId: 'other', status: 1 }
  ]

  assert.deepEqual(planModule.filterReleasedPlans(rows, ['p-1'], ''), rows.slice(1))
  assert.deepEqual(planModule.filterReleasedPlans(rows, ['p-2'], 'merged-1'), [rows[0], rows[3]])
  assert.deepEqual(planModule.filterReleasedPlans(rows, [], ''), rows)
})

/** 嵌套 parentPlanId 为空时仍应识别平铺的合并组字段。 */
test('filters merged sibling whose nested parent is empty', () => {
  const sibling = { planId: 'child-1', parentPlanId: 'merged-1', plan: { parentPlanId: '' } }
  assert.deepEqual(planModule.filterReleasedPlans([sibling], [], 'merged-1'), [])
})

/** 云端成员缺失父 ID 时，仍可根据释放服务返回的成员 ID 移除列表卡片。 */
test('filters remote merged siblings by resolved release IDs', () => {
  const rows = [{ planId: 'child-1' }, { plan: { id: 'child-2' } }, { planId: 'other' }]
  assert.deepEqual(planModule.filterReleasedPlans(rows, ['child-1', 'child-2'], 'merged-1'), [rows[2]])
})

test('groups plans by client order and preserves first-seen order', () => {
  const groups = planModule.groupPlans([
    { planId: '1', plan: { clientOrderNo: 'PO-1', factoryName: 'A' } },
    { planId: '2', plan: { clientOrderNo: 'PO-2', factoryName: 'B' } },
    { planId: '3', plan: { clientOrderNo: 'PO-1', factoryName: 'A' } }
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].clientOrderNo, 'PO-1')
  assert.deepEqual(groups[0].items.map((item) => item.planId), ['1', '3'])
})

test('splits downloaded report bundles into local plan records', () => {
  const result = planModule.splitDownloadDataToLocalPlans({
    report: { id: 'report-1' },
    plans: [
      { id: 'plan-1', clientOrderNo: 'PO-1' },
      { id: 'plan-2', clientOrderNo: 'PO-1' }
    ],
    checklistData: { shared: true }
  })

  assert.equal(result.length, 2)
  assert.equal(result[0].planId, 'plan-1')
  assert.equal(result[0].report.id, 'report-1')
  assert.deepEqual(result[1].checklistData, { shared: true })
})

test('preserves H5 local status and sync metadata when restoring plan detail', () => {
  const result = planModule.splitDownloadDataToLocalPlans({
    report: { id: 'r-1' },
    inspectionPlans: [{ id: 'p-1', status: 2, goodsName: '产品A' }]
  })

  assert.equal(result[0].status, 1)
  assert.equal(result[0].syncStatus, 'SYNCED')
  assert.equal(result[0].pendingSyncPayload, null)
  assert.equal(result[0].progress, 0)
  assert.notEqual(result[0].downloadedAt, '')
  assert.equal(result[0].plan.goodsName, '产品A')
})
