import { uploadInspectFile } from '../api/report.js'
import { getApiBase } from './constants.js'
import { generateBlobKey, saveBlob, readBlobWithStatus, removeBlob } from './photoBlobStore.js'

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp'
}

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp'
}

const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp', 'm4v'])

function inferExtFromName(name = '') {
  const normalized = String(name || '').trim()
  const m = normalized.match(/\.([a-z0-9]+)(?:[#?].*)?$/i)
  return String(m?.[1] || '').toLowerCase()
}

function normalizeMimeType(mimeType) {
  return String(mimeType || '').trim().toLowerCase()
}

function inferExtForPhoto(photo, fallback = '') {
  const candidates = [
    photo?.sourceName,
    photo?.name,
    photo?.fileName,
    photo?.filePath,
    photo?.localPath,
    photo?.previewUrl,
    typeof photo?.source === 'string' ? photo.source : ''
  ]
  for (const c of candidates) {
    const ext = inferExtFromName(c)
    if (ext) return ext
  }
  return fallback
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const mime = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    if (!(blob instanceof Blob)) { resolve(''); return }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const parts = result.split(',')
      resolve(parts[1] || '')
    }
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

const _coverBlobMap = new Map()

export function storeCoverBlob(id, blob) {
  if (id && blob) _coverBlobMap.set(id, blob)
}

export function getCoverBlob(id) {
  return _coverBlobMap.get(id) || null
}

export function removeCoverBlob(id) {
  _coverBlobMap.delete(id)
}

function destroyTempVideo(video, blobUrl) {
  try { video.pause() } catch {}
  video.onloadedmetadata = null
  video.onseeked = null
  video.onerror = null
  video.onloadeddata = null
  video.removeAttribute('src')
  video.load()
  if (video.parentNode) video.parentNode.removeChild(video)
  if (blobUrl) { try { URL.revokeObjectURL(blobUrl) } catch {} }
}

export function extractVideoCover(videoBlob) {
  return new Promise((resolve) => {
    if (!(videoBlob instanceof Blob) || !videoBlob.type?.startsWith('video/')) {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(videoBlob)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const cleanup = () => { destroyTempVideo(video, url) }
    const capture = () => {
      try {
        const w = video.videoWidth || 320
        const h = video.videoHeight || 240
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => {
          cleanup()
          resolve(blob)
        }, 'image/jpeg', 0.8)
      } catch {
        cleanup()
        resolve(null)
      }
    }
    video.onloadedmetadata = () => {
      video.currentTime = 0.1
    }
    video.onseeked = capture
    video.onerror = () => { cleanup(); resolve(null) }
    const timeout = setTimeout(() => { cleanup(); resolve(null) }, 8000)
    video.addEventListener('seeked', () => clearTimeout(timeout), { once: true })
    video.addEventListener('error', () => clearTimeout(timeout), { once: true })
    video.src = url
  })
}

let _photoCounter = 0
const _rawBlobMap = new Map()

function nextId() {
  return `photo_${Date.now()}_${++_photoCounter}`
}

export function storeRawBlob(id, blob) {
  if (id && blob) _rawBlobMap.set(id, blob)
}

export function getRawBlob(id) {
  return _rawBlobMap.get(id) || null
}

export function removeRawBlob(id) {
  _rawBlobMap.delete(id)
}

/**
 * 从 File/Blob 创建图片记录，Blob 存入 IndexedDB
 * @param {File|Blob} blob
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function makePhotoRecordFromBlob(blob, { bizId = '', bizType = 'checkResult', subGoodsNo = '', sortNo = 0 } = {}) {
  const id = nextId()
  const blobKey = generateBlobKey()
  const previewUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(blob) : null
  const sourceName = blob instanceof File ? String(blob.name || '') : ''
  const ext = inferExtFromName(sourceName)
  const rawMimeType = normalizeMimeType(blob?.type)
  const mimeType = (rawMimeType === '' || rawMimeType === 'application/octet-stream') && ext
    ? (EXT_TO_MIME[ext] || rawMimeType)
    : rawMimeType
  const mediaType = mimeType.startsWith('video/') ? 'video' : (VIDEO_EXTS.has(ext) ? 'video' : 'image')
  const record = {
    _id: id,
    blobKey,
    localPath: '',
    dataUrl: '',
    previewUrl,
    coverUrl: null,
    fileId: null,
    filePath: null,
    thumbnailPath: null,
    uploadStatus: 'pending',
    mediaType,
    mimeType,
    sourceName,
    bizId,
    bizType,
    subGoodsNo,
    sortNo,
    createdAt: new Date().toISOString()
  }
  try {
    await saveBlob(blobKey, blob)
  } catch (error) {
    if (previewUrl?.startsWith('blob:')) {
      try { URL.revokeObjectURL(previewUrl) } catch {}
    }
    throw new Error(`本地文件保存失败: ${error?.message || error}`)
  }
  if (mediaType === 'video') {
    _scheduleVideoBgTask(record, blob)
  }
  return record
}

function _scheduleVideoBgTask(record, blob) {
  const doWork = async () => {
    try {
      const coverBlob = await extractVideoCover(blob)
      if (coverBlob) {
        storeCoverBlob(record._id, coverBlob)
        record.coverUrl = URL.createObjectURL(coverBlob)
      }
    } catch {}
  }
  setTimeout(doWork, 0)
}

/**
 * 兼容旧调用：从 base64 DataURL 或本地路径创建图片记录
 * 如果是 DataURL 会转为 Blob 存入 IndexedDB
 */
export async function makePhotoRecord(source, { bizId = '', bizType = 'checkResult', subGoodsNo = '', sortNo = 0 } = {}) {
  const normalizedSource = String(source || '')
  const isDataUrl = normalizedSource.startsWith('data:')

  if (isDataUrl) {
    const blob = dataUrlToBlob(normalizedSource)
    return makePhotoRecordFromBlob(blob, { bizId, bizType, subGoodsNo, sortNo })
  }

  const plainPath = normalizedSource.split(/[?#]/)[0] || ''
  const isVideo = /\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/i.test(plainPath) || plainPath.toLowerCase().endsWith('video')
  return {
    _id: nextId(),
    blobKey: '',
    localPath: normalizedSource,
    dataUrl: '',
    previewUrl: normalizedSource || null,
    fileId: null,
    filePath: null,
    thumbnailPath: null,
    uploadStatus: 'pending',
    mediaType: isVideo ? 'video' : 'image',
    mimeType: '',
    bizId,
    bizType,
    subGoodsNo,
    sortNo,
    createdAt: new Date().toISOString()
  }
}

export function isPhotoRecord(photo) {
  return photo !== null && photo !== undefined && typeof photo === 'object'
    && ('dataUrl' in photo || 'filePath' in photo || '_id' in photo || 'blobKey' in photo)
}

function isUploadedPhotoRecord(photo) {
  if (!photo || typeof photo !== 'object') return false
  const uploadStatus = String(photo.uploadStatus || '').toLowerCase()
  if (uploadStatus === 'done' || uploadStatus === 'success' || uploadStatus === 'uploaded') return true
  if (photo.uploadSuccess === true) return true
  if (String(photo.fileId || '').trim()) return true
  const filePath = String(photo.filePath || photo.fileUrl || photo.url || '').trim()
  const localPath = String(photo.localPath || '').trim()
  const dataUrl = String(photo.dataUrl || '').trim()
  const blobKey = String(photo.blobKey || '').trim()
  if (filePath && !localPath && !blobKey && !dataUrl.startsWith('data:')) return true
  return false
}

export function isVideoMedia(photo) {
  if (!photo) return false
  if (typeof photo === 'string') {
    const path = photo.toLowerCase()
    const plainPath = path.split(/[?#]/)[0] || ''
    if (plainPath.endsWith('video')) return true
    return /\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/.test(plainPath)
  }
  if (typeof photo !== 'object') return false
  const mediaType = String(photo.mediaType || '').toLowerCase()
  if (mediaType === 'video' || mediaType.startsWith('video/')) return true
  if (photo.fileType === 'video') return true
  const fileExtRaw = String(photo.fileExt || photo.ext || '').trim().toLowerCase()
  const fileExt = fileExtRaw.startsWith('.') ? fileExtRaw.slice(1) : fileExtRaw
  if (fileExt === 'video') return true
  if (fileExt && VIDEO_EXTS.has(fileExt)) return true
  const fileType = String(photo.fileType || '').toLowerCase()
  if (fileType.startsWith('video/')) return true
  const mime = String(photo.mimeType || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  const path = String(photo.filePath || photo.localPath || '').toLowerCase()
  const plainPath = path.split(/[?#]/)[0] || ''
  if (plainPath.endsWith('video')) return true
  return /\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/.test(plainPath)
}

export function getPhotoDisplayUrl(photo, mode = 'thumbnail') {
  if (!photo) return null
  if (typeof photo === 'string') return photo
  if (photo.fileId) {
    const endpoint = mode === 'preview' ? 'preview' : 'thumbnail'
    return `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(photo.fileId))}/${endpoint}`
  }
  if (photo.previewUrl) return photo.previewUrl
  if (mode === 'preview') return photo.filePath || photo.thumbnailPath || photo.localPath || photo.dataUrl || null
  return photo.thumbnailPath || photo.filePath || photo.localPath || photo.dataUrl || null
}

export async function getPhotoDisplayUrlAsync(photo, mode = 'thumbnail', {
  readBlob = readBlobWithStatus,
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
  maxAttempts = 4,
  retryDelayMs = 250
} = {}) {
  const syncUrl = getPhotoDisplayUrl(photo, mode)
  if (syncUrl) return syncUrl

  if (photo && typeof photo === 'object' && photo.previewUrl?.startsWith('blob:')) {
    return photo.previewUrl
  }

  const rawBlob = getRawBlob(photo?._id)
  if (rawBlob instanceof Blob) {
    const oldUrl = photo?.previewUrl
    const url = URL.createObjectURL(rawBlob)
    if (photo && typeof photo === 'object') {
      if (oldUrl && oldUrl.startsWith('blob:') && oldUrl !== url) {
        try { URL.revokeObjectURL(oldUrl) } catch {}
      }
      photo.previewUrl = url
    }
    return url
  }

  const blobKey = String(photo?.blobKey || '').trim()
  if (blobKey) {
    const attempts = Math.max(1, Number(maxAttempts) || 1)
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const lookup = await readBlob(blobKey)
        if (lookup?.status === 'found' && lookup.blob instanceof Blob) {
          const blob = lookup.blob
          const oldUrl = photo?.previewUrl
          const url = URL.createObjectURL(blob)
          if (photo && typeof photo === 'object') {
            if (oldUrl && oldUrl.startsWith('blob:') && oldUrl !== url) {
              try { URL.revokeObjectURL(oldUrl) } catch {}
            }
            photo.previewUrl = url
          }
          return url
        }
        if (lookup?.status !== 'unavailable') return null
      } catch {
        // IndexedDB may still be reopening after the page is restored.
      }
      if (attempt < attempts - 1) {
        await wait(Math.max(0, Number(retryDelayMs) || 0))
      }
    }
  }
  return null
}

async function resolveUploadFile(photo, readBlob = readBlobWithStatus) {
  const rawBlob = getRawBlob(photo._id)
  if (rawBlob instanceof Blob) {
    if (rawBlob instanceof File) return rawBlob
    const rawType = normalizeMimeType(rawBlob.type)
    const fallbackExt = inferExtForPhoto(photo, 'jpg')
    const ext = MIME_TO_EXT[rawType] || fallbackExt || 'bin'
    const type = (rawType && rawType !== 'application/octet-stream') ? rawType : (EXT_TO_MIME[ext] || rawType || 'application/octet-stream')
    return new File([rawBlob], `photo_${Date.now()}.${ext}`, { type })
  }

  // 1. Prioritize filePath if it exists, it might be a native path that uni/dd can upload directly
  const filePath = String(photo.filePath || photo.url || photo.fileUrl || '').trim()
  if (filePath && !filePath.startsWith('http') && !filePath.startsWith('blob:') && !filePath.startsWith('data:')) {
      return filePath;
  }
  
  // 1.5 兼容本地 source 就是纯字符串的情况
  const sourceStr = typeof photo.source === 'string' ? photo.source.trim() : '';
  if (sourceStr && !sourceStr.startsWith('http') && !sourceStr.startsWith('blob:') && !sourceStr.startsWith('data:')) {
     return sourceStr;
  }

  const blobKey = String(photo.blobKey || '').trim()
  let blobLookupError = null
  if (blobKey) {
    const lookup = await readBlob(blobKey)
    if (lookup?.status === 'found' && lookup.blob instanceof Blob) {
      const blob = lookup.blob
      const rawType = normalizeMimeType(blob.type)
      const fallbackExt = inferExtForPhoto(photo, 'jpg')
      const ext = MIME_TO_EXT[rawType] || fallbackExt || 'bin'
      const type = (rawType && rawType !== 'application/octet-stream') ? rawType : (EXT_TO_MIME[ext] || rawType || 'application/octet-stream')
      return new File([blob], `photo_${Date.now()}.${ext}`, { type })
    }
    if (lookup?.status === 'unavailable') {
      blobLookupError = lookup.error || new Error('IndexedDB temporarily unavailable')
    }
  }

  const previewUrl = String(photo.previewUrl || '').trim()
  if (previewUrl && previewUrl.startsWith('blob:')) {
    try {
      const resp = await fetch(previewUrl)
      const blob = await resp.blob()
      const rawType = normalizeMimeType(blob.type)
      const fallbackExt = inferExtForPhoto(photo, 'jpg')
      const ext = MIME_TO_EXT[rawType] || fallbackExt || 'bin'
      const type = (rawType && rawType !== 'application/octet-stream') ? rawType : (EXT_TO_MIME[ext] || rawType || 'application/octet-stream')
      return new File([blob], `photo_${Date.now()}.${ext}`, { type })
    } catch {}
  }

  const localPath = String(photo.localPath || '').trim()
  if (localPath && !localPath.startsWith('data:')) {
    if (localPath.startsWith('blob:')) {
      try {
        const resp = await fetch(localPath)
        const blob = await resp.blob()
        const rawType = normalizeMimeType(blob.type)
        const fallbackExt = inferExtForPhoto(photo, 'jpg')
        const ext = MIME_TO_EXT[rawType] || fallbackExt || 'bin'
        const type = (rawType && rawType !== 'application/octet-stream') ? rawType : (EXT_TO_MIME[ext] || rawType || 'application/octet-stream')
        return new File([blob], `photo_${Date.now()}.${ext}`, { type })
      } catch {
        return null
      }
    }
    // Return localPath directly for dd.uploadFile or uni.uploadFile to handle
    return localPath
  }

  const dataUrl = String(photo.dataUrl || '').trim()
  if (dataUrl && dataUrl.startsWith('data:')) {
    const blob = dataUrlToBlob(dataUrl)
    const rawType = normalizeMimeType(blob.type)
    const ext = MIME_TO_EXT[rawType] || 'jpg'
    return new File([blob], `photo_${Date.now()}.${ext}`, { type: rawType || 'image/jpeg' })
  }

  if (blobLookupError) {
    const error = new Error(blobLookupError.message || 'IndexedDB temporarily unavailable')
    error.code = 'PHOTO_SOURCE_UNAVAILABLE'
    throw error
  }

  return null
}

export async function getPhotoUploadSourceStatus(photo, { readBlob = readBlobWithStatus } = {}) {
  try {
    const file = await resolveUploadFile(photo, readBlob)
    return file
      ? { status: 'ready', file }
      : { status: 'missing', file: null }
  } catch (error) {
    if (error?.code === 'PHOTO_SOURCE_UNAVAILABLE') {
      return { status: 'unavailable', file: null, error }
    }
    throw error
  }
}

export async function canResolvePhotoUploadSource(photo) {
  try {
    return (await getPhotoUploadSourceStatus(photo)).status === 'ready'
  } catch {
    return false
  }
}

const MAX_RETRY = 1
const RETRY_DELAYS = [1000]
const DEFAULT_IMAGE_UPLOAD_CONCURRENCY = 4
const DEFAULT_VIDEO_UPLOAD_CONCURRENCY = 1
const PHOTO_UPLOAD_RETRY_DELAYS = [
  2_000,
  5_000,
  15_000,
  30_000,
  60_000,
  120_000
]
const PHOTO_UPLOAD_MAX_RETRY_DELAY = 300_000

export function getPhotoUploadRetryDelay(attempt = 1) {
  const normalizedAttempt = Math.max(1, Number(attempt) || 1)
  return PHOTO_UPLOAD_RETRY_DELAYS[normalizedAttempt - 1] || PHOTO_UPLOAD_MAX_RETRY_DELAY
}

export function isRetryablePhotoUploadError(error) {
  const httpStatus = Number(error?.httpStatus ?? error?.statusCode ?? error?.status ?? 0)
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500) {
    return true
  }
  if (httpStatus >= 400 && httpStatus < 500) return false
  return true
}

export function isPhotoUploadRetryReady(photo, nowMs = Date.now()) {
  if (String(photo?.uploadStatus || '').toLowerCase() !== 'retry_wait') return true
  const nextRetryAt = Date.parse(String(photo?.nextRetryAt || ''))
  return !Number.isFinite(nextRetryAt) || nextRetryAt <= Number(nowMs)
}

export function getNextPhotoUploadRetryAt(checklistData, defects) {
  let earliest = null
  const visit = (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (String(photo?.uploadStatus || '').toLowerCase() !== 'retry_wait') continue
      const nextRetryAt = Date.parse(String(photo?.nextRetryAt || ''))
      if (!Number.isFinite(nextRetryAt)) continue
      if (earliest === null || nextRetryAt < earliest) earliest = nextRetryAt
    }
  }
  for (const key of Object.keys(checklistData || {})) visit(checklistData[key]?.photos)
  for (const defect of (defects || [])) visit(defect?.photos)
  return earliest
}

function isAutoUploadCandidate(photo) {
  if (!isPhotoRecord(photo)) return false
  if (isUploadedPhotoRecord(photo)) return false
  const status = String(photo.uploadStatus || '').toLowerCase()
  if (status === 'done' || status === 'success' || status === 'uploaded') return false
  if (status === 'uploading') return false
  if (status === 'needs_attention') return false
  if (status === 'error' && photo._retryCount === Number.MAX_SAFE_INTEGER) return false
  if (!isPhotoUploadRetryReady(photo)) return false
  if (!String(photo.bizId || '').trim()) return false
  return true
}

async function uploadSinglePhotoRecord(photo, shouldContinue = () => true) {
  const source = await getPhotoUploadSourceStatus(photo)
  if (source.status === 'unavailable') {
    return {
      success: false,
      retryable: true,
      error: source.error?.message || '本地图片暂时无法读取，稍后自动重试'
    }
  }
  if (source.status === 'missing') {
    return {
      success: false,
      retryable: false,
      error: '本地图片文件不存在，请重新拍照'
    }
  }
  const file = source.file

  let coverFile = null
  let thumbnailBase64 = ''
  if (photo.mediaType === 'video') {
    const coverBlob = getCoverBlob(photo._id)
    if (coverBlob instanceof Blob) {
      coverFile = new File([coverBlob], `cover_${Date.now()}.jpg`, { type: 'image/jpeg' })
      thumbnailBase64 = await blobToBase64(coverBlob)
    }
  }

  let lastError = ''
  let lastFailure = null
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    if (!shouldContinue()) {
      return { success: false, cancelled: true, error: 'upload cancelled' }
    }
    try {
      const result = await uploadInspectFile(file, {
        bizId: photo.bizId,
        bizType: photo.bizType,
        subGoodsNo: photo.subGoodsNo,
        sortNo: photo.sortNo,
        cover: coverFile,
        thumbnailBase64,
        mediaType: photo.mediaType,
        mimeType: photo.mimeType
      })
      return {
        success: true,
        fileId: String(result?.fileId || ''),
        fileName: result?.fileName || '',
        filePath: result?.filePath || '',
        fileExt: result?.fileExt || '',
        thumbnailPath: result?.thumbnailPath || '',
        fileType: result?.fileType || ''
      }
    } catch (error) {
      lastFailure = error
      lastError = error.message || String(error)
      if (!shouldContinue()) {
        return { success: false, cancelled: true, error: 'upload cancelled' }
      }
      if (attempt < MAX_RETRY) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt] || 1000))
      }
    }
  }
  return {
    success: false,
    error: lastError,
    retryable: isRetryablePhotoUploadError(lastFailure)
  }
}

export function countPendingPhotoUploads(checklistData, defects) {
  let count = 0
  const countInPhotos = (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (!isPhotoRecord(photo)) continue
      if (isUploadedPhotoRecord(photo)) continue
      if (photo.uploadStatus === 'done' || photo.uploadStatus === 'uploading') continue
      count++
    }
  }
  for (const key of Object.keys(checklistData || {})) {
    countInPhotos(checklistData[key]?.photos)
  }
  for (const defect of (defects || [])) {
    countInPhotos(defect?.photos)
  }
  return count
}

