import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const automaticSyncModule = await loadUtsModule('services/automaticSyncService.uts')

test('skips every synchronization queue while the device is offline', async () => {
  const calls = []
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }),
    isOnline: async () => false,
    processPendingOperations: async () => calls.push('operations'),
    listPendingPhotoPlanIds: async () => ['plan-1'],
    uploadPendingPhotos: async () => calls.push('photos'),
    refreshDraftPhotos: async () => calls.push('refresh'),
    syncPendingPlans: async () => calls.push('drafts')
  })

  const result = await service.syncWhenOnline()

  assert.equal(result.online, false)
  assert.deepEqual(calls, [])
})

test('uploads all local photos before automatically synchronizing ordinary drafts', async () => {
  const calls = []
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }),
    isOnline: async () => true,
    processPendingOperations: async () => { calls.push('operations'); return { completedCount: 1 } },
    listPendingPhotoPlanIds: async () => { calls.push('list-photos'); return ['plan-1', 'plan-2'] },
    uploadPendingPhotos: async (planId) => { calls.push(`upload:${planId}`); return { uploadedCount: 1, failedCount: 0 } },
    refreshDraftPhotos: async (planId) => calls.push(`refresh:${planId}`),
    syncPendingPlans: async () => { calls.push('drafts'); return { syncedCount: 2, failedCount: 0 } }
  })

  const result = await service.syncWhenOnline()

  assert.deepEqual(calls, ['operations', 'list-photos', 'upload:plan-1', 'refresh:plan-1', 'upload:plan-2', 'refresh:plan-2', 'drafts'])
  assert.equal(result.uploadedPhotoCount, 2)
  assert.equal(result.syncedCount, 2)
})

test('deduplicates simultaneous network recovery and page synchronization requests', async () => {
  let releaseSync
  let syncCount = 0
  const gate = new Promise((resolve) => { releaseSync = resolve })
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }),
    isOnline: async () => true,
    processPendingOperations: async () => {},
    listPendingPhotoPlanIds: async () => [],
    uploadPendingPhotos: async () => {},
    refreshDraftPhotos: async () => {},
    syncPendingPlans: async () => { syncCount += 1; await gate; return { syncedCount: 0, failedCount: 0 } }
  })

  const first = service.syncWhenOnline()
  const second = service.syncWhenOnline()
  assert.equal(first, second)
  releaseSync()
  await Promise.all([first, second])
  assert.equal(syncCount, 1)
})

/** 最终提交只等待已在运行的普通同步，不额外触发新一轮草稿同步。 */
test('waits for an active ordinary sync without starting another one', async () => {
  let releaseSync
  let syncCount = 0
  const gate = new Promise((resolve) => { releaseSync = resolve })
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }), isOnline: async () => true,
    processPendingOperations: async () => {}, listPendingPhotoPlanIds: async () => [],
    uploadPendingPhotos: async () => {}, refreshDraftPhotos: async () => {},
    syncPendingPlans: async () => { syncCount += 1; await gate; return { syncedCount: 1, failedCount: 0 } }
  })
  await service.waitForIdle()
  assert.equal(syncCount, 0)
  const syncing = service.syncWhenOnline()
  let settled = false
  const waiting = service.waitForIdle().then(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false)
  releaseSync()
  await Promise.all([syncing, waiting])
  assert.equal(syncCount, 1)
  assert.equal(service.getState().phase, 'idle')
})

/** 上传请求进行时向页面实时推送状态，上传结束和同步结束后更新并清理订阅。 */
test('notifies subscribers while photos upload and when the queue settles', async () => {
  let finishUpload
  let uploadStarted
  const uploadStartedTask = new Promise((resolve) => { uploadStarted = resolve })
  const uploadTask = new Promise((resolve) => { finishUpload = resolve })
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }),
    isOnline: async () => true,
    processPendingOperations: async () => {},
    listPendingPhotoPlanIds: async () => ['plan-1'],
    uploadPendingPhotos: async () => { uploadStarted(); await uploadTask; return { uploadedCount: 1, failedCount: 0 } },
    refreshDraftPhotos: async () => {},
    syncPendingPlans: async () => ({ syncedCount: 1, failedCount: 0 })
  })
  const updates = []
  const unsubscribe = service.subscribe((state) => updates.push(`${state.phase}:${state.planId}`))
  const syncTask = service.syncWhenOnline()
  await uploadStartedTask
  assert.equal(service.getState().phase, 'uploading')
  assert.ok(updates.includes('uploading:plan-1'))
  finishUpload()
  await syncTask
  assert.ok(updates.includes('uploaded:plan-1'))
  assert.equal(service.getState().phase, 'idle')
  unsubscribe()
  await service.syncWhenOnline()
  assert.equal(updates.at(-1), 'idle:')
})

