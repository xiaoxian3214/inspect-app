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
