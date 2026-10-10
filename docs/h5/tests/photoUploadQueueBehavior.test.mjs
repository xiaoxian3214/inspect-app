import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const photoUploadModule = await import('../utils/photoUpload.js')

test('local preview retries a temporarily unavailable blob before server upload finishes', async () => {
  const photo = {
    _id: 'pending-preview',
    blobKey: 'pending-preview-blob',
    uploadStatus: 'pending',
    mediaType: 'image'
  }
  const blob = new Blob(['image'], { type: 'image/jpeg' })
  const lookups = [
    { status: 'unavailable', blob: null, error: new Error('IndexedDB reopening') },
    { status: 'found', blob }
  ]
  const delays = []
  const originalCreateObjectURL = URL.createObjectURL
  URL.createObjectURL = value => value === blob ? 'blob:restored-preview' : 'blob:unexpected'

  try {
    const url = await photoUploadModule.getPhotoDisplayUrlAsync(photo, 'thumbnail', {
      readBlob: async () => lookups.shift(),
      wait: async delay => delays.push(delay),
      maxAttempts: 2,
      retryDelayMs: 100
    })

    assert.equal(url, 'blob:restored-preview')
    assert.equal(photo.previewUrl, 'blob:restored-preview')
    assert.deepEqual(delays, [100])
    assert.equal(lookups.length, 0)
  } finally {
    URL.createObjectURL = originalCreateObjectURL
  }
})

test('photo upload retry delay backs off and then caps at five minutes', () => {
  assert.equal(typeof photoUploadModule.getPhotoUploadRetryDelay, 'function')
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 20].map(photoUploadModule.getPhotoUploadRetryDelay),
    [2_000, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 300_000]
  )
})

test('retry-wait photos become uploadable only when their retry time arrives', () => {
  assert.equal(typeof photoUploadModule.isPhotoUploadRetryReady, 'function')
  const photo = {
    uploadStatus: 'retry_wait',
    nextRetryAt: '2026-07-16T10:00:10.000Z'
  }

  assert.equal(
    photoUploadModule.isPhotoUploadRetryReady(photo, Date.parse('2026-07-16T10:00:09.999Z')),
    false
  )
  assert.equal(
    photoUploadModule.isPhotoUploadRetryReady(photo, Date.parse('2026-07-16T10:00:10.000Z')),
    true
  )
  assert.equal(photoUploadModule.isPhotoUploadRetryReady({ uploadStatus: 'pending' }, 0), true)
})

test('next retry lookup returns the earliest persisted retry time', () => {
  assert.equal(typeof photoUploadModule.getNextPhotoUploadRetryAt, 'function')
  const checklistData = {
    first: {
      photos: [
        { uploadStatus: 'retry_wait', nextRetryAt: '2026-07-16T10:02:00.000Z' },
        { uploadStatus: 'pending' }
      ]
    }
  }
  const defects = [{
    photos: [{ uploadStatus: 'retry_wait', nextRetryAt: '2026-07-16T10:01:00.000Z' }]
  }]

  assert.equal(
    photoUploadModule.getNextPhotoUploadRetryAt(checklistData, defects),
    Date.parse('2026-07-16T10:01:00.000Z')
  )
})

test('transient upload failure cools down while later photos continue uploading', async () => {
  const first = {
    _id: 'first',
    blobKey: 'first-blob',
    bizId: 'item-1',
    mediaType: 'image',
    uploadStatus: 'pending',
    createdAt: '2026-07-16T10:00:00.000Z'
  }
  const second = {
    _id: 'second',
    blobKey: 'second-blob',
    bizId: 'item-1',
    mediaType: 'image',
    uploadStatus: 'pending',
    createdAt: '2026-07-16T10:00:01.000Z'
  }
  const uploaded = []
  const nowMs = Date.parse('2026-07-16T10:01:00.000Z')

  const result = await photoUploadModule.processPendingUploads(
    { item: { photos: [first, second] } },
    [],
    async () => {},
    {
      concurrency: 1,
      now: () => nowMs,
      uploadPhoto: async (photo) => {
        uploaded.push(photo._id)
        if (photo === first) {
          return { success: false, retryable: true, error: 'network stalled' }
        }
        return {
          success: true,
          fileId: 'server-second',
          filePath: '/server/second.jpg'
        }
      }
    }
  )

  assert.deepEqual(uploaded, ['first', 'second'])
  assert.equal(first.uploadStatus, 'retry_wait')
  assert.equal(first.nextRetryAt, new Date(nowMs + 2_000).toISOString())
  assert.equal(second.uploadStatus, 'done')
  assert.equal(result.failed, 0)
  assert.equal(result.retryWaiting, 1)
})

