import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const policyModule = await loadUtsModule('domain/photoUploadPolicy.uts')
const captureModule = await loadUtsModule('domain/cameraCapture.uts')
const serviceModule = await loadUtsModule('services/inspectionMediaService.uts')
const apiModule = await loadUtsModule('api/reportFileApi.uts')

test('video media detection follows the H5 isVideoMedia semantics', () => {
  assert.equal(policyModule.isVideoMedia({ mediaType: 'video' }), true)
  assert.equal(policyModule.isVideoMedia({ mediaType: 'VIDEO' }), true)
  assert.equal(policyModule.isVideoMedia({ mediaType: 'video/mp4' }), true)
  assert.equal(policyModule.isVideoMedia({ fileType: 'video' }), true)
  assert.equal(policyModule.isVideoMedia({ fileType: 'video/mp4' }), true)
  assert.equal(policyModule.isVideoMedia({ mimeType: 'video/quicktime' }), true)
  assert.equal(policyModule.isVideoMedia({ fileExt: 'mp4' }), true)
  assert.equal(policyModule.isVideoMedia({ ext: '.mov' }), true)
  assert.equal(policyModule.isVideoMedia({ localPath: '/saved/clip.mp4' }), true)
  assert.equal(policyModule.isVideoMedia('/saved/clip.MOV?x=1'), true)
  assert.equal(policyModule.isVideoMedia('/saved/clip.mp4#t=1'), true)
  assert.equal(policyModule.isVideoMedia({ mediaType: 'image' }), false)
  assert.equal(policyModule.isVideoMedia({ fileType: 'image' }), false)
  assert.equal(policyModule.isVideoMedia({ localPath: '/saved/a.jpg' }), false)
  assert.equal(policyModule.isVideoMedia(''), false)
  assert.equal(policyModule.isVideoMedia(null), false)
  assert.equal(policyModule.isVideoMedia({}), false)
})

test('video capture limits match the H5 sixty-second and two-hundred-MB contract', () => {
  assert.equal(policyModule.MAX_VIDEO_DURATION_SECONDS, 60)
  assert.equal(policyModule.MAX_VIDEO_SIZE_MB, 200)

  assert.equal(policyModule.validateVideoDuration(59).valid, true)
  assert.equal(policyModule.validateVideoDuration(60).valid, true)
  const durationFailure = policyModule.validateVideoDuration(60.5)
  assert.equal(durationFailure.valid, false)
  assert.match(durationFailure.message, /60/)

  assert.equal(policyModule.validateVideoSize(199).valid, true)
  assert.equal(policyModule.validateVideoSize(200).valid, true)
  const sizeFailure = policyModule.validateVideoSize(200.5)
  assert.equal(sizeFailure.valid, false)
  assert.match(sizeFailure.message, /200/)

  assert.equal(policyModule.validateVideoDuration(undefined).valid, true)
  assert.equal(policyModule.validateVideoSize(undefined).valid, true)
})

test('video uploads get a fifteen-minute timeout while images keep two minutes', () => {
  assert.equal(policyModule.resolveUploadTimeoutMs({ mediaType: 'video' }), 900000)
  assert.equal(policyModule.resolveUploadTimeoutMs({ localPath: '/v.mp4' }), 900000)
  assert.equal(policyModule.resolveUploadTimeoutMs({ mediaType: 'image' }), 120000)
  assert.equal(policyModule.resolveUploadTimeoutMs(null), 120000)
  assert.equal(policyModule.VIDEO_UPLOAD_CONCURRENCY, 1)
})

test('camera capture protocol carries per-path media kinds', () => {
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({
    items: [{ path: '/a.jpg', mediaKind: 'image' }, { path: '/b.mp4', mediaKind: 'video' }]
  }), [
    { path: '/a.jpg', mediaKind: 'image' },
    { path: '/b.mp4', mediaKind: 'video' }
  ])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({
    paths: ['/a.jpg', '/b.mp4'],
    mediaKinds: ['image', 'video']
  }), [
    { path: '/a.jpg', mediaKind: 'image' },
    { path: '/b.mp4', mediaKind: 'video' }
  ])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia(['/a.jpg']), [{ path: '/a.jpg', mediaKind: 'image' }])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({ items: [{ path: '/c.mp4' }] }), [{ path: '/c.mp4', mediaKind: 'image' }])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({ items: [{ path: '/c.mp4', mediaKind: 'clip' }] }), [{ path: '/c.mp4', mediaKind: 'image' }])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({ items: ['/a.jpg', '/a.jpg', '', { path: '/b.mp4', mediaKind: 'video' }] }), [
    { path: '/a.jpg', mediaKind: 'image' },
    { path: '/b.mp4', mediaKind: 'video' }
  ])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia({ items: [], cancelled: true }), [])
  assert.deepEqual(captureModule.normalizeCameraCaptureMedia(null), [])
})