/** 网络恢复后尚未到期的 retry_wait 图片会在到期时自动再次尝试。 */
test('automatically resumes scheduled photo retries without another page action', async () => {
  let attempts = 0
  let resolveRetry
  const retried = new Promise((resolve) => { resolveRetry = resolve })
  const service = automaticSyncModule.createAutomaticSyncService({
    getSession: () => ({ token: 'token' }),
    isOnline: async () => true,
    processPendingOperations: async () => {},
    listPendingPhotoPlanIds: async () => ['plan-1'],
    listNextPhotoRetryAt: async () => attempts === 1 ? new Date(Date.now() + 25).toISOString() : '',
    uploadPendingPhotos: async () => { attempts += 1; if (attempts === 2) resolveRetry(); return { uploadedCount: 0, failedCount: 0 } },
    refreshDraftPhotos: async () => {},
    syncPendingPlans: async () => ({ syncedCount: 0, failedCount: 0 })
  })

  await service.syncWhenOnline()
  await Promise.race([retried, new Promise((_, reject) => setTimeout(() => reject(new Error('retry was not scheduled')), 500))])
  assert.equal(attempts, 2)
})

test('app lifecycle list resume and network recovery own automatic synchronization', async () => {
  const app = await readFile('App.uvue', 'utf8')
  const bootstrap = await readFile('services/appBootstrapService.uts', 'utf8')
  const runtime = await readFile('runtime/appRuntime.uts', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')

  assert.match(bootstrap, /uni\.onNetworkStatusChange/)
  assert.doesNotMatch(bootstrap, /if \(session != null\) requestAutomaticSync\(\)/)
  assert.match(bootstrap, /result\.isConnected/)
  assert.match(bootstrap, /syncOfflineDataAutomatically/)
  assert.match(app, /requestAutomaticSync/)
  assert.match(app, /onAppShow/)
  assert.match(runtime, /createAutomaticSyncService/)
  assert.match(detail, /if \(markDirty && options\?\.deferSync !== true\) processSyncQueueAfterChange\(\)/)
  assert.match(detail, /function processSyncQueueAfterChange\(\)/)
  assert.equal((detail.match(/syncOfflineDataAutomatically\(\)/g) || []).length, 2)
  assert.match(detail, /await syncOfflineDataAutomatically\(\)/)
  assert.match(list, /refreshListWithAutomaticSync/)
})

/** 详情页订阅全局上传队列，并由 App 原生兼容的定时状态驱动上传箭头闪动。 */
test('detail cloud reflects background uploads without browser-only animation', async () => {
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  const header = await readFile('components/detail/InspectionDetailHeader.uvue', 'utf8')
  const cloud = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')

  assert.match(detail, /subscribeAutomaticSyncStatus\(handleAutomaticSyncStatus\)/)
  assert.match(detail, /unsubscribeAutomaticSyncStatus\(\)/)
  assert.match(detail, /:uploading="automaticUploading \|\| manualUploading"/)
  assert.match(detail, /manualUploading\.value = true[\s\S]*?await inspectionMediaService\.uploadPendingPhotos\(planId\.value\)[\s\S]*?manualUploading\.value = false/)
  assert.match(header, /:is-uploading="uploading"/)
  assert.match(cloud, /sync-upload-arrow/)
  assert.match(cloud, /watch\(\(\): boolean => props\.isUploading/)
  assert.match(cloud, /clearInterval\(timer\)/)
  assert.doesNotMatch(cloud, /@keyframes|<svg|document\.|window\./)
})
