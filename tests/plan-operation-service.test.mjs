import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/planOperationService.uts')
const searchViewModel = await loadUtsModule('domain/searchViewModel.uts')

/**
 * 创建可观察调用记录的计划操作服务测试夹具。
 */
function createFixture(localPlans = [], remotePages = []) {
  const calls = []
  const removed = []
  const searches = []
  const service = serviceModule.createPlanOperationService({
    planApi: {
      mergePlans: async (ids) => { calls.push(['merge', ids]); return { id: 'merged-1' } },
      splitPlan: async (id) => { calls.push(['split', id]); return [{ id: 'p-1' }] },
      copyPlan: async (id, payload) => { calls.push(['copy', id, payload]); return { id: 'copy-1' } },
      searchPlans: async (params, page, pageSize) => {
        searches.push([params, page, pageSize])
        return { records: remotePages[page - 1] ?? [], total: remotePages.flat().length }
      },
      releasePlan: async (id, flag) => { calls.push(['release', id, flag]); return { released: true } }
    },
    reportRepository: {
      listPlans: async () => localPlans,
      removePlansByIds: async (ids) => removed.push(...ids)
    },
    planDownloadService: {
      downloadToLocal: async (id, payload, expectedIds, sourceItems) => { calls.push(['download', id, payload, expectedIds, sourceItems]); return [{ planId: id }] }
    },
    searchViewModel
  })
  return { service, calls, removed, searches }
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
    ['download', 'copy-1', { templateId: 't-1' }, [], []]
  ])
})

/** 拆分结果逐条下载时将原卡片传入保存服务，避免缺失展示字段。 */
test('forwards split source card to local download persistence', async () => {
  const { service, calls } = createFixture()
  const sourceItem = { plan: { id: 'p-1', goodsName: '原产品' } }

  await service.downloadToLocal('p-1', { templateId: 't-1' }, [], [sourceItem])

  assert.deepEqual(calls, [['download', 'p-1', { templateId: 't-1' }, [], [sourceItem]]])
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

/** 合并父计划本身没有 parentPlanId 时仍须按父计划 ID 清理整组成员。 */
test('unlocks merged parent and all siblings without parentPlanId on parent', async () => {
  const localPlans = [
    { planId: 'merged-1', mergeType: 2 },
    { planId: 'child-1', parentPlanId: 'merged-1', mergeType: 2 },
    { planId: 'child-2', parentPlanId: 'merged-1', plan: { parentPlanId: '' }, mergeType: 2 },
    { planId: 'other', parentPlanId: 'other-group', mergeType: 2 }
  ]
  const { service, calls, removed } = createFixture(localPlans)

  const result = await service.unlockPlan(localPlans[0])

  assert.deepEqual(calls, [['release', 'merged-1', 0]])
  assert.equal(result.parentPlanId, 'merged-1')
  assert.deepEqual(new Set(result.removedIds), new Set(['merged-1', 'child-1', 'child-2']))
  assert.deepEqual(new Set(removed), new Set(result.removedIds))
})

/** 云端查询出的合并成员即使未回传父 ID，也必须随解锁一起从列表移除。 */
test('unlocks merged remote siblings not stored locally', async () => {
  const group = [{ planId: 'child-1' }, { planId: 'child-2', plan: { parentPlanId: 'merged-1' } }]
  const unrelated = { planId: 'other', parentPlanId: 'other-group' }
  const { service, calls, removed, searches } = createFixture([{ planId: 'child-1', parentPlanId: 'merged-1' }], [[...group, unrelated]])

  const result = await service.unlockPlan({ planId: 'child-1', parentPlanId: 'merged-1', mergeType: 2 })

  assert.deepEqual(calls, [['release', 'child-1', 0]])
  assert.deepEqual(searches, [[{ parentPlanId: 'merged-1' }, 1, 100]])
  assert.deepEqual(new Set(result.removedIds), new Set(['child-1', 'child-2']))
  assert.deepEqual(new Set(removed), new Set(result.removedIds))
})

/** 超过一页的合并成员也应全部纳入解锁清理范围。 */
test('resolves all pages of merged members before release', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ planId: `child-${index}` }))
  const { service, searches } = createFixture([], [firstPage, [{ planId: 'child-100' }]])
  const result = await service.unlockPlan({ planId: 'child-0', parentPlanId: 'merged-1', mergeType: 2 })
  assert.equal(result.removedIds.length, 101)
  assert.deepEqual(searches, [[{ parentPlanId: 'merged-1' }, 1, 100], [{ parentPlanId: 'merged-1' }, 2, 100]])
})

/** 重置也应清理只存在于远程列表的同组合并成员。 */
test('resets all merged remote siblings without removing unrelated plans', async () => {
  const { service, calls } = createFixture([], [[{ planId: 'child-1' }, { planId: 'child-2' }]])
  const result = await service.resetPlan({ planId: 'child-1', parentPlanId: 'merged-1', mergeType: 2 })
  assert.deepEqual(calls, [['release', 'child-1', 1]])
  assert.deepEqual(new Set(result.removedIds), new Set(['child-1', 'child-2']))
})

/** 重置合并成员仅请求一次云端释放，并清理整个合并组的本地记录。 */
test('resets a merged plan and removes all local siblings', async () => {
  const plans = [
    { planId: 'p-1', plan: { parentPlanId: 'merged-1', mergeType: 2 } },
    { planId: 'p-2', parentPlanId: 'merged-1', mergeType: 2 },
    { planId: 'p-3', parentPlanId: 'other', mergeType: 2 }
  ]
  const { service, calls, removed } = createFixture(plans)

  const result = await service.resetPlan(plans[0])

  assert.deepEqual(calls, [['release', 'p-1', 1]])
  assert.deepEqual(new Set(removed), new Set(['p-1', 'p-2']))
  assert.equal(result.parentPlanId, 'merged-1')
})

test('unlocks a normal plan and removes only its local record', async () => {
  const item = { planId: 'p-1', mergeType: 0 }
  const { service, removed } = createFixture([item, { planId: 'p-2' }])

  await service.unlockPlan(item)

  assert.deepEqual(removed, ['p-1'])
})