test('upload error classification retries network and server failures but not rejected files', () => {
  assert.equal(typeof photoUploadModule.isRetryablePhotoUploadError, 'function')
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 500 }), true)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 429 }), true)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError(new Error('上传长时间无进度，请检查网络后重试')), true)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 400 }), false)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 413 }), false)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 415 }), false)
  assert.equal(photoUploadModule.isRetryablePhotoUploadError({ httpStatus: 422 }), false)
})

function createBlobLookupIndexedDb(behaviors) {
  let openCount = 0
  let readCount = 0
  const database = {
    close() {},
    transaction() {
      return {
        objectStore() {
          return {
            get() {
              const request = {}
              const behavior = behaviors[readCount++] || { type: 'missing' }
              queueMicrotask(() => {
                if (behavior.type === 'error') {
                  request.error = new Error(behavior.message || 'temporary IndexedDB failure')
                  request.onerror?.()
                  return
                }
                request.result = behavior.type === 'found' ? behavior.blob : undefined
                request.onsuccess?.()
              })
              return request
            }
          }
        }
      }
    }
  }
  return {
    get openCount() { return openCount },
    open() {
      openCount++
      const request = {}
      queueMicrotask(() => {
        request.result = database
        request.onsuccess?.({ target: { result: database } })
      })
      return request
    }
  }
}

test('blob lookup reports IndexedDB read errors as unavailable instead of missing', async () => {
  const originalIndexedDb = globalThis.indexedDB
  const fakeIndexedDb = createBlobLookupIndexedDb([
    { type: 'error' },
    { type: 'error' }
  ])
  globalThis.indexedDB = fakeIndexedDb
  try {
    const blobStore = await import(`../utils/photoBlobStore.js?unavailable=${Date.now()}`)
    assert.equal(typeof blobStore.readBlobWithStatus, 'function')
    const result = await blobStore.readBlobWithStatus('blob-key')
    assert.equal(result.status, 'unavailable')
    assert.equal(fakeIndexedDb.openCount, 2)
  } finally {
    globalThis.indexedDB = originalIndexedDb
  }
})

test('blob lookup confirms a missing record only after reopening IndexedDB', async () => {
  const originalIndexedDb = globalThis.indexedDB
  const fakeIndexedDb = createBlobLookupIndexedDb([
    { type: 'missing' },
    { type: 'missing' }
  ])
  globalThis.indexedDB = fakeIndexedDb
  try {
    const blobStore = await import(`../utils/photoBlobStore.js?missing=${Date.now()}`)
    const result = await blobStore.readBlobWithStatus('blob-key')
    assert.equal(result.status, 'missing')
    assert.equal(fakeIndexedDb.openCount, 2)
  } finally {
    globalThis.indexedDB = originalIndexedDb
  }
})