export function hasPendingPhotoUploads(checklistData, defects) {
  return countPendingPhotoUploads(checklistData, defects) > 0
}

function matchesPhotoMediaKind(photo, mediaKind = 'all') {
  if (mediaKind === 'image') return !isVideoMedia(photo)
  if (mediaKind === 'video') return isVideoMedia(photo)
  return true
}

export function countAutoPendingPhotoUploads(checklistData, defects, mediaKind = 'all') {
  let count = 0
  const countInPhotos = (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (matchesPhotoMediaKind(photo, mediaKind) && isAutoUploadCandidate(photo)) count++
    }
  }
  for (const key of Object.keys(checklistData || {})) {
    countInPhotos(checklistData[key]?.photos)
  }
  for (const defect of (defects || [])) {
    countInPhotos(defect?.photos)
  }
  return count
}

export function hasAutoPendingPhotoUploads(checklistData, defects, mediaKind = 'all') {
  return countAutoPendingPhotoUploads(checklistData, defects, mediaKind) > 0
}

export function orderPhotoUploadCandidates(photos = []) {
  return photos
    .map((photo, index) => ({ photo, index }))
    .sort((a, b) => {
      const aTime = Date.parse(a.photo?.createdAt || '')
      const bTime = Date.parse(b.photo?.createdAt || '')
      const normalizedATime = Number.isFinite(aTime) ? aTime : 0
      const normalizedBTime = Number.isFinite(bTime) ? bTime : 0
      return normalizedATime - normalizedBTime || a.index - b.index
    })
    .map(entry => entry.photo)
}

