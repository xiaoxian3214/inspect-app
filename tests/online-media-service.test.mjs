import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { createOnlineMediaService } = await loadUtsModule('services/onlineMediaService.uts')
const detailViewModel = await loadUtsModule('domain/detailViewModel.uts')

/** 排序须先确认草稿已同步，再提交服务端顺序和普通检查项报告。 */
test('online sort calls file sort then draft generate with the new order', async () => {
  const calls = []
  const detail = { planId: 'plan', checklistData: { item: { photos: [{ fileId: 'a' }, { fileId: 'b' }] } } }
  const service = createOnlineMediaService({
    isOnline: async () => true,
    syncPending: async () => calls.push('sync'),
    reportRepository: {
      getPlanById: async () => ({ ...detail, syncStatus: 'SYNCED' }),
      saveDetailSnapshot: async (_, saved) => calls.push(['save', saved.checklistData.item.photos.map((photo) => photo.fileId)])
    },
    reportFileApi: { sortInspectFiles: async (items) => calls.push(['sort', items]) },
    planApi: { generateReport: async (payload) => calls.push(['generate', payload]) },
    normalizeDetail: (source) => source,
    updateChecklistItem: (source, id, data) => ({ ...source, checklistData: { ...source.checklistData, [id]: data } }),
    buildGeneratePayload: (source) => ({ planId: source.planId, finishFlag: '0', itemResults: [{ fileList: source.checklistData.item.photos.map((photo) => ({ fileId: photo.fileId, sortNo: photo.sortNo })) }] })
  })

  await service.sortPhotos(detail, 'item', [{ fileId: 'b' }, { fileId: 'a' }])
  assert.deepEqual(calls, [
    'sync',
    ['sort', [{ fileId: 'b', sortNo: 1 }, { fileId: 'a', sortNo: 2 }]],
    ['generate', { planId: 'plan', finishFlag: '0', itemResults: [{ fileList: [{ fileId: 'b', sortNo: 1 }, { fileId: 'a', sortNo: 2 }] }] }],
    ['save', ['b', 'a']]
  ])
})

/** 离线或照片未上传时不得产生排序请求，更不能保存假的成功状态。 */
test('online sort rejects offline, pending photos and unsynced drafts', async () => {
  const calls = []
  let online = false
  let synced = true
  const service = createOnlineMediaService({
    isOnline: async () => online,
    syncPending: async () => calls.push('sync'),
    reportRepository: { getPlanById: async () => ({ ...detail, syncStatus: synced ? 'SYNCED' : 'DIRTY' }) },
    reportFileApi: { sortInspectFiles: async () => calls.push('sort') },
    planApi: { generateReport: async () => calls.push('generate') },
    normalizeDetail: (source) => source,
    updateChecklistItem: () => {}, buildGeneratePayload: () => ({})
  })
  const detail = { planId: 'plan', checklistData: { item: { photos: [] } } }
  await assert.rejects(service.sortPhotos(detail, 'item', [{ fileId: 'a' }]), /联网/)
  online = true
  await assert.rejects(service.sortPhotos(detail, 'item', [{ localPath: '/a.jpg' }]), /上传/)
  synced = false
  await assert.rejects(service.sortPhotos(detail, 'item', [{ fileId: 'a' }]), /同步/)
  assert.deepEqual(calls, ['sync'])
})

/** 批量复制仅走 H5 专用接口；成功后从服务端刷新来源，不用旧草稿覆盖服务端关联。 */
test('online batch media copy refreshes the source after server copy', async () => {
  const calls = []
  const detail = { planId: 'plan' }
  const service = createOnlineMediaService({
    isOnline: async () => true,
    syncPending: async () => calls.push('sync'),
    reportRepository: {
      getPlanById: async () => ({ ...detail, syncStatus: 'SYNCED' }),
      saveDetailSnapshot: async () => calls.push('save')
    },
    planApi: {
      copyPhotosToItems: async (request) => calls.push(['copy', request]),
      getPlanDetail: async () => { calls.push('refresh'); return { itemResults: [{ id: 'target' }] } }
    },
    normalizeDetail: (remote) => remote
  })
  const request = { sourcePlanId: 'plan', sourceItemId: 'source', targetPlanIds: ['plan'], targetItemIds: ['target'], fileIds: ['file'] }
  await service.copyPhotos(detail, [request])
  assert.deepEqual(calls, ['sync', ['copy', request], 'refresh', 'save'])
})

