import { request } from '../utils/http'
import { getCachedSession } from '../db/dao/userDao'
import { toAbsolutePath } from '../utils/file'
import { API_BASE, UPLOAD_CONFIG, PHOTO_UPLOAD_STATUS } from '../utils/constants'
import { updatePhotoUploadStatus } from '../db/dao/photoDao'
import { t } from '../utils/i18n.js'

function parseUploadResult(data) {
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return { raw: data }
    }
  }
  return data
}

function readFileAsBase64(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || !plus.io) {
      reject(new Error(t('当前环境不支持分片读取')))
      return
    }
    plus.io.resolveLocalFileSystemURL(
      filePath,
      (entry) => {
        entry.file((file) => {
          const reader = new plus.io.FileReader()
          reader.onloadend = (e) => {
            const result = e.target.result || ''
            const base64 = String(result).split(',')[1] || ''
            resolve(base64)
          }
          reader.onerror = () => reject(new Error(t('读取文件失败')))
          reader.readAsDataURL(file)
        }, reject)
      },
      reject
    )
  })
}

async function uploadByChunk(photo, options = {}) {
  const absolutePath = toAbsolutePath(photo.localPath)
  const base64 = await readFileAsBase64(absolutePath)
  const chunkChars = Math.max(1, Math.floor((options.chunkSize || UPLOAD_CONFIG.CHUNK_SIZE) * 1.34))
  const chunks = []
  for (let offset = 0; offset < base64.length; offset += chunkChars) {
    chunks.push(base64.slice(offset, offset + chunkChars))
  }

  let skipUpload = false
  try {
    const checkResult = await request({
      url: UPLOAD_CONFIG.CHUNK_CHECK_ENDPOINT,
      method: 'POST',
      data: {
        md5: photo.md5,
        fileName: options.fileName || `${photo.photoId}.jpg`,
        totalChunks: chunks.length,
        reportId: photo.reportId
      }
    })
    skipUpload = !!(checkResult?.exists || checkResult === true)
  } catch {
    skipUpload = false
  }

  if (!skipUpload) {
    for (let idx = 0; idx < chunks.length; idx += 1) {
      await request({
        url: UPLOAD_CONFIG.CHUNK_UPLOAD_ENDPOINT,
        method: 'POST',
        data: {
          md5: photo.md5,
          fileName: options.fileName || `${photo.photoId}.jpg`,
          chunkIndex: idx,
          totalChunks: chunks.length,
          chunkData: chunks[idx],
          reportId: photo.reportId
        }
      })
    }
  }

  return request({
    url: UPLOAD_CONFIG.CHUNK_MERGE_ENDPOINT,
    method: 'POST',
    data: {
      md5: photo.md5,
      fileName: options.fileName || `${photo.photoId}.jpg`,
      totalChunks: chunks.length,
      reportId: photo.reportId
    }
  })
}

async function uploadByDirectFile(photo, options = {}) {
  const absolutePath = toAbsolutePath(photo.localPath)
  const session = getCachedSession()
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${UPLOAD_CONFIG.DIRECT_UPLOAD_ENDPOINT.startsWith('http') ? UPLOAD_CONFIG.DIRECT_UPLOAD_ENDPOINT : `${options.apiBase || API_BASE}${UPLOAD_CONFIG.DIRECT_UPLOAD_ENDPOINT}`}`,
      filePath: absolutePath,
      name: 'file',
      formData: {
        itemResultId: options.itemResultId || photo.defectId || '',
        subGoodsNo: options.subGoodsNo || '',
        sortNo: options.sortNo || 0
      },
      header: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      success: (res) => {
        const body = parseUploadResult(res.data)
        if (body?.success === false) {
          reject(new Error(body.message || t('上传失败')))
          return
        }
        resolve(body)
      },
      fail: (error) => reject(error)
    })
  })
}

function isVideoFile(photo) {
  if (photo.mediaType === 'video') return true
  const path = String(photo.localPath || '').toLowerCase()
  return /\.(mp4|mov|webm|avi|mkv|3gp)$/.test(path)
}

export async function uploadOnePhoto(photo, options = {}) {
  if (isVideoFile(photo)) {
    const result = await uploadByDirectFile(photo, options)
    await updatePhotoUploadStatus(photo.photoId, PHOTO_UPLOAD_STATUS.UPLOADED)
    return result
  }
  try {
    const result = await uploadByChunk(photo, options)
    await updatePhotoUploadStatus(photo.photoId, PHOTO_UPLOAD_STATUS.UPLOADED)
    return result
  } catch (error) {
    const result = await uploadByDirectFile(photo, options)
    await updatePhotoUploadStatus(photo.photoId, PHOTO_UPLOAD_STATUS.UPLOADED)
    return result
  }
}

export async function uploadPhotosForReport(photos = [], options = {}) {
  const uploaded = []
  for (const photo of photos) {
    try {
      const result = await uploadOnePhoto(photo, options)
      uploaded.push({ photoId: photo.photoId, ok: true, result })
    } catch (error) {
      await updatePhotoUploadStatus(photo.photoId, PHOTO_UPLOAD_STATUS.FAILED)
      uploaded.push({ photoId: photo.photoId, ok: false, message: error.message })
    }
  }
  return uploaded
}
