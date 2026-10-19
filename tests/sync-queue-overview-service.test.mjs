import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/syncQueueOverviewService.uts')

/** 拍照刚入库时的 pending 记录应明确显示“图片上传”，检查项只是业务归属而不是同步操作。 */
test('custom camera photo queue shows upload operation rather than checklist synchronization', async () => {
  const service = serviceModule.createSyncQueueOverviewService({
    reportRepository: { listPlanSummaries: async () => [{ planId: 'plan-1', plan: { clientOrderNo: 'PO-1' }, syncStatus: 'SYNCED' }] },
    photoRepository: { listPending: async () => [{ photoId: 'camera-1', reportId: 'plan-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/storage/emulated/0/Android/data/app/cache/uni-media/Pic_1.jpg', uploadStatus: 'pending' }] },
    requestQueueRepository: { listUnfinished: async () => [] },
    isPlanPendingSync: () => false
  })
  const overview = await service.getOverview()
  assert.equal(overview.pendingPhotoCount, 1)
  assert.equal(overview.pendingDraftCount, 0)
  assert.deepEqual(overview.queueItems.map((item) => item.operationType), ['upload'])
  assert.match(overview.queueItems[0].content, /PO-1.*检查项 item-1.*图片上传/)
})

test('counts drafts photos and persistent operations from the shared sync queue', async () => {
  const service = serviceModule.createSyncQueueOverviewService({
    reportRepository: {
      listPlans: async () => [
        { id: 'plan-1', plan: { clientOrderNo: 'PO-1' }, syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: 0 } },
        { id: 'plan-2', syncStatus: 'SYNCED', pendingSyncPayload: null }
      ]
    },
    photoRepository: {
      listPending: async () => [
        { photoId: 'photo-1', reportId: 'plan-1', ownerType: 'checklist', ownerId: 'item-1', uploadStatus: 'pending' },
        { photoId: 'photo-2', reportId: 'plan-1', ownerType: 'defect', ownerId: 'defect-1', uploadStatus: 'failed', uploadError: '网络超时' }
      ]
    },
    requestQueueRepository: {
      listUnfinished: async () => [
        { id: 'task-1', taskType: 'FILE_DELETE', payload: { fileId: 'file-old-1' }, status: 'PENDING' },
        { id: 'task-2', taskType: 'FILE_DELETE', payload: { fileId: 'file-old-2' }, status: 'FAILED', lastError: '删除失败' }
      ]
    },
    isPlanPendingSync: (plan) => plan?.syncStatus === 'DIRTY'
  })

  const overview = await service.getOverview()

  assert.deepEqual({
    pendingCount: overview.pendingCount,
    failedCount: overview.failedCount,
    pendingDraftCount: overview.pendingDraftCount,
    pendingPhotoCount: overview.pendingPhotoCount,
    pendingOperationCount: overview.pendingOperationCount
  }, {
    pendingCount: 5,
    failedCount: 2,
    pendingDraftCount: 1,
    pendingPhotoCount: 2,
    pendingOperationCount: 2
  })
  assert.deepEqual(overview.queueItems.map((item) => item.syncType), ['上传', '上传', '删除', '删除', '保存'])
  assert.match(overview.queueItems[0].content, /PO-1.*检查项 item-1.*图片上传/)
  assert.equal(overview.queueItems[0].operationType, 'upload')
  assert.match(overview.queueItems[1].content, /疵点 defect-1.*图片上传/)
  assert.match(overview.queueItems[1].meta, /网络超时/)
  assert.match(overview.queueItems[3].meta, /删除失败/)
  assert.match(overview.queueItems[4].content, /PO-1.*保存验货数据/)
})
