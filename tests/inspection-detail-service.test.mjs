import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/inspectionDetailService.uts')
const detailViewModel = await loadUtsModule('domain/detailViewModel.uts')

function createViewModel() {
  return {
    isInspectionDetailComplete: detailViewModel.isInspectionDetailComplete,
    normalizeInspectionDetail: (source, planId) => ({ ...source, planId, normalized: true, checklistItems: source.checklistItems || [], defects: source.defects || [], photos: source.photos || [], progress: source.progress || 0 }),
    buildGeneratePayload: (detail) => ({ planId: detail.planId, finishFlag: '0' })
  }
}

test('loads local detail without requesting the server', async () => {
  let remoteCalls = 0
  const local = { plan: { id: 'plan-1', subGoodsNo: 'SKU-1' }, standardItems: [{ children: [{ id: 'item-1' }] }], checklistItems: [{ id: 'item-1' }] }
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => local,
      saveDetailSnapshot: async () => {}
    },
    planApi: { getPlanDetail: async () => { remoteCalls += 1 } },
    isOnline: async () => true,
    viewModel: createViewModel()
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(result.normalized, true)
  assert.equal(remoteCalls, 0)
})

test('merges independently persisted local photos when loading detail', async () => {
  const local = {
    plan: { id: 'plan-1', goodsName: '产品一', subGoodsNo: 'SKU-1' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistData: { 'item-1': { result: 'pass', photos: [] } },
    defects: [],
    photos: []
  }
  const storedPhotos = [
    { photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg', uploadStatus: 'pending' }
  ]
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => local,
      saveDetailSnapshot: async () => {}
    },
    planApi: { getPlanDetail: async () => ({}) },
    isOnline: async () => false,
    listPhotos: async () => storedPhotos,
    viewModel: detailViewModel
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(result.photos.length, 1)
  assert.equal(result.photos[0].photoId, 'photo-1')
  assert.equal(result.checklistData['item-1'].photos[0].localPath, '/local/one.jpg')
})

test('rebuilds an offline checklist from locally cached itemResults', async () => {
  let remoteCalls = 0
  const local = {
    plan: { id: 'plan-1', goodsName: '离线产品', subGoodsNo: 'SKU-1' },
    itemResults: [
      { id: 'section-1', standardItemId: 'section-standard', localizedItemName: '包装检查', parentItemId: null },
      { id: 'item-1', standardItemId: 'item-standard', localizedItemName: '外箱检查', parentItemId: 'section-1', itemType: 'Standard' }
    ]
  }
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => local,
      saveDetailSnapshot: async () => {}
    },
    planApi: { getPlanDetail: async () => { remoteCalls += 1; return {} } },
    isOnline: async () => false,
    viewModel: detailViewModel
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(remoteCalls, 0)
  assert.equal(result.standardItems.length, 1)
  assert.equal(result.checklistItems.length, 1)
  assert.equal(result.checklistItems[0].itemName, '外箱检查')
})

test('refreshes local checklist data when the plan display fields are missing', async () => {
  let remoteCalls = 0
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => ({ plan: { id: 'plan-1' }, standardItems: [{ children: [{ id: 'item-1' }] }] }),
      saveDetailSnapshot: async () => {}
    },
    planApi: {
      getPlanDetail: async () => {
        remoteCalls += 1
        return { plan: { id: 'plan-1', subGoodsNo: 'SKU-1', goodsName: '产品一' }, standardItems: [{ children: [{ id: 'item-1' }] }] }
      }
    },
    isOnline: async () => true,
    viewModel: createViewModel()
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(remoteCalls, 1)
  assert.equal(result.plan.goodsName, '产品一')
})

test('refreshes an incomplete local summary from the plan detail API', async () => {
  let remoteCalls = 0
  const saved = []
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => ({ plan: { id: 'plan-1' }, downloadedAt: '2026-09-17T08:00:00.000Z' }),
      saveDetailSnapshot: async (planId, detail) => saved.push({ planId, detail })
    },
    planApi: {
      getPlanDetail: async () => {
        remoteCalls += 1
        return { plan: { id: 'plan-1', goodsName: '完整产品' }, standardItems: [{ children: [{ id: 'item-1' }] }] }
      }
    },
    isOnline: async () => true,
    viewModel: createViewModel()
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(remoteCalls, 1)
  assert.equal(result.plan.goodsName, '完整产品')
  assert.equal(saved.length, 1)
})

test('reports that an incomplete local summary needs network instead of opening an empty detail', async () => {
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => ({ plan: { id: 'plan-1' }, downloadedAt: '2026-09-17T08:00:00.000Z' }),
      saveDetailSnapshot: async () => {}
    },
    planApi: { getPlanDetail: async () => ({}) },
    isOnline: async () => false,
    viewModel: createViewModel()
  })

  await assert.rejects(service.loadDetail('plan-1'), /本地详情数据不完整/)
})

