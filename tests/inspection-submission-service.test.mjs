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

/** 防止普通草稿的接口响应晚于最终提交而覆盖服务端已报告状态。 */
test('waits for an in-flight ordinary draft sync before final generation', async () => {
  let releaseDraft
  const draftSync = new Promise((resolve) => { releaseDraft = resolve })
  const calls = []
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => true,
    waitForPendingSync: async () => { calls.push('wait'); await draftSync },
    listPhotos: async () => [], uploadPendingPhotos: async () => {}, evaluatePhotos,
    planApi: { generateReport: async (payload) => { calls.push(`generate:${payload.finishFlag}`) } }
  })
  const submitting = service.submitFinalReport({ planId: 'plan-1', payload: { planId: 'plan-1' } })
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(calls, ['wait'])
  releaseDraft()
  await submitting
  assert.deepEqual(calls, ['wait', 'generate:1'])
})

/** 合并报告以父计划提交，但检查图片必须使用本地成员入口读取共享照片。 */
test('merged final submission checks group photos through a member while submitting the parent once', async () => {
  const lookedUp = []
  const generated = []
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => true,
    listPhotos: async (planId) => { lookedUp.push(planId); return [{ photoId: 'p1', uploadStatus: 'pending' }] },
    uploadPendingPhotos: async () => {},
    evaluatePhotos,
    planApi: { generateReport: async (payload) => { generated.push(payload) } }
  })
  await assert.rejects(service.submitFinalReport({
    planId: 'parent-1', photoPlanId: 'child-1', payload: { planId: 'parent-1' }
  }), /仍有 1 张图片未上传/)
  assert.deepEqual(lookedUp, ['child-1', 'child-1'])
  assert.equal(generated.length, 0)
})

/**
 * 疵点编辑中断遗留的孤儿 draft 照片不会被上传（上传器跳过 draft），
 * 提交服务必须把报告疵点列表透传给图片状态判定，让孤儿 draft 不再永远阻断最终提交。
 */
test('passes the report defects into photo evaluation so orphan drafts do not block submission', async () => {
  const received = []
  const service = serviceModule.createInspectionSubmissionService({
    isOnline: async () => true,
    listPhotos: async () => [
      { photoId: 'orphan-gone', uploadStatus: 'draft', ownerType: 'defect', ownerId: 'defect-gone' },
      { photoId: 'orphan-none', uploadStatus: 'draft', ownerType: 'checklist', ownerId: 'item-1' }
    ],
    uploadPendingPhotos: async () => {},
    evaluatePhotos: (photos, defects) => {
      received.push({ photos, defects })
      const liveDefects = new Set((defects ?? []).map((defect) => String(defect?.defectId ?? defect?.id ?? '')))
      const pending = photos.filter((photo) => {
        if (photo.fileId || photo.uploadStatus === 'done') return false
        if (photo.uploadStatus !== 'draft') return true
        return liveDefects.has(String(photo.ownerId ?? ''))
      })
      return { ready: pending.length === 0, pendingCount: pending.length, message: pending.length > 0 ? `仍有 ${pending.length} 张图片未上传完成，请联网后重试` : '' }
    },
    planApi: { generateReport: async () => ({ reportId: 'report-1' }) }
  })

  const result = await service.submitFinalReport({
    planId: 'plan-1',
    payload: { planId: 'plan-1' },
    defects: [{ defectId: 'defect-live' }]
  })

  assert.equal(result.reportId, 'report-1')
  assert.equal(received.length, 1)
  assert.deepEqual(received[0].defects, [{ defectId: 'defect-live' }])
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
