import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const policyModule = await loadUtsModule('domain/finalSubmissionPolicy.uts')

test('treats server file ids and completed upload states as uploaded', () => {
  const result = policyModule.evaluateFinalSubmissionPhotos([
    { photoId: 'server-file', fileId: 'file-1', uploadStatus: 'pending' },
    { photoId: 'done', uploadStatus: 'done' },
    { photoId: 'success', uploadStatus: 'success' },
    { photoId: 'uploaded', uploadStatus: 'uploaded' }
  ])

  assert.equal(result.ready, true)
  assert.equal(result.pendingCount, 0)
})

test('blocks final submission while any photo is not uploaded', () => {
  const result = policyModule.evaluateFinalSubmissionPhotos([
    { photoId: 'pending', uploadStatus: 'pending' },
    { photoId: 'uploading', uploadStatus: 'uploading' },
    { photoId: 'failed', uploadStatus: 'failed' },
    { photoId: 'attention', uploadStatus: 'needs_attention' }
  ])

  assert.equal(result.ready, false)
  assert.equal(result.pendingCount, 4)
  assert.equal(result.failedCount, 2)
  assert.equal(result.message, '仍有 4 张图片未上传完成，请联网后重试')
})

test('ignores empty photo slots left by deleted media', () => {
  const result = policyModule.evaluateFinalSubmissionPhotos([null, undefined, {}, { deleted: true }])

  assert.equal(result.ready, true)
  assert.equal(result.totalCount, 0)
})

/** H5 以本次提交的计划状态确认成功，不等待合并组其他成员逐一变更状态。 */
test('confirms a merged final submission by its current plan rather than every sibling', () => {
  const serverDetail = { plan: { id: 'parent-1', status: 3 }, inspectionPlans: [
    { id: 'parent-1', status: 3 }, { id: 'child-1', status: 1 }
  ] }
  assert.equal(policyModule.isCurrentPlanReported(serverDetail, 'parent-1'), true)
  assert.equal(policyModule.isCurrentPlanReported({ plan: { id: 'parent-1', status: 1 }, inspectionPlans: [
    { id: 'parent-1', status: 1 }, { id: 'child-1', status: 3 }
  ] }, 'parent-1'), false)
})

/** 普通验货使用同一服务端确认逻辑，兼容 H5 接受的文字状态。 */
test('confirms an ordinary final submission by the plan status', () => {
  assert.equal(policyModule.isCurrentPlanReported({ plan: { id: 'single', status: 3 } }, 'single'), true)
  assert.equal(policyModule.isCurrentPlanReported({ plan: { id: 'single', status: 'SUBMITTED' } }, 'single'), true)
  assert.equal(policyModule.isCurrentPlanReported({ plan: { id: 'single', status: 1 } }, 'single'), false)
})

/** 报告生成响应先到、计划状态稍后可见时，只重查状态而不重复最终提交。 */
test('rechecks a briefly stale plan detail after final generation', async () => {
  let reads = 0
  const reported = await policyModule.waitForCurrentPlanReported(async () => {
    reads += 1
    return { inspectionPlans: [{ id: 'plan-1', status: reads === 1 ? 1 : 3 }] }
  }, 'plan-1', 3, 0)
  assert.equal(reported, true)
  assert.equal(reads, 2)
})

/** 状态始终未更新时不得凭生成接口成功就把本地报告标为已报告。 */
test('does not confirm a report whose server plan stays in progress', async () => {
  let reads = 0
  const reported = await policyModule.waitForCurrentPlanReported(async () => {
    reads += 1
    return { inspectionPlans: [{ id: 'plan-1', status: 1 }] }
  }, 'plan-1', 3, 0)
  assert.equal(reported, false)
  assert.equal(reads, 3)
})