export function resetFailedPhotoUploadsForResume(checklistData, defects) {
  const seen = new Set()
  let resetCount = 0
  const resetList = (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (!photo || seen.has(photo)) continue
      seen.add(photo)
      if (String(photo.uploadStatus || '').toLowerCase() !== 'error') continue
      if (photo._retryCount === Number.MAX_SAFE_INTEGER) continue
      resetPhotoForRetry(photo)
      resetCount++
    }
  }
  for (const key of Object.keys(checklistData || {})) {
    resetList(checklistData[key]?.photos)
  }
  for (const defect of (defects || [])) {
    resetList(defect?.photos)
  }
  return resetCount
}

export function releasePhotoUploadRetryWaits(checklistData, defects) {
  const seen = new Set()
  let releasedCount = 0
  const releaseList = (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (!photo || seen.has(photo)) continue
      seen.add(photo)
      if (String(photo.uploadStatus || '').toLowerCase() !== 'retry_wait') continue
      photo.uploadStatus = 'pending'
      delete photo.nextRetryAt
      delete photo.uploadStartedAt
      delete photo._uploadRunId
      releasedCount++
    }
  }
  for (const key of Object.keys(checklistData || {})) releaseList(checklistData[key]?.photos)
  for (const defect of (defects || [])) releaseList(defect?.photos)
  return releasedCount
}