test('permanent upload rejection needs attention while retryable storage errors cool down', async () => {
  const transient = {
    _id: 'transient', blobKey: 'transient-blob', bizId: 'item-1', mediaType: 'image',
    uploadStatus: 'pending', createdAt: '2026-07-16T10:00:00.000Z'
  }
  const permanent = {
    _id: 'permanent', blobKey: 'permanent-blob', bizId: 'item-1', mediaType: 'image',
    uploadStatus: 'pending', createdAt: '2026-07-16T10:00:01.000Z'
  }

  const result = await photoUploadModule.processPendingUploads(
    { item: { photos: [transient, permanent] } },
    [],
    async () => {},
    {
      concurrency: 1,
      now: () => Date.parse('2026-07-16T10:01:00.000Z'),
      uploadPhoto: async (photo) => photo === transient
        ? { success: false, retryable: true, error: 'IndexedDB temporarily unavailable' }
        : { success: false, retryable: false, error: 'unsupported file' }
    }
  )

  assert.equal(transient.uploadStatus, 'retry_wait')
  assert.equal(permanent.uploadStatus, 'needs_attention')
  assert.equal(result.retryWaiting, 1)
  assert.equal(result.needsAttention, 1)
})

test('photo source inspection distinguishes unavailable IndexedDB from a missing blob', async () => {
  assert.equal(typeof photoUploadModule.getPhotoUploadSourceStatus, 'function')
  const photo = { _id: 'photo-1', blobKey: 'blob-key', mimeType: 'image/jpeg' }

  const unavailable = await photoUploadModule.getPhotoUploadSourceStatus(photo, {
    readBlob: async () => ({ status: 'unavailable', blob: null, error: new Error('blocked') })
  })
  const missing = await photoUploadModule.getPhotoUploadSourceStatus(photo, {
    readBlob: async () => ({ status: 'missing', blob: null })
  })
  const ready = await photoUploadModule.getPhotoUploadSourceStatus(photo, {
    readBlob: async () => ({
      status: 'found',
      blob: new Blob(['image'], { type: 'image/jpeg' })
    })
  })

  assert.equal(unavailable.status, 'unavailable')
  assert.equal(missing.status, 'missing')
  assert.equal(ready.status, 'ready')
  assert.ok(ready.file instanceof Blob)
})

test('manual retry does not label temporarily unavailable IndexedDB data as lost', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
  assert.match(detail, /getPhotoUploadSourceStatus/)
  assert.match(detail, /sourceStatus\.status\s*===\s*'unavailable'/)
  assert.match(detail, /sourceStatus\.status\s*===\s*'missing'[\s\S]{0,500}本地文件已失效/)
})

test('image and video queues drain independently so a slow video does not hold later images', async () => {
  const photos = [
    ...Array.from({ length: 6 }, (_, index) => ({
      _id: `image-${index}`,
      bizId: 'item-1',
      mediaType: 'image',
      uploadStatus: 'pending',
      createdAt: `2026-07-16T10:00:0${index}.000Z`
    })),
    {
      _id: 'video-1',
      bizId: 'item-1',
      mediaType: 'video',
      uploadStatus: 'pending',
      createdAt: '2026-07-16T10:00:06.000Z'
    }
  ]
  const completed = []
  let videoFinished = false

  const imageWork = photoUploadModule.processPendingUploads(
      { item: { photos } }, [], async () => {},
      {
        mediaKind: 'image',
        concurrency: 2,
        uploadPhoto: async (photo) => {
          assert.equal(photo.mediaType, 'image')
          await new Promise(resolve => setTimeout(resolve, 2))
          completed.push(photo._id)
          return { success: true, fileId: `server-${photo._id}`, filePath: `/${photo._id}` }
        }
      }
    )
  const videoWork = photoUploadModule.processPendingUploads(
      { item: { photos } }, [], async () => {},
      {
        mediaKind: 'video',
        videoConcurrency: 1,
        uploadPhoto: async (photo) => {
          assert.equal(photo.mediaType, 'video')
          await new Promise(resolve => setTimeout(resolve, 60))
          videoFinished = true
          return { success: true, fileId: 'server-video', filePath: '/video' }
        }
      }
    )

  await imageWork
  assert.equal(videoFinished, false)
  assert.deepEqual(completed, [
    'image-0', 'image-1', 'image-2', 'image-3', 'image-4', 'image-5'
  ])
  await videoWork
})

