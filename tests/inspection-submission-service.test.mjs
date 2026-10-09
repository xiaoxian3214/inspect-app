import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/inspectionSubmissionService.uts')

function evaluatePhotos(photos) {
  const pending = photos.filter((photo) => !photo.fileId && photo.uploadStatus !== 'done')
  return {
    ready: pending.length === 0,
    pendingCount: pending.length,
    message: pending.length > 0 ? `仍有 ${pending.length} 张图片未上传完成，请联网后重试` : ''
  }
}

test('rejects final submission offline without uploading or generating a report', async () => {
  let uploadCount = 0
  let generateCount = 0
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => false,
    listPhotos: async () => [{ photoId: 'photo-1', uploadStatus: 'pending' }],
    uploadPendingPhotos: async () => { uploadCount += 1 },
    evaluatePhotos,
    planApi: {
      generateReport: async () => { generateCount += 1 }
    }
  })

  await assert.rejects(
    service.submitFinalReport({ planId: 'plan-1', payload: { planId: 'plan-1' } }),
    /最终提交需要联网/
  )
  assert.equal(uploadCount, 0)
  assert.equal(generateCount, 0)
})

test('uploads pending photos before final submission and forces finishFlag to one', async () => {
  const generated = []
  let uploaded = false
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => true,
    listPhotos: async () => uploaded
      ? [{ photoId: 'photo-1', fileId: 'file-1', uploadStatus: 'done' }]
      : [{ photoId: 'photo-1', uploadStatus: 'pending' }],
    uploadPendingPhotos: async () => { uploaded = true },
    evaluatePhotos,
    planApi: {
      generateReport: async (payload) => {
        generated.push(payload)
        return { reportId: 'report-1' }
      }
    }
  })

  const result = await service.submitFinalReport({
    planId: 'plan-1',
    payload: { planId: 'plan-1', finishFlag: 0 }
  })

  assert.equal(result.reportId, 'report-1')
  assert.deepEqual(generated, [{ planId: 'plan-1', finishFlag: 1 }])
})

test('blocks final submission when photos remain unfinished after upload retry', async () => {
  let generateCount = 0
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => true,
    listPhotos: async () => [{ photoId: 'photo-1', uploadStatus: 'failed' }],
    uploadPendingPhotos: async () => {},
    evaluatePhotos,
    planApi: {
      generateReport: async () => { generateCount += 1 }
    }
  })

  await assert.rejects(
    service.submitFinalReport({ planId: 'plan-1', payload: { planId: 'plan-1' } }),
    /仍有 1 张图片未上传完成/
  )
  assert.equal(generateCount, 0)
})

test('rechecks network immediately before calling the final report API', async () => {
  let networkChecks = 0
  let generateCount = 0
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => {
      networkChecks += 1
      return networkChecks === 1
    },
    listPhotos: async () => [],
    uploadPendingPhotos: async () => {},
    evaluatePhotos,
    planApi: {
      generateReport: async () => { generateCount += 1 }
    }
  })

  await assert.rejects(
    service.submitFinalReport({ planId: 'plan-1', payload: { planId: 'plan-1' } }),
    /网络已断开/
  )
  assert.equal(generateCount, 0)
})
