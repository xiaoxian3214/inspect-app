import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { createChecklistCopyService } = await loadUtsModule('services/checklistCopyService.uts')

/** 联网复制沿用 H5 接口参数，目标计划未下载结果时也不要求本地结果主键。 */
test('online copy uses the H5 endpoint without target item results', async () => {
  const calls = []
  const service = createChecklistCopyService({
    planApi: {
      copyCheckItems: async (payload) => calls.push(payload)
    },
    reportRepository: { getPlanById: async () => null },
    syncPending: async () => { throw new Error('clean source must not sync') }
  })
  const source = { planId: 'source', syncStatus: 'SYNCED', checklistData: { 'source-result': { result: 'pass' } } }
  const payload = { sourceItemId: 'source-result', targetItemIds: ['source-result'], targetPlanIds: ['target'], copyStatus: true, copyPhotos: false }

  const result = await service.copyOnline(source, payload)

  assert.deepEqual(calls, [{ sourcePlanId: 'source', ...payload }])
  assert.deepEqual(result, { staleLocalPlanIds: [], successCount: 1, failCount: 0, message: '', errorMessages: [] })
})

/** 源草稿未同步时必须先上传最新内容；同步仍失败则不能调用旧数据的服务端复制。 */
test('online copy waits for source draft sync before calling the H5 endpoint', async () => {
  let source = { planId: 'source', syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: '0' } }
  const calls = []
  const service = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async (id) => id === 'source' ? source : null },
    syncPending: async () => { calls.push('sync'); source = { ...source, syncStatus: 'SYNCED', pendingSyncPayload: null } }
  })
  await service.copyOnline(source, { targetPlanIds: ['target'], copyPhotos: false })
  assert.deepEqual(calls, ['sync', 'copy'])

  source = { ...source, syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: '0' } }
  calls.length = 0
  const failingService = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async (id) => id === 'source' ? source : null },
    syncPending: async () => calls.push('sync')
  })
  await assert.rejects(failingService.copyOnline(source, { targetPlanIds: ['target'] }), /源计划.*同步/)
  assert.deepEqual(calls, ['sync'])
})

/** 目标计划有未同步草稿时不能让服务端复制结果随后被旧本地草稿覆盖。 */
test('online copy rejects a target whose local draft remains pending', async () => {
  const calls = []
  const service = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async (id) => id === 'target' ? { planId: id, syncStatus: 'DIRTY' } : null },
    syncPending: async () => calls.push('sync')
  })

  await assert.rejects(service.copyOnline({ planId: 'source' }, { targetPlanIds: ['target'] }), /目标计划.*同步/)
  assert.deepEqual(calls, ['sync'])
})

/** 选择复制照片时先上传源检查项的本地照片，失败则不发起只含旧照片的复制。 */
test('online copy waits for selected source photos to upload', async () => {
  let source = { planId: 'source', checklistData: { item: { photos: [{ photoId: 'photo-1', localPath: '/local/photo.jpg' }] } } }
  const calls = []
  const service = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async (id) => id === 'source' ? source : null },
    syncPending: async () => { calls.push('sync'); source = { ...source, checklistData: { item: { photos: [{ photoId: 'photo-1', localPath: '/local/photo.jpg', fileId: 'file-1' }] } } } }
  })
  const payload = { sourceItemId: 'item', targetPlanIds: ['target'], copyPhotos: true }
  await service.copyOnline(source, payload)
  assert.deepEqual(calls, ['sync', 'copy'])

  source = { ...source, checklistData: { item: { photos: [{ photoId: 'photo-1', localPath: '/local/photo.jpg' }] } } }
  const failedService = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async (id) => id === 'source' ? source : null },
    syncPending: async () => calls.push('sync')
  })
  calls.length = 0
  await assert.rejects(failedService.copyOnline(source, payload), /照片.*上传/)
  assert.deepEqual(calls, ['sync'])
})

/** 内存中拍摄的照片即使未进入本地详情快照，也不能被在线复制静默遗漏。 */
test('online copy rejects unconfirmed source photos absent from the stored snapshot', async () => {
  const calls = []
  const service = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push('copy') },
    reportRepository: { getPlanById: async () => ({ planId: 'source', checklistData: { item: { photos: [] } } }) },
    syncPending: async () => calls.push('sync')
  })
  const source = { planId: 'source', checklistData: { item: { photos: [{ photoId: 'photo-1', localPath: '/local/photo.jpg' }] } } }
  await assert.rejects(service.copyOnline(source, { sourceItemId: 'item', targetPlanIds: ['target'], copyPhotos: true }), /照片.*上传/)
  assert.deepEqual(calls, ['sync'])
})

