import assert from 'node:assert/strict'
import fs from 'node:fs'

const photoUpload = fs.readFileSync('utils/photoUpload.js', 'utf8')
const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
const reportApi = fs.readFileSync('api/report.js', 'utf8')
const mediaItem = fs.readFileSync('pages/report/components/MediaItem.vue', 'utf8')

assert.match(
  photoUpload,
  /export\s+async\s+function\s+getPhotoUploadSourceStatus\s*\(/,
  'photoUpload should expose a source status check before manual retry'
)

assert.match(
  detail,
  /await\s+getPhotoUploadSourceStatus\s*\(\s*photo\s*\)/,
  'manual retry should distinguish a missing source from temporarily unavailable IndexedDB'
)

assert.match(
  detail,
  /本地文件已失效，请重新拍照/,
  'manual retry should tell users to recapture when the local source is gone'
)

assert.match(
  reportApi,
  /uploadTask\s*=\s*uploadApi\.uploadFile\s*\(/,
  'native upload should keep the upload task handle'
)

assert.match(
  reportApi,
  /uploadTask\?\.abort\?\.\(\)/,
  'native upload timeout should abort the underlying task'
)

assert.match(
  reportApi,
  /let\s+settled\s*=\s*false/,
  'native upload should ignore late callbacks after timeout'
)

assert.match(
  reportApi,
  /export\s+function\s+abortActiveInspectUploads\s*\(/,
  'report upload API should expose a way to abort active uploads when the device goes offline'
)

assert.match(
  detail,
  /abortActiveInspectUploads\s*\(\s*\)/,
  'detail should abort active upload requests when marking offline failures'
)

assert.match(
  photoUpload,
  /export\s+async\s+function\s+runMediaUploadPools\s*\(/,
  'image and video uploads should use independent bounded worker pools'
)

assert.match(
  photoUpload,
  /DEFAULT_IMAGE_UPLOAD_CONCURRENCY\s*=\s*4/,
  'healthy networks may upload up to four images from the same batch'
)

assert.match(
  photoUpload,
  /DEFAULT_VIDEO_UPLOAD_CONCURRENCY\s*=\s*1/,
  'video uploads should use one worker without blocking images'
)

assert.match(
  detail,
  /function\s+persistDraftBeforeLeave\s*\(\s*\{\s*resetUploading\s*=\s*false\s*\}\s*=\s*\{\s*\}\s*\)/,
  'draft persistence should preserve uploading status by default'
)

assert.match(
  detail,
  /if\s*\(\s*resetUploading\s*\)\s*\{\s*resetUploadingPhotosToPending\s*\(\s*\)\s*\}/,
  'uploading photos should only be reset when explicitly leaving the page'
)

assert.match(
  detail,
  /onHide\s*\(\s*\(\s*\)\s*=>\s*\{\s*persistDraftBeforeLeave\s*\(\s*\{\s*resetUploading:\s*false\s*\}\s*\)/,
  'camera-triggered onHide should not turn uploading photos back into pending'
)

assert.match(
  detail,
  /onUnload\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]{0,220}persistDraftBeforeLeave\s*\(\s*\{\s*resetUploading:\s*true\s*\}\s*\)/,
  'unload should still reset stale uploading photos before persisting'
)

assert.match(
  detail,
  /function\s+markUploadingPhotosOfflineFailed\s*\(/,
  'detail should mark in-flight uploads as failed when the device goes offline'
)

assert.match(
  detail,
  /网络已断开，恢复后将自动上传/,
  'offline in-flight uploads should explain that they resume automatically'
)

assert.match(
  detail,
  /window\.addEventListener\(\s*['"]offline['"],\s*_networkOfflineHandler\s*\)/,
  'detail should listen for browser offline events'
)

assert.match(
  detail,
  /else\s+_networkOfflineHandler\s*\(\s*\)/,
  'uni network disconnect events should mark uploading photos as failed'
)

assert.match(
  photoUpload,
  /photo\.uploadStatus\s*=\s*'retry_wait'/,
  'transient failures should wait for automatic retry instead of requiring a manual retry'
)

assert.match(
  detail,
  /scheduleNextPhotoUploadRetry\s*\(/,
  'detail should schedule the next persisted automatic retry'
)

assert.doesNotMatch(
  detail,
  /result\?\.failed\s*>\s*0[\s\S]{0,180}count:\s*result\.failed/,
  'triggerPendingUploads should not show stale failed-attempt counts after a later retry succeeds'
)

assert.match(
  mediaItem,
  /getPhotoDisplayUrlAsync/,
  'MediaItem should restore local image preview from blobKey when previewUrl is missing'
)

assert.match(
  mediaItem,
  /const\s+localImgUrl\s*=\s*ref\s*\(\s*["']{2}\s*\)/,
  'MediaItem should keep an async local image URL fallback'
)

assert.match(
  mediaItem,
  /await\s+getPhotoDisplayUrlAsync\s*\(/,
  'MediaItem should asynchronously resolve image display URLs'
)
