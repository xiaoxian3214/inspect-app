import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const policyModule = await loadUtsModule('domain/photoUploadPolicy.uts')

test('retry delays follow the H5 exponential backoff table with a final cap', () => {
  assert.equal(policyModule.getPhotoUploadRetryDelay(1), 2000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(2), 5000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(3), 15000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(4), 30000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(5), 60000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(6), 120000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(7), 300000)
  assert.equal(policyModule.getPhotoUploadRetryDelay(99), 300000)
})

test('upload failures are classified by HTTP status for retry decisions', () => {
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 408 }), true)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 425 }), true)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 429 }), true)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 500 }), true)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 503 }), true)
  assert.equal(policyModule.isRetryableUploadError(new Error('network broken')), true)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 400 }), false)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 401 }), false)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 403 }), false)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 404 }), false)
  assert.equal(policyModule.isRetryableUploadError({ httpStatus: 413 }), false)
})

test('retryable failures schedule retry_wait with the next retry time', () => {
  const failure = policyModule.classifyUploadFailure(
    { httpStatus: 500, message: 'server boom' },
    2,
    1700000000000
  )

  assert.deepEqual(failure, {
    retryable: true,
    status: 'retry_wait',
    message: 'server boom',
    retryCount: 2,
    delayMs: 15000,
    nextRetryAt: new Date(1700000015000).toISOString()
  })
})

test('non-retryable failures become needs_attention without a retry schedule', () => {
  const failure = policyModule.classifyUploadFailure(
    { httpStatus: 413, message: 'file too large' },
    1,
    1700000000000
  )

  assert.equal(failure.retryable, false)
  assert.equal(failure.status, 'needs_attention')
  assert.equal(failure.message, 'file too large')
  assert.equal(failure.delayMs, 0)
  assert.equal(failure.nextRetryAt, '')
})

test('retry_wait photos only run again after their scheduled retry time', () => {
  assert.equal(policyModule.isPhotoUploadRetryReady({ uploadStatus: 'pending' }, 2000), true)
  assert.equal(policyModule.isPhotoUploadRetryReady({ uploadStatus: 'failed' }, 2000), true)
  assert.equal(
    policyModule.isPhotoUploadRetryReady({ uploadStatus: 'retry_wait', nextRetryAt: new Date(1000).toISOString() }, 2000),
    true
  )
  assert.equal(
    policyModule.isPhotoUploadRetryReady({ uploadStatus: 'retry_wait', nextRetryAt: new Date(9999).toISOString() }, 2000),
    false
  )
})

test('image upload concurrency follows the detected network quality', () => {
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: 'none' }), 0)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: '2g' }), 1)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: '3g' }), 1)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: '4g' }), 2)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: 'wifi' }), 4)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: '5g' }), 4)
  assert.equal(policyModule.resolveUploadConcurrency({ networkType: 'unknown' }), 4)
  assert.equal(policyModule.resolveUploadConcurrency(null), 4)
})

test('upload params require an explicit server business type', () => {
  assert.throws(() => policyModule.buildValidatedUploadParams('plan-1', { localPath: '/a.jpg' }), /业务类型/)
  assert.throws(() => policyModule.buildValidatedUploadParams('plan-1', { bizType: 'REPORT' }), /业务类型/)
  assert.throws(() => policyModule.buildValidatedUploadParams('plan-1', { ownerType: 'report' }), /业务类型/)

  assert.deepEqual(
    policyModule.buildValidatedUploadParams('plan-1', { bizId: 'result-1', bizType: 'checkResult', subGoodsNo: 'SKU-1', sortNo: 2 }),
    { bizId: 'result-1', bizType: 'checkResult', subGoodsNo: 'SKU-1', sortNo: 2 }
  )
  assert.deepEqual(
    policyModule.buildValidatedUploadParams('plan-1', { bizId: 'result-1', bizType: 'checkPoint', subGoodsNo: 'SKU-1', sortNo: 3 }),
    { bizId: 'result-1', bizType: 'checkPoint', subGoodsNo: 'SKU-1', sortNo: 3 }
  )
  assert.deepEqual(
    policyModule.buildValidatedUploadParams('plan-1', { ownerType: 'defect', ownerId: 'defect-9' }),
    { bizId: 'defect-9', bizType: 'defect', subGoodsNo: '', sortNo: undefined }
  )
  assert.deepEqual(
    policyModule.buildValidatedUploadParams('plan-1', { ownerType: 'checklist', ownerId: 'item-2' }),
    { bizId: 'item-2', bizType: 'checkResult', subGoodsNo: '', sortNo: undefined }
  )
})
