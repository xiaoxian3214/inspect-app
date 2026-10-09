import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/inspectionMediaService.uts')
const policyModule = await loadUtsModule('domain/photoUploadPolicy.uts')

test('creates a pending local photo before any upload starts', async () => {
  const saved = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async (planId, photo) => saved.push({ planId, photo }),
      listPendingByReportId: async () => [],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {},
    isOnline: async () => false,
    createId: () => 'photo-1'
  })

  const photo = await service.addLocalPhoto('plan-1', '/local/photo.jpg', { ownerType: 'checklist', ownerId: 'item-1' })

  assert.equal(photo.photoId, 'photo-1')
  assert.equal(photo.uploadStatus, 'pending')
  assert.equal(saved[0].photo.localPath, '/local/photo.jpg')
})

test('uploads pending local photos and stores remote file ids', async () => {
  const uploaded = []
  const marked = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async () => {},
      listPendingByReportId: async () => [
        { photoId: 'photo-1', localPath: '/one.jpg', ownerId: 'local-item-1', bizId: 'item-result-1', bizType: 'checkResult', subGoodsNo: 'SKU-1', sortNo: 1 },
        { photoId: 'photo-2', localPath: '/two.jpg', ownerId: 'local-item-2', bizId: 'defect-2', bizType: 'defect', subGoodsNo: 'SKU-1', sortNo: 2 }
      ],
      markUploaded: async (planId, photoId, remote) => marked.push({ planId, photoId, remote }),
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async (localPath, params) => {
        uploaded.push({ localPath, params })
        return { fileId: `file-${uploaded.length}` }
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const result = await service.uploadPendingPhotos('plan-1')

  assert.deepEqual(uploaded.map((item) => item.localPath), ['/one.jpg', '/two.jpg'])
  assert.deepEqual(uploaded[0].params, { bizId: 'item-result-1', bizType: 'checkResult', subGoodsNo: 'SKU-1', sortNo: 1, fileType: 'image', uploadTimeoutMs: 120000 })
  assert.deepEqual(uploaded[1].params, { bizId: 'defect-2', bizType: 'defect', subGoodsNo: 'SKU-1', sortNo: 2, fileType: 'image', uploadTimeoutMs: 120000 })
  assert.equal(marked.length, 2)
  assert.equal(result.uploadedCount, 2)
})

test('deduplicates concurrent upload requests for the same plan', async () => {
  let uploadCount = 0
  let releaseUpload
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve })
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async () => {},
      listPendingByReportId: async () => [{ photoId: 'photo-1', localPath: '/one.jpg', bizId: 'item-result-1', bizType: 'checkResult' }],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async () => {
        uploadCount += 1
        await uploadGate
        return { fileId: 'file-1' }
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const first = service.uploadPendingPhotos('plan-1')
  const second = service.uploadPendingPhotos('plan-1')
  releaseUpload()
  await Promise.all([first, second])

  assert.equal(uploadCount, 1)
})