/** 文件复制接口顶层成功、目标全部失败时保留服务端汇总和具体原因，不能刷新或提示移动成功。 */
test('online media copy reports business failures without refreshing the report', async () => {
  const calls = []
  const service = createOnlineMediaService({
    isOnline: async () => true, syncPending: async () => {},
    reportRepository: { getPlanById: async () => ({ syncStatus: 'SYNCED' }), saveDetailSnapshot: async () => calls.push('save') },
    planApi: {
      copyPhotosToItems: async () => ({
        successCount: 0, failCount: 2, message: '批量移动完成：成功0个，失败2个',
        results: [
          { targetItemId: 'target-1', success: false, errorMessage: '目标检查项与源检查项不属于同一验货计划' },
          { targetItemId: 'target-2', success: false, errorMessage: '目标检查项与源检查项不属于同一验货计划' }
        ]
      }),
      getPlanDetail: async () => { calls.push('refresh'); return { itemResults: [] } }
    }
  })
  const request = { sourcePlanId: 'plan', sourceItemId: 'source', targetPlanIds: ['plan'], targetItemIds: ['target-1', 'target-2'], fileIds: ['file'] }
  const result = await service.copyPhotos({ planId: 'plan' }, [request])
  assert.equal(result.failCount, 2)
  assert.equal(result.successCount, 0)
  assert.equal(result.message, '批量移动完成：成功0个，失败2个')
  assert.deepEqual(result.errorMessages, ['目标检查项与源检查项不属于同一验货计划'])
  assert.deepEqual(calls, [])
})

/** 部分成功仍刷新服务端详情，并将失败信息交给页面居中弹框。 */
test('online media copy refreshes partial successes and exposes failure reasons', async () => {
  const calls = []
  const service = createOnlineMediaService({
    isOnline: async () => true, syncPending: async () => {},
    reportRepository: { getPlanById: async () => ({ syncStatus: 'SYNCED' }), saveDetailSnapshot: async () => calls.push('save') },
    planApi: {
      copyPhotosToItems: async () => ({ successCount: 1, failCount: 1, message: '批量移动完成：成功1个，失败1个', results: [{ success: false, errorMessage: '文件关联失败' }] }),
      getPlanDetail: async () => { calls.push('refresh'); return { itemResults: [] } }
    },
    normalizeDetail: (detail) => detail
  })
  const result = await service.copyPhotos({ planId: 'plan' }, [{ targetItemIds: ['a', 'b'] }])
  assert.deepEqual(calls, ['refresh', 'save'])
  assert.equal(result.failCount, 1)
  assert.deepEqual(result.errorMessages, ['文件关联失败'])
})

/** 网络断开或源草稿同步失败时批量复制不能进入接口或持久队列。 */
test('online batch copy refuses offline and dirty source states', async () => {
  let online = false
  let dirty = false
  const calls = []
  const service = createOnlineMediaService({
    isOnline: async () => online,
    syncPending: async () => calls.push('sync'),
    reportRepository: { getPlanById: async () => ({ syncStatus: dirty ? 'DIRTY' : 'SYNCED' }) },
    planApi: { copyPhotosToItems: async () => calls.push('copy') }
  })
  const requests = [{ sourcePlanId: 'plan', sourceItemId: 'item', targetPlanIds: ['plan'], targetItemIds: ['target'], fileIds: ['a'] }]
  await assert.rejects(service.copyPhotos({ planId: 'plan' }, requests), /联网/)
  online = true
  dirty = true
  await assert.rejects(service.copyPhotos({ planId: 'plan' }, requests), /同步/)
  assert.deepEqual(calls, ['sync'])
})

