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
