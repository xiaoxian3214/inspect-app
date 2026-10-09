import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/planOperationService.uts')
const searchViewModel = await loadUtsModule('domain/searchViewModel.uts')

/**
 * 创建可观察调用记录的计划操作服务测试夹具。
 */
function createFixture(localPlans = []) {
  const calls = []
  const removed = []
  const service = serviceModule.createPlanOperationService({
    planApi: {
      mergePlans: async (ids) => { calls.push(['merge', ids]); return { id: 'merged-1' } },
      splitPlan: async (id) => { calls.push(['split', id]); return [{ id: 'p-1' }] },
      copyPlan: async (id, payload) => { calls.push(['copy', id, payload]); return { id: 'copy-1' } },
      releasePlan: async (id, flag) => { calls.push(['release', id, flag]); return { released: true } }
    },
    reportRepository: {
      listPlans: async () => localPlans,
      removePlansByIds: async (ids) => removed.push(...ids)
    },
    planDownloadService: {
      downloadToLocal: async (id, payload) => { calls.push(['download', id, payload]); return [{ planId: id }] }
    },
    searchViewModel
  })
  return { service, calls, removed }
}

test('delegates merge, split, copy, and download workflows', async () => {
  const { service, calls } = createFixture()

  assert.equal((await service.mergePlans(['p-1', 'p-2'])).id, 'merged-1')
  assert.deepEqual(await service.splitPlan('merged-1'), [{ id: 'p-1' }])
  assert.equal((await service.copyPlan('p-1', { inspectType: 'FINAL', copyFlag: 1 })).id, 'copy-1')
  assert.deepEqual(await service.downloadToLocal('copy-1', { templateId: 't-1' }), [{ planId: 'copy-1' }])

  assert.deepEqual(calls, [
    ['merge', ['p-1', 'p-2']],
    ['split', 'merged-1'],
    ['copy', 'p-1', { inspectType: 'FINAL', copyFlag: 1 }],
    ['download', 'copy-1', { templateId: 't-1' }]
  ])
})

test('unlocks a merged plan and removes all local siblings in the same group', async () => {
  const localPlans = [
    { planId: 'p-1', parentPlanId: 'merged-1', mergeType: 2 },
    { planId: 'p-2', plan: { parentPlanId: 'merged-1', mergeType: 2 } },
    { planId: 'p-3', parentPlanId: 'other', mergeType: 2 }
  ]
  const { service, calls, removed } = createFixture(localPlans)

  const result = await service.unlockPlan(localPlans[0])

  assert.deepEqual(calls, [['release', 'p-1', 0]])
  assert.deepEqual(new Set(removed), new Set(['p-1', 'p-2']))
  assert.deepEqual(new Set(result.removedIds), new Set(['p-1', 'p-2']))
  assert.equal(result.parentPlanId, 'merged-1')
})

test('unlocks a normal plan and removes only its local record', async () => {
  const item = { planId: 'p-1', mergeType: 0 }
  const { service, removed } = createFixture([item, { planId: 'p-2' }])

  await service.unlockPlan(item)

  assert.deepEqual(removed, ['p-1'])
})