test('maps ownerType to server bizType when photos only carry local metadata', async () => {
  const uploaded = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async () => {},
      listPendingByReportId: async () => [{ photoId: 'photo-1', localPath: '/one.jpg', ownerType: 'checklist', ownerId: 'item-2' }],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async (localPath, params) => {
        uploaded.push({ localPath, params })
        return { fileId: 'file-1' }
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  await service.uploadPendingPhotos('plan-1')

  assert.deepEqual(uploaded[0].params, { bizId: 'item-2', bizType: 'checkResult', subGoodsNo: '', sortNo: undefined, fileType: 'image', uploadTimeoutMs: 120000 })
})

test('retryable failures are scheduled as retry_wait with backoff timing', async () => {
  const savedStatuses = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async (planId, photo) => savedStatuses.push(photo),
      listPendingByReportId: async () => [{ photoId: 'photo-1', localPath: '/one.jpg', bizId: 'r-1', bizType: 'checkResult', retryCount: 2 }],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async () => {
        const error = new Error('server boom')
        error.httpStatus = 500
        throw error
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const result = await service.uploadPendingPhotos('plan-1')
  const failedPhoto = savedStatuses[savedStatuses.length - 1]

  assert.equal(result.failedCount, 1)
  assert.equal(failedPhoto.uploadStatus, 'retry_wait')
  assert.equal(failedPhoto.uploadError, 'server boom')
  assert.equal(failedPhoto.retryCount, 3)
  assert.notEqual(String(failedPhoto.nextRetryAt || ''), '')
  assert.ok(Date.parse(failedPhoto.nextRetryAt) > Date.now())
})

test('non-retryable failures become needs_attention without a retry schedule', async () => {
  const savedStatuses = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async (planId, photo) => savedStatuses.push(photo),
      listPendingByReportId: async () => [{ photoId: 'photo-1', localPath: '/one.jpg', bizId: 'r-1', bizType: 'defect' }],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async () => {
        const error = new Error('file too large')
        error.httpStatus = 413
        throw error
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const result = await service.uploadPendingPhotos('plan-1')
  const failedPhoto = savedStatuses[savedStatuses.length - 1]

  assert.equal(result.failedCount, 1)
  assert.equal(failedPhoto.uploadStatus, 'needs_attention')
  assert.equal(failedPhoto.uploadError, 'file too large')
  assert.equal(failedPhoto.nextRetryAt, '')
})

test('photos without a valid server bizType are marked needs_attention without uploading', async () => {
  const savedStatuses = []
  let uploadCount = 0
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async (planId, photo) => savedStatuses.push(photo),
      listPendingByReportId: async () => [
        { photoId: 'photo-legacy', localPath: '/legacy.jpg' },
        { photoId: 'photo-bad', localPath: '/bad.jpg', bizType: 'REPORT' }
      ],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async () => {
        uploadCount += 1
        return { fileId: 'file-1' }
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const result = await service.uploadPendingPhotos('plan-1')

  assert.equal(uploadCount, 0)
  assert.equal(result.uploadedCount, 0)
  assert.equal(result.failedCount, 2)
  assert.ok(savedStatuses.every((photo) => photo.uploadStatus === 'needs_attention'))
  assert.ok(savedStatuses.every((photo) => /业务类型/.test(String(photo.uploadError || ''))))
})

test('retry_wait photos that are not due yet are skipped until their retry time', async () => {
  const uploaded = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async () => {},
      listPendingByReportId: async () => [
        { photoId: 'photo-waiting', localPath: '/waiting.jpg', bizId: 'r-1', bizType: 'checkResult', uploadStatus: 'retry_wait', nextRetryAt: new Date(Date.now() + 60000).toISOString() },
        { photoId: 'photo-due', localPath: '/due.jpg', bizId: 'r-2', bizType: 'checkResult', uploadStatus: 'retry_wait', nextRetryAt: new Date(Date.now() - 1000).toISOString() },
        { photoId: 'photo-pending', localPath: '/pending.jpg', bizId: 'r-3', bizType: 'checkResult', uploadStatus: 'pending' }
      ],
      markUploaded: async () => {},
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async (localPath) => {
        uploaded.push(localPath)
        return { fileId: `file-${uploaded.length}` }
      }
    },
    isOnline: async () => true,
    createId: () => 'unused'
  })

  const result = await service.uploadPendingPhotos('plan-1')

  assert.deepEqual(uploaded.sort(), ['/due.jpg', '/pending.jpg'])
  assert.equal(result.pendingCount, 2)
  assert.equal(result.uploadedCount, 2)
})

test('upload concurrency follows the reported network quality', async () => {
  async function runWithNetwork(networkType) {
    let inFlight = 0
    let peak = 0
    const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
      photoRepository: {
        save: async () => {},
        listPendingByReportId: async () => [1, 2, 3, 4].map((index) => ({
          photoId: `photo-${index}`,
          localPath: `/${index}.jpg`,
          bizId: `r-${index}`,
          bizType: 'checkResult'
        })),
        markUploaded: async () => {},
        listByReportId: async () => []
      },
      reportFileApi: {
        uploadInspectFile: async () => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 10))
          inFlight -= 1
          return { fileId: 'file-1' }
        }
      },
      isOnline: async () => true,
      getNetworkType: async () => networkType,
      createId: () => 'unused'
    })
    const result = await service.uploadPendingPhotos('plan-1')
    return { peak, result }
  }

  const wifiRun = await runWithNetwork('wifi')
  assert.equal(wifiRun.peak, 4)
  assert.equal(wifiRun.result.uploadedCount, 4)

  const slowRun = await runWithNetwork('2g')
  assert.equal(slowRun.peak, 1)
  assert.equal(slowRun.result.uploadedCount, 4)
})