test('media service tags video uploads and runs the video pool serially', async () => {
  let videoInFlight = 0
  let maxVideoInFlight = 0
  const pendingVideoGates = []
  const uploaded = []
  const marked = []
  const service = serviceModule.createInspectionMediaService({
    photoUploadPolicy: policyModule,
    photoRepository: {
      save: async () => {},
      listPendingByReportId: async () => [
        { photoId: 'img-1', localPath: '/one.jpg', bizId: 'item-result-1', bizType: 'checkResult', sortNo: 1 },
        { photoId: 'v-1', localPath: '/v1.mp4', mediaType: 'video', durationSeconds: 30, bizId: 'defect-1', bizType: 'defect', sortNo: 2 },
        { photoId: 'v-2', localPath: '/v2.mp4', mediaType: 'video', durationSeconds: 12, bizId: 'defect-1', bizType: 'defect', sortNo: 3 }
      ],
      markUploaded: async (planId, photoId, remote) => marked.push({ planId, photoId, remote }),
      listByReportId: async () => []
    },
    reportFileApi: {
      uploadInspectFile: async (localPath, params) => {
        uploaded.push({ localPath, params })
        if (params.fileType === 'video') {
          videoInFlight += 1
          maxVideoInFlight = Math.max(maxVideoInFlight, videoInFlight)
          if (uploaded.filter((item) => item.params.fileType === 'video').length === 1) {
            await new Promise((resolve) => pendingVideoGates.push(resolve))
          } else {
            await new Promise((resolve) => setTimeout(resolve, 5))
          }
          videoInFlight -= 1
        }
        return { fileId: `file-${uploaded.length}` }
      }
    },
    isOnline: async () => true,
    getNetworkType: async () => 'wifi',
    createId: () => 'unused'
  })

  const task = service.uploadPendingPhotos('plan-1')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(pendingVideoGates.length, 1)
  pendingVideoGates.splice(0).forEach((release) => release())
  const uploadResult = await task

  assert.equal(maxVideoInFlight, 1)
  assert.equal(uploaded.length, 3)

  const videoParams = uploaded.find((item) => item.localPath === '/v1.mp4').params
  assert.equal(videoParams.fileType, 'video')
  assert.equal(videoParams.uploadTimeoutMs, 900000)
  const imageParams = uploaded.find((item) => item.localPath === '/one.jpg').params
  assert.equal(imageParams.fileType, 'image')
  assert.equal(imageParams.uploadTimeoutMs, 120000)
  assert.equal(marked.filter((item) => item.photoId === 'v-1' || item.photoId === 'v-2').length, 2)
  assert.equal(uploadResult.pendingCount, 3)
})

test('upload transport receives the H5 uni-channel fileType field', async () => {
  const uploads = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com',
    getSession: () => ({ token: 'token-1' }),
    uploadTransport: async (request) => {
      uploads.push(request)
      return { data: { code: 200, data: { fileId: 'file-1' } }, statusCode: 200 }
    }
  })

  await api.uploadInspectFile('/saved/clip.mp4', {
    bizId: 'plan-1',
    bizType: 'defect',
    fileType: 'video',
    uploadTimeoutMs: 900000
  })
  await api.uploadInspectFile('/saved/photo.jpg', { bizId: 'plan-1', bizType: 'defect' })

  assert.equal(uploads[0].fileType, 'video')
  assert.equal(uploads[0].timeout, 900000)
  assert.equal('fileType' in uploads[0].formData, false)
  assert.equal(uploads[1].fileType, 'image')
  assert.equal(uploads[1].timeout, 120000)
})
test('detail page keeps generic media persistence while the capture page returns captured media', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /buildCameraCaptureEventName/)
  assert.match(source, /mediaKind:\s*String\(item\?\.mediaKind \?\? 'image'\)/)
  assert.match(source, /mediaType/)
  assert.match(source, /'video'/)
  assert.match(source, /durationSeconds/)
  assert.match(source, /durationByPath/)
  assert.match(source, /isVideo/)
})

test('media grid renders video cells with a play badge and duration label', async () => {
  const item = await readFile('components/detail/InspectionMediaItem.uvue', 'utf8')
  const image = await readFile('components/detail/InspectionMediaImage.uvue', 'utf8')
  const editor = await readFile('components/detail/PhotoEditorSheet.uvue', 'utf8')

  assert.match(item, /import \{ isVideoMedia \} from '\.\.\/\.\.\/domain\/photoUploadPolicy\.uts'/)
  assert.match(item, /const isVideo = computed\(\(\): boolean => isVideoMedia\(mediaData\.value\)\)/)
  assert.match(item, /media-video-badge/)
  assert.match(item, /video-play-triangle/)
  assert.match(item, /videoDurationLabel/)
  assert.match(image, /isVideoMedia/)
  assert.match(image, /video-fallback/)
  assert.match(editor, /<video/)
  assert.match(editor, /isVideoMedia/)
  assert.match(editor, /本地视频/)
  assert.match(editor, /视频已上传/)
})