test('report starts independent image and video queue processors', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
  assert.match(detail, /Promise\.all\s*\(\s*\[/)
  assert.match(detail, /triggerPhotoUploadQueue\('image'\)/)
  assert.match(detail, /triggerPhotoUploadQueue\('video'\)/)
})

test('media grid presents retry waits as automatic and reserves manual retry for permanent errors', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')
  assert.match(mediaGrid, /media\.uploadStatus\s*===\s*'needs_attention'/)
  assert.match(mediaGrid, /media\.uploadStatus\s*===\s*'retry_wait'/)
  assert.match(mediaGrid, /网络较差，等待自动上传/)
})

test('uploaded media removal waits for the server delete API before local removal', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
  const deleteHelperBody = detail.match(/async function deleteRemoteFileForUserAction\([^)]*\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const deleteMediaBody = detail.match(/async function deleteMedia\([^)]*\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const handleRemoveBody = detail.match(/async function handleRemoveMedia\([^)]*\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const handleDefectRemoveBody = detail.match(/async function handleDefectRemoveMedia\([^)]*\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(deleteHelperBody, /await\s+deleteInspectFile\(id\)/, 'user-initiated deletion should directly call the remote delete API')
  assert.match(deleteMediaBody, /await\s+deleteRemoteFileForUserAction\(targetPhoto\)/, 'long-press media deletion should wait for remote deletion')
  assert.match(handleRemoveBody, /await\s+deleteRemoteFileForUserAction\(photo\)/, 'checklist media deletion should wait for remote deletion')
  assert.match(handleDefectRemoveBody, /await\s+deleteRemoteFileForUserAction\(photo\)/, 'defect media deletion should wait for remote deletion')
  assert.ok(
    deleteMediaBody.indexOf('await deleteRemoteFileForUserAction(targetPhoto)') < deleteMediaBody.indexOf('currentItemData.value.photos.splice'),
    'long-press media should only be removed locally after the server delete succeeds'
  )
  assert.ok(
    handleRemoveBody.indexOf('await deleteRemoteFileForUserAction(photo)') < handleRemoveBody.indexOf('savedData.photos.splice'),
    'checklist media should only be removed locally after the server delete succeeds'
  )
  assert.ok(
    handleDefectRemoveBody.indexOf('await deleteRemoteFileForUserAction(photo)') < handleDefectRemoveBody.indexOf('quickDefectForm.value.photos.splice'),
    'defect media should only be removed locally after the server delete succeeds'
  )
})

test('media grid uses compact corner status badges without obscuring photos', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')

  assert.match(mediaGrid, /class="media-status-badge"/)
  assert.match(mediaGrid, /@click\.stop="handleStatusBadgeClick\(media, idx\)"/)
  assert.match(mediaGrid, /已保存到本地，等待同步/)
  assert.doesNotMatch(mediaGrid, /class="media-overlay/)

  const badgeCss = mediaGrid.match(/\.media-status-badge\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(badgeCss, /position:\s*absolute/)
  assert.match(badgeCss, /top:\s*\d+rpx/)
  assert.match(badgeCss, /left:\s*\d+rpx/)
})

test('uploaded photos keep their local preview for the current weak-network session', async () => {
  const photo = {
    _id: 'weak-network-preview',
    previewUrl: 'blob:weak-network-preview',
    dataUrl: '',
    bizId: 'item-1',
    mediaType: 'image',
    uploadStatus: 'pending',
    createdAt: '2026-07-16T10:00:00.000Z'
  }
  const revoked = []
  const originalRevokeObjectURL = URL.revokeObjectURL
  URL.revokeObjectURL = url => revoked.push(url)

  try {
    await photoUploadModule.processPendingUploads(
      { item: { photos: [photo] } },
      [],
      async () => {},
      {
        concurrency: 1,
        uploadPhoto: async () => ({
          success: true,
          fileId: 'server-file',
          filePath: '/server/file.jpg'
        })
      }
    )

    assert.equal(photo.previewUrl, 'blob:weak-network-preview')
    assert.deepEqual(revoked, [])
  } finally {
    URL.revokeObjectURL = originalRevokeObjectURL
  }
})

test('media item prefers an available local preview before the remote thumbnail', () => {
  const mediaItem = fs.readFileSync('pages/report/components/MediaItem.vue', 'utf8')
  const imgUrlBody = mediaItem.match(/const\s+imgUrl\s*=\s*computed\(\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/)?.[1] || ''
  const localPreviewIndex = imgUrlBody.indexOf('props.media?.previewUrl')
  const remoteFileIndex = imgUrlBody.indexOf('if (fileId.value)')

  assert.ok(localPreviewIndex >= 0, 'image rendering should consider the retained local preview')
  assert.ok(localPreviewIndex < remoteFileIndex, 'local preview should stay visible until the next page load')
})

test('media status badges use blue and yellow breathing lights', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')

  assert.match(mediaGrid, /class="status-upload-light"/)
  assert.match(mediaGrid, /class="status-wait-light"/)
  assert.match(mediaGrid, /\.status-upload-light[\s\S]{0,220}#2563eb/)
  assert.match(mediaGrid, /\.status-wait-light[\s\S]{0,220}#f59e0b/)
  assert.match(mediaGrid, /animation:\s*statusBreath/)
  assert.doesNotMatch(mediaGrid, /class="status-upload-icon"/)
  assert.doesNotMatch(mediaGrid, /class="status-wait-icon"/)
})

test('switching checklist popups does not revoke record-owned local previews', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')

  assert.doesNotMatch(
    mediaGrid,
    /URL\.revokeObjectURL\(urls\[[^\]]+\]\)/,
    'component cache cleanup must not revoke URLs still stored on photo records'
  )
  assert.doesNotMatch(
    mediaGrid,
    /URL\.revokeObjectURL\(cached\)/,
    'switching from a cached local preview must not invalidate the shared record URL'
  )
})

test('one upload wave starts at most four images and one video', async () => {
  assert.equal(
    typeof photoUploadModule.runMediaUploadPools,
    'function',
    'photoUpload should export a behavior-testable media pool scheduler'
  )

  const images = Array.from({ length: 8 }, (_, index) => ({ id: `image-${index}` }))
  const videos = Array.from({ length: 2 }, (_, index) => ({ id: `video-${index}` }))
  let imageIndex = 0
  let videoIndex = 0
  let activeImages = 0
  let activeVideos = 0
  let maxActiveImages = 0
  let maxActiveVideos = 0
  const finished = []

  await photoUploadModule.runMediaUploadPools({
    imageConcurrency: 4,
    videoConcurrency: 1,
    claimImage: () => images[imageIndex++] || null,
    claimVideo: () => videos[videoIndex++] || null,
    uploadImage: async (photo) => {
      activeImages++
      maxActiveImages = Math.max(maxActiveImages, activeImages)
      await new Promise(resolve => setTimeout(resolve, 10))
      finished.push(photo.id)
      activeImages--
    },
    uploadVideo: async (photo) => {
      activeVideos++
      maxActiveVideos = Math.max(maxActiveVideos, activeVideos)
      await new Promise(resolve => setTimeout(resolve, 80))
      finished.push(photo.id)
      activeVideos--
    }
  })

  assert.equal(maxActiveImages, 4)
  assert.equal(maxActiveVideos, 1)
  assert.equal(finished.length, 5)
  assert.ok(
    finished.indexOf('image-0') < finished.indexOf('video-0'),
    'slow video must not prevent images from completing'
  )
})

test('upload candidates are ordered globally by capture time', () => {
  assert.equal(typeof photoUploadModule.orderPhotoUploadCandidates, 'function')
  const newer = { id: 'newer', createdAt: '2026-07-16T10:00:03.000Z' }
  const oldest = { id: 'oldest', createdAt: '2026-07-16T10:00:01.000Z' }
  const middle = { id: 'middle', createdAt: '2026-07-16T10:00:02.000Z' }

  assert.deepEqual(
    photoUploadModule.orderPhotoUploadCandidates([newer, oldest, middle]).map(photo => photo.id),
    ['oldest', 'middle', 'newer']
  )
})

test('reconnect requeues transient failures but preserves permanent local-source errors', () => {
  assert.equal(typeof photoUploadModule.resetFailedPhotoUploadsForResume, 'function')
  const failed = {
    _id: 'failed',
    uploadStatus: 'error',
    uploadError: 'network stalled',
    _retryCount: 1
  }
  const pending = { _id: 'pending', uploadStatus: 'pending', _retryCount: 0 }
  const failedSibling = {
    _id: 'failed-sibling',
    uploadStatus: 'error',
    uploadError: 'network stalled',
    _retryCount: 1
  }
  const permanent = {
    _id: 'permanent',
    uploadStatus: 'error',
    uploadError: 'local source missing',
    _retryCount: Number.MAX_SAFE_INTEGER
  }
  const checklistData = { item: { photos: [failed, failedSibling, pending, permanent] } }

  const resetCount = photoUploadModule.resetFailedPhotoUploadsForResume(checklistData, [])

  assert.equal(resetCount, 2)
  assert.equal(failed.uploadStatus, 'pending')
  assert.equal(failed._retryCount, 0)
  assert.equal(failed.uploadError, '')
  assert.equal(pending.uploadStatus, 'pending')
  assert.equal(failedSibling.uploadStatus, 'pending')
  assert.equal(permanent.uploadStatus, 'error')
})

test('photos added while a wave is running wait for the next wave', async () => {
  assert.equal(typeof photoUploadModule.runMediaUploadPools, 'function')

  const images = [{ id: 'first' }]
  let imageIndex = 0
  const uploaded = []
  setTimeout(() => images.push({ id: 'late' }), 5)

  await photoUploadModule.runMediaUploadPools({
    imageConcurrency: 1,
    videoConcurrency: 1,
    claimImage: () => images[imageIndex++] || null,
    claimVideo: () => null,
    uploadImage: async (photo) => {
      await new Promise(resolve => setTimeout(resolve, 20))
      uploaded.push(photo.id)
    },
    uploadVideo: async () => {}
  })

  assert.deepEqual(uploaded, ['first'])
})

test('workers stop claiming later photos after the active upload blocks the queue', async () => {
  const images = [{ id: 'blocked' }, { id: 'later-1' }, { id: 'later-2' }]
  let imageIndex = 0
  let blocked = false
  const uploaded = []

  await photoUploadModule.runMediaUploadPools({
    imageConcurrency: 1,
    videoConcurrency: 1,
    shouldContinue: () => !blocked,
    claimImage: () => images[imageIndex++] || null,
    claimVideo: () => null,
    uploadImage: async (photo) => {
      uploaded.push(photo.id)
      blocked = true
    },
    uploadVideo: async () => {}
  })

  assert.deepEqual(uploaded, ['blocked'])
})

test('upload retries once and uses progress-aware stall timeout', () => {
  const photoUpload = fs.readFileSync('utils/photoUpload.js', 'utf8')
  const reportApi = fs.readFileSync('api/report.js', 'utf8')

  assert.match(photoUpload, /const\s+MAX_RETRY\s*=\s*1\b/)
  assert.match(reportApi, /const\s+UPLOAD_STALL_TIMEOUT_MS\s*=\s*60000\b/)
})

test('capture lifecycle prevents closing or opening another camera before conversion ends', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')
  const checkItemModal = fs.readFileSync('pages/report/components/CheckItemModal.vue', 'utf8')
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

  assert.match(mediaGrid, /const\s+captureBusy\s*=\s*ref\(false\)/)
  assert.match(mediaGrid, /emit\(["']capture-start["']\)/)
  assert.match(mediaGrid, /emit\(["']capture-end["']\)/)
  assert.match(checkItemModal, /["']capture-start["']/)
  assert.match(checkItemModal, /["']capture-end["']/)
  assert.match(detail, /pendingItemModalClose/)
  assert.match(detail, /enqueueChecklistMediaAppend/)
})

test('camera cancellation releases capture lock when chooser only calls complete', async () => {
  const { createCaptureCompletionGuard } = await import('../utils/mediaCaptureLifecycle.js')
  const events = []
  const cancelled = createCaptureCompletionGuard(() => events.push('cancelled'))

  cancelled.complete()
  cancelled.complete()
  assert.deepEqual(events, ['cancelled'], 'complete-only cancellation should release exactly once')

  const successful = createCaptureCompletionGuard(() => events.push('processed'))
  successful.beginResult()
  successful.complete()
  assert.deepEqual(events, ['cancelled'], 'complete must not unlock while success processing is active')
  successful.finish()
  assert.deepEqual(events, ['cancelled', 'processed'])

  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')
  assert.match(mediaGrid, /createCaptureCompletionGuard/)
  assert.match(mediaGrid, /complete:\s*\(\)\s*=>\s*callbackGuard\.complete\(\)/)
})

test('a silent camera cancellation can be replaced by the next camera click', () => {
  const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')

  assert.match(mediaGrid, /const\s+captureProcessing\s*=\s*ref\(false\)/)
  assert.match(mediaGrid, /:class="\{ disabled: captureProcessing \}"/)
  assert.match(
    mediaGrid,
    /function\s+markCaptureProcessing[\s\S]{0,300}emit\(["']capture-start["']\)/,
    'the parent modal should lock only after a file result starts processing'
  )
  assert.match(
    mediaGrid,
    /if\s*\(captureBusy\.value\)\s*\{\s*if\s*\(captureProcessing\.value\)\s*return;?\s*finishCapture\(activeCaptureId\);?\s*\}/,
    'a stale chooser lock must be cleared when the returned user taps camera again'
  )
  assert.match(mediaGrid, /if\s*\(captureId\s*!==\s*activeCaptureId\)\s*return/)
})

test('successful upload persists server state before cleaning its local blob', () => {
  const photoUpload = fs.readFileSync('utils/photoUpload.js', 'utf8')
  const persistIndex = photoUpload.indexOf('await persistUploadedState()')
  const cleanupIndex = photoUpload.indexOf('await cleanupUploadedSource(photo)')

  assert.ok(persistIndex >= 0, 'success path should durably persist the uploaded state')
  assert.ok(cleanupIndex > persistIndex, 'local source cleanup must happen after persistence')
})

test('serial task queue prevents overlapping local plan writes', async () => {
  const queuePath = 'utils/serialTaskQueue.js'
  assert.equal(
    fs.existsSync(queuePath),
    true,
    'a reusable serial task queue should protect plan persistence'
  )
  const { createSerialTaskQueue } = await import('../utils/serialTaskQueue.js')
  const enqueue = createSerialTaskQueue()
  const events = []

  const first = enqueue(async () => {
    events.push('first:start')
    await new Promise(resolve => setTimeout(resolve, 20))
    events.push('first:end')
  })
  const second = enqueue(async () => {
    events.push('second:start')
    events.push('second:end')
  })

  await Promise.all([first, second])
  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end'
  ])
})

test('leaving the report aborts active requests and stops upload workers', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

  assert.match(
    detail,
    /onUnload\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,180}abortActiveInspectUploads\(\)/
  )
  assert.match(
    detail,
    /shouldContinue:\s*\(\)\s*=>\s*_pageAlive/
  )
})

test('blob persistence resolves only after its IndexedDB transaction commits', () => {
  const blobStore = fs.readFileSync('utils/photoBlobStore.js', 'utf8')
  const saveBlobBody = blobStore.match(
    /export\s+async\s+function\s+saveBlob[\s\S]*?\n}\n/
  )?.[0] || ''

  assert.match(saveBlobBody, /tx\.oncomplete\s*=\s*\(\)\s*=>\s*resolve\(\)/)
  assert.doesNotMatch(saveBlobBody, /req\.onsuccess\s*=\s*\(\)\s*=>\s*resolve\(\)/)
})