export async function runMediaUploadPools({
  claimImage,
  claimVideo,
  uploadImage,
  uploadVideo,
  imageConcurrency = DEFAULT_IMAGE_UPLOAD_CONCURRENCY,
  videoConcurrency = DEFAULT_VIDEO_UPLOAD_CONCURRENCY,
  shouldContinue = () => true
}) {
  async function worker(claim, upload) {
    if (!shouldContinue()) return
    const photo = claim()
    if (!photo) return
    await upload(photo)
  }

  const imageWorkerCount = Math.max(1, Number(imageConcurrency) || 1)
  const videoWorkerCount = Math.max(1, Number(videoConcurrency) || 1)
  await Promise.all([
    ...Array.from({ length: videoWorkerCount }, () => worker(claimVideo, uploadVideo)),
    ...Array.from({ length: imageWorkerCount }, () => worker(claimImage, uploadImage))
  ])
}

async function cleanupUploadedSource(photo) {
  // Keep the current object URL alive for this page session. On weak networks the
  // server thumbnail may not be readable immediately after the upload response.
  if (photo.coverUrl?.startsWith('blob:')) {
    try { URL.revokeObjectURL(photo.coverUrl) } catch {}
  }
  photo.coverUrl = ''
  removeCoverBlob(photo._id)
  removeRawBlob(photo._id)
  const blobKey = String(photo.blobKey || '').trim()
  if (blobKey) await removeBlob(blobKey)
}