test('refreshes missing checklist definitions while preserving a dirty local draft', async () => {
  let remoteCalls = 0
  const localDraft = {
    plan: { id: 'plan-1' },
    syncStatus: 'DIRTY',
    pendingSyncPayload: { planId: 'plan-1', finishFlag: '0' },
    itemResults: [{ id: 'item-1', resultStatus: 'REJECTED' }],
    checklistData: { 'item-1': { result: 'fail', comment: '本地备注' } }
  }
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => localDraft,
      saveDetailSnapshot: async () => {}
    },
    planApi: {
      getPlanDetail: async () => {
        remoteCalls += 1
        return {
          plan: { id: 'plan-1', goodsName: '远程产品' },
          standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }]
        }
      }
    },
    isOnline: async () => true,
    viewModel: createViewModel()
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(remoteCalls, 1)
  assert.equal(result.plan.goodsName, '远程产品')
  assert.equal(result.checklistData['item-1'].comment, '本地备注')
  assert.equal(result.standardItems.length, 1)
})

test('downloads and persists detail when no local snapshot exists', async () => {
  const saved = []
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => null,
      saveDetailSnapshot: async (planId, detail) => saved.push({ planId, detail })
    },
    planApi: { getPlanDetail: async () => ({ plan: { id: 'plan-1' }, checklistItems: [] }) },
    isOnline: async () => true,
    viewModel: createViewModel()
  })

  const result = await service.loadDetail('plan-1')

  assert.equal(result.plan.id, 'plan-1')
  assert.equal(saved.length, 1)
})

/** 仅拍摄照片不得生成普通报告草稿；独立照片表负责断网待上传及恢复。 */
test('photo-only draft keeps report sync state clean while retaining local photos', async () => {
  const saved = []
  const service = serviceModule.createInspectionDetailService({
    reportRepository: { saveDraftChanges: async (id, detail, changes) => saved.push({ id, detail, changes }) },
    planApi: {}, isOnline: async () => false, viewModel: createViewModel()
  })
  const result = await service.saveDraft('plan-1', {
    planId: 'plan-1', status: 1, plan: { id: 'plan-1', status: 1 }, syncStatus: 'SYNCED', pendingSyncPayload: null,
    checklistData: { 'item-1': { photos: [{ photoId: 'camera-1', localPath: '/storage/photo.jpg', uploadStatus: 'pending' }] } }
  }, { markDirty: false, changes: { itemIds: ['item-1'] } })
  assert.equal(result.syncStatus, 'SYNCED')
  assert.equal(result.pendingSyncPayload, null)
  assert.equal(saved[0].detail.checklistData['item-1'].photos[0].photoId, 'camera-1')
  assert.deepEqual(saved[0].changes.itemIds, ['item-1'])
})

/** 照片上传回填不得将原本干净的报告标脏，否则自动同步会调用 reports/generate。 */
test('photo upload refresh preserves a clean report without creating a generate payload', async () => {
  let saved = null
  const service = serviceModule.createInspectionDetailService({
    reportRepository: { saveDetailSnapshot: async (_id, detail) => { saved = detail } },
    planApi: {}, isOnline: async () => true, viewModel: createViewModel()
  })
  const result = await service.saveDraft('plan-1', {
    planId: 'plan-1', plan: { id: 'plan-1', status: 1 }, syncStatus: 'SYNCED', pendingSyncPayload: null,
    checklistItems: [], defects: [], photos: [{ photoId: 'camera-1', fileId: 'remote-1' }]
  }, { markDirty: false })
  assert.equal(saved.syncStatus, 'SYNCED')
  assert.equal(result.pendingSyncPayload, null)
  assert.equal(result.photos[0].fileId, 'remote-1')
})

/** 已有业务草稿同步时，照片落盘不能撤销原本等待同步的检查结果和备注。 */
test('photo-only changes preserve an existing dirty draft for later ordinary sync', async () => {
  let saved = null
  const service = serviceModule.createInspectionDetailService({
    reportRepository: { saveDraftChanges: async (_id, detail) => { saved = detail } },
    planApi: {}, isOnline: async () => false, viewModel: createViewModel()
  })
  const pendingSyncPayload = { planId: 'plan-1', finishFlag: 0, comment: '既有备注' }
  await service.saveDraft('plan-1', {
    planId: 'plan-1', status: 1, plan: { id: 'plan-1', status: 1 }, syncStatus: 'DIRTY', pendingSyncPayload,
    checklistData: { 'item-1': { photos: [{ photoId: 'camera-1' }] } }
  }, { markDirty: false, changes: { itemIds: ['item-1'] } })
  assert.equal(saved.syncStatus, 'DIRTY')
  assert.deepEqual(saved.pendingSyncPayload, pendingSyncPayload)
})

test('saves dirty drafts with pending sync payload and in-progress status', async () => {
  const saved = []
  const service = serviceModule.createInspectionDetailService({
    reportRepository: {
      getPlanById: async () => null,
      saveDetailSnapshot: async (planId, detail) => saved.push({ planId, detail })
    },
    planApi: {},
    isOnline: async () => false,
    viewModel: createViewModel()
  })

  const result = await service.saveDraft('plan-1', { plan: { id: 'plan-1', status: 0 }, checklistItems: [], defects: [], photos: [] })

  assert.equal(result.status, 1)
  assert.equal(result.plan.status, 1)
  assert.equal(result.syncStatus, 'DIRTY')
  assert.deepEqual(result.pendingSyncPayload, { planId: 'plan-1', finishFlag: '0' })
  assert.equal(saved.length, 1)
})