/** 服务端复制成功后刷新已缓存的目标详情；刷新失败不把成功的复制误报为失败。 */
test('online copy refreshes cached targets and reports stale caches separately', async () => {
  const calls = []
  const repository = {
    getPlanById: async (id) => id === 'target' ? { planId: id, itemResults: [] } : null,
    saveDetailSnapshot: async (id, detail) => calls.push(['save', id, detail.itemResults[0].id])
  }
  const service = createChecklistCopyService({
    planApi: {
      copyCheckItems: async () => calls.push(['copy']),
      getPlanDetail: async () => ({ itemResults: [{ id: 'target-result' }] })
    },
    reportRepository: repository,
    normalizeDetail: (detail, id) => ({ ...detail, planId: id })
  })

  assert.deepEqual(await service.copyOnline({ planId: 'source' }, { targetPlanIds: ['target'] }), { staleLocalPlanIds: [], successCount: 1, failCount: 0, message: '', errorMessages: [] })
  assert.deepEqual(calls, [['copy'], ['save', 'target', 'target-result']])

  const failedRefresh = createChecklistCopyService({
    planApi: { copyCheckItems: async () => calls.push(['copy']), getPlanDetail: async () => { throw new Error('offline') } },
    reportRepository: repository,
    normalizeDetail: (detail) => detail
  })
  assert.deepEqual(await failedRefresh.copyOnline({ planId: 'source' }, { targetPlanIds: ['target'] }), { staleLocalPlanIds: ['target'], successCount: 1, failCount: 0, message: '', errorMessages: [] })
})

/** HTTP 与顶层 success 成功也可能全部目标复制失败，须返回业务汇总和具体原因且不刷新失败目标。 */
test('online copy exposes per-target business failures instead of reporting success', async () => {
  const calls = []
  const service = createChecklistCopyService({
    planApi: {
      copyCheckItems: async () => ({
        sourcePlanId: 'source', totalTargetCount: 2, successCount: 0, failCount: 2,
        message: '批量复制完成：成功0个，失败2个',
        results: [
          { targetPlanId: 'target-1', success: false, errorMessage: '目标检查项与源检查项不属于同一验货计划' },
          { targetPlanId: 'target-2', success: false, errorMessage: '目标检查项与源检查项不属于同一验货计划' }
        ]
      }),
      getPlanDetail: async (id) => { calls.push(id); return { itemResults: [] } }
    },
    reportRepository: { getPlanById: async (id) => id === 'source' ? null : { planId: id } },
    normalizeDetail: (detail) => detail
  })

  const result = await service.copyOnline({ planId: 'source' }, { targetPlanIds: ['target-1', 'target-2'] })
  assert.deepEqual(result, {
    staleLocalPlanIds: [], successCount: 0, failCount: 2,
    message: '批量复制完成：成功0个，失败2个',
    errorMessages: ['目标检查项与源检查项不属于同一验货计划']
  })
  assert.deepEqual(calls, [])
})

/** 部分成功时只刷新成功目标，同时保留失败原因供页面提示。 */
test('online copy refreshes successful targets and reports partial failures', async () => {
  const refreshed = []
  const service = createChecklistCopyService({
    planApi: {
      copyCheckItems: async () => ({
        successCount: 1, failCount: 1, message: '批量复制完成：成功1个，失败1个',
        results: [
          { targetPlanId: 'target-1', success: true },
          { targetPlanId: 'target-2', success: false, errorMessage: '目标检查项不匹配' }
        ]
      }),
      getPlanDetail: async (id) => { refreshed.push(id); return { itemResults: [{ id }] } }
    },
    reportRepository: {
      getPlanById: async (id) => id === 'source' ? null : { planId: id },
      saveDetailSnapshot: async () => {}
    },
    normalizeDetail: (detail) => detail
  })

  const result = await service.copyOnline({ planId: 'source' }, { targetPlanIds: ['target-1', 'target-2'] })
  assert.deepEqual(refreshed, ['target-1'])
  assert.equal(result.successCount, 1)
  assert.equal(result.failCount, 1)
  assert.deepEqual(result.errorMessages, ['目标检查项不匹配'])
})