export async function processPendingUploads(checklistData, defects, onSave, {
  concurrency = DEFAULT_IMAGE_UPLOAD_CONCURRENCY,
  videoConcurrency = DEFAULT_VIDEO_UPLOAD_CONCURRENCY,
  onUploaded,
  shouldContinue = () => true,
  uploadPhoto = uploadSinglePhotoRecord,
  now = Date.now,
  mediaKind = 'all'
} = {}) {
  const doUpload = async () => {
    let uploaded = 0
    let failed = 0
    let retryWaiting = 0
    let skipped = 0
    let needsAttention = 0

    while (true) {
      let claimedThisRound = 0
      function visitPhotos(visitor) {
        const seen = new Set()
        const candidates = []
        const collectList = (photos) => {
          if (!Array.isArray(photos)) return
          for (const photo of photos) {
            if (seen.has(photo)) continue
            seen.add(photo)
            candidates.push(photo)
          }
        }
        for (const key of Object.keys(checklistData || {})) {
          collectList(checklistData[key]?.photos)
        }
        for (const defect of (defects || [])) {
          collectList(defect?.photos)
        }
        for (const photo of orderPhotoUploadCandidates(candidates)) {
          const result = visitor(photo)
          if (result) return result
        }
        return null
      }

      function normalizeUploadedOrSkippedPhoto(photo) {
        if (!isPhotoRecord(photo)) { skipped++; return false }
        if (!matchesPhotoMediaKind(photo, mediaKind)) return false
        if (isUploadedPhotoRecord(photo)) {
          if (photo.uploadStatus !== 'done') photo.uploadStatus = 'done'
          return false
        }
        if (photo.uploadStatus === 'done') return false
        if (photo.uploadStatus === 'uploading') return false
        if (photo.uploadStatus === 'needs_attention') return false
        if (photo.uploadStatus === 'error' && photo._retryCount === Number.MAX_SAFE_INTEGER) return false
        if (!isPhotoUploadRetryReady(photo, now())) return false
        if (!photo.bizId) { skipped++; return false }
        return true
      }

      function claimNextUploadCandidate(kind) {
        if (!shouldContinue()) return null
        return visitPhotos((photo) => {
          if (!normalizeUploadedOrSkippedPhoto(photo)) return null
          const isVideo = photo.mediaType === 'video'
          if (kind === 'video' && !isVideo) return null
          if (kind === 'image' && isVideo) return null
          photo.uploadStatus = 'uploading'
          photo.uploadStartedAt = new Date().toISOString()
          photo._retryCount = (photo._retryCount || 0) + 1
          photo._uploadRunId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          claimedThisRound++
          return photo
        })
      }

      function hasAnyPendingCandidate() {
        return !!visitPhotos((photo) => {
          if (!isPhotoRecord(photo)) return null
          if (!matchesPhotoMediaKind(photo, mediaKind)) return null
          if (isUploadedPhotoRecord(photo)) return null
          const status = String(photo.uploadStatus || '').toLowerCase()
          if (status === 'done' || status === 'uploading') return null
          if (status === 'needs_attention') return null
          if (status === 'error' && photo._retryCount === Number.MAX_SAFE_INTEGER) return null
          if (!isPhotoUploadRetryReady(photo, now())) return null
          if (!photo.bizId) return null
          return photo
        })
      }

      function collectPhotos(photos) {
        if (!Array.isArray(photos)) return
        for (const photo of photos) {
          if (!isPhotoRecord(photo)) { skipped++; continue }
          if (isUploadedPhotoRecord(photo)) {
            if (photo.uploadStatus !== 'done') photo.uploadStatus = 'done'
            continue
          }
          if (photo.uploadStatus === 'done') continue
          if (photo.uploadStatus === 'uploading') continue
          if (photo.uploadStatus === 'needs_attention') continue
          if (photo.uploadStatus === 'error' && photo._retryCount === Number.MAX_SAFE_INTEGER) continue
          if (!isPhotoUploadRetryReady(photo, now())) continue
          if (!photo.bizId) { skipped++; continue }
        }
      }

      for (const key of Object.keys(checklistData || {})) {
        collectPhotos(checklistData[key]?.photos)
      }
      for (const defect of (defects || [])) {
        collectPhotos(defect?.photos)
      }

      if (!hasAnyPendingCandidate()) break

      let stateChanged = false
      const uploadedPhotosToCleanup = []

      function persistUploadedState() {
        if (typeof onSave !== 'function') return Promise.resolve()
        return onSave()
      }

      function isPhotoStillPresent(photo) {
        for (const key of Object.keys(checklistData || {})) {
          if (checklistData[key]?.photos?.includes(photo)) return true
        }
        for (const defect of (defects || [])) {
          if (defect?.photos?.includes(photo)) return true
        }
        return false
      }

      async function uploadOne(photo) {
        if (!isPhotoStillPresent(photo)) return
        const runId = photo._uploadRunId
        const isCurrentRunActive = () => (
          shouldContinue()
          && photo.uploadStatus === 'uploading'
          && photo._uploadRunId === runId
        )
        const result = await uploadPhoto(photo, isCurrentRunActive)
        if (!isPhotoStillPresent(photo)) return
        if (runId && photo._uploadRunId !== runId) return
        if (result.cancelled) return
        if (result.success) {
          photo._retryCount = 0
          photo.uploadStatus = 'done'
          delete photo.nextRetryAt
          delete photo.uploadError
          delete photo.uploadStartedAt
          delete photo._uploadRunId
          photo.fileId = result.fileId
          photo.fileName = result.fileName || photo.fileName || ''
          photo.filePath = result.filePath
          photo.fileExt = result.fileExt || photo.fileExt || ''
          photo.thumbnailPath = result.thumbnailPath
          photo.dataUrl = ''
          // 若服务端返回了更准确的文件类型（如 "video/mp4"），则更新本地记录，纠正部分因后缀缺失识别为 image 的媒体
          if (result.fileType) {
            photo.fileType = result.fileType
            if (result.fileType.startsWith('video/')) {
              photo.mediaType = 'video'
              photo.mimeType = result.fileType
            } else if (result.fileType.startsWith('image/')) {
              photo.mediaType = 'image'
              photo.mimeType = result.fileType
            }
          }
          uploadedPhotosToCleanup.push(photo)
          stateChanged = true
          uploaded++
          if (typeof onUploaded === 'function') try { onUploaded(photo) } catch {}
        } else {
          photo.uploadError = result.error
          delete photo.uploadStartedAt
          delete photo._uploadRunId
          if (result.retryable !== false) {
            photo.uploadStatus = 'retry_wait'
            photo.nextRetryAt = new Date(
              Number(now()) + getPhotoUploadRetryDelay(photo._retryCount || 1)
            ).toISOString()
            retryWaiting++
          } else {
            photo.uploadStatus = 'needs_attention'
            delete photo.nextRetryAt
            failed++
            needsAttention++
          }
          stateChanged = true
        }
      }

      await runMediaUploadPools({
        claimImage: () => mediaKind === 'video' ? null : claimNextUploadCandidate('image'),
        claimVideo: () => mediaKind === 'image' ? null : claimNextUploadCandidate('video'),
        uploadImage: uploadOne,
        uploadVideo: uploadOne,
        imageConcurrency: concurrency,
        videoConcurrency,
        shouldContinue
      })

      if (claimedThisRound === 0) break
      if (stateChanged) {
        try {
          await persistUploadedState()
          for (const photo of uploadedPhotosToCleanup) {
            await cleanupUploadedSource(photo)
          }
        } catch (error) {
          for (const photo of uploadedPhotosToCleanup) {
            photo.uploadError = `上传状态保存失败: ${error?.message || error}`
          }
          console.warn('保存上传状态失败，保留本地文件:', error)
        }
      }
    }

    return {
      uploaded,
      failed,
      retryWaiting,
      skipped,
      needsAttention,
      nextRetryAt: getNextPhotoUploadRetryAt(checklistData, defects)
    }
  }

  return doUpload()
}

export function resetPhotoForRetry(photo) {
  if (!photo || typeof photo !== 'object') return
  photo.uploadStatus = 'pending'
  photo.uploadError = ''
  photo._retryCount = 0
  delete photo.uploadStartedAt
  delete photo._uploadRunId
}