/** 文件排序接口或报告保存失败不得虚报成功、覆盖本地顺序。 */
test('sort does not persist local order when either online request fails', async () => {
  const calls = []
  let failSort = true
  const detail = { planId: 'plan', checklistData: { item: { photos: [{ fileId: 'a' }] } } }
  const service = createOnlineMediaService({
    isOnline: async () => true,
    syncPending: async () => {},
    reportRepository: {
      getPlanById: async () => ({ ...detail, syncStatus: 'SYNCED' }),
      saveDetailSnapshot: async () => calls.push('save')
    },
    reportFileApi: { sortInspectFiles: async () => { calls.push('sort'); if (failSort) throw new Error('sort rejected') } },
    planApi: { generateReport: async () => { calls.push('generate'); throw new Error('generate rejected') } },
    normalizeDetail: (source) => source,
    updateChecklistItem: (source) => source,
    buildGeneratePayload: () => ({ finishFlag: '0' })
  })
  await assert.rejects(service.sortPhotos(detail, 'item', [{ fileId: 'a' }]), /sort rejected/)
  assert.deepEqual(calls, ['sort'])
  failSort = false
  await assert.rejects(service.sortPhotos(detail, 'item', [{ fileId: 'a' }]), /generate rejected/)
  assert.deepEqual(calls, ['sort', 'sort', 'generate'])
})

/** 已同步的持久快照必须覆盖页面旧 DIRTY 元数据，避免下轮同步把排序回滚。 */
test('sort persists a clean synchronized snapshot rather than the stale page draft', async () => {
  const stale = { planId: 'plan', syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: '0' }, checklistData: { item: { photos: [{ fileId: 'a' }, { fileId: 'b' }] } } }
  const clean = { ...stale, syncStatus: 'SYNCED', pendingSyncPayload: null }
  let saved
  const service = createOnlineMediaService({
    isOnline: async () => true,
    syncPending: async () => {},
    reportRepository: { getPlanById: async () => clean, saveDetailSnapshot: async (_, detail) => { saved = detail } },
    reportFileApi: { sortInspectFiles: async () => {} },
    planApi: { generateReport: async () => {} },
    normalizeDetail: (detail) => detail,
    updateChecklistItem: (detail, id, data) => ({ ...detail, checklistData: { ...detail.checklistData, [id]: data } }),
    buildGeneratePayload: () => ({ finishFlag: '0' })
  })
  await service.sortPhotos(stale, 'item', [{ fileId: 'b' }, { fileId: 'a' }])
  assert.equal(saved.syncStatus, 'SYNCED')
  assert.equal(saved.pendingSyncPayload, null)
  assert.deepEqual(saved.checklistData.item.photos.map((photo) => photo.fileId), ['b', 'a'])
})

/** 真正的检查项模型把排序及 sortNo 放入 generate 的 fileList，且不会触发最终提交。 */
test('sort and generate integrate with the inspection detail payload', async () => {
  const stored = detailViewModel.normalizeInspectionDetail({
    plan: { id: 'plan', goodsName: 'Product' },
    standardItems: [{ children: [{ id: 'item', itemType: 'Standard' }] }],
    checklistData: { item: { photos: [{ fileId: 'a', filePath: '/a.jpg' }, { fileId: 'b', filePath: '/b.jpg' }] } },
    syncStatus: 'SYNCED', pendingSyncPayload: null
  }, 'plan')
  let sorted
  let generated
  const service = createOnlineMediaService({
    isOnline: async () => true, syncPending: async () => {},
    reportRepository: { getPlanById: async () => stored, saveDetailSnapshot: async () => {} },
    reportFileApi: { sortInspectFiles: async (items) => { sorted = items } },
    planApi: { generateReport: async (payload) => { generated = payload } },
    normalizeDetail: detailViewModel.normalizeInspectionDetail,
    updateChecklistItem: detailViewModel.updateChecklistItem,
    buildGeneratePayload: detailViewModel.buildGeneratePayload
  })
  await service.sortPhotos(stored, 'item', [stored.checklistData.item.photos[1], stored.checklistData.item.photos[0]])
  assert.deepEqual(sorted, [{ fileId: 'b', sortNo: 1 }, { fileId: 'a', sortNo: 2 }])
  assert.equal(generated.finishFlag, '0')
  assert.deepEqual(generated.itemResults[0].fileList.map(({ fileId, sortNo }) => ({ fileId, sortNo })), sorted)
})
