import { post } from './request.js'
import { getApiBase } from '../utils/constants.js'

/**
 * 上传检查文件（清单图片或疵点图片）
 * @param {File|Blob} file - 文件对象
 * @param {object} params
 * @param {string} params.bizId - 业务ID（清单传测试项id，疵点传疵点id）
 * @param {string} params.bizType - 业务类型（checkResult | defect）
 * @param {string} [params.subGoodsNo] - 货号
 * @param {number} [params.sortNo] - 序号
 * @returns {Promise<any>}
 */
const UPLOAD_STALL_TIMEOUT_MS = 60000
const UPLOAD_FALLBACK_IMAGE_TIMEOUT_MS = 5 * 60 * 1000
const UPLOAD_FALLBACK_VIDEO_TIMEOUT_MS = 15 * 60 * 1000
const activeUploadAborters = new Set()

function createUploadError(message, httpStatus = 0) {
  const error = new Error(message)
  const normalizedStatus = Number(httpStatus || 0)
  if (normalizedStatus > 0) error.httpStatus = normalizedStatus
  return error
}

export function createUploadStallGuard({
  timeoutMs = UPLOAD_STALL_TIMEOUT_MS,
  startImmediately = true,
  onStall,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  let timer = null
  let lastLoaded = -1
  let started = false
  let stopped = false

  const reset = () => {
    if (stopped) return
    started = true
    if (timer !== null) clearTimeoutFn(timer)
    timer = setTimeoutFn(() => {
      timer = null
      onStall?.()
    }, timeoutMs)
  }

  if (startImmediately) reset()
  return {
    markProgress(loaded) {
      if (stopped) return
      const nextLoaded = Number(loaded || 0)
      if (!started && nextLoaded <= 0) return
      if (nextLoaded <= lastLoaded) return
      lastLoaded = nextLoaded
      reset()
    },
    clear() {
      stopped = true
      if (timer !== null) clearTimeoutFn(timer)
      timer = null
    }
  }
}

function inferVideoUpload(file, params = {}) {
  const mediaType = String(params.mediaType || '').toLowerCase()
  const mimeType = String(params.mimeType || '').toLowerCase()
  const filePath = String(file || '').toLowerCase()
  return mediaType === 'video'
    || mimeType.startsWith('video/')
    || /\.(mp4|mov|webm|avi|mkv|3gp|m4v)(?:$|[?#])/.test(filePath)
}

export function abortActiveInspectUploads() {
  for (const abortUpload of [...activeUploadAborters]) {
    try { abortUpload() } catch {}
  }
}

export async function uploadInspectFile(file, params = {}) {
  const isDingTalk = typeof dd !== 'undefined' && dd?.env?.platform && dd.env.platform !== 'notInDingTalk';
  const isVideo = inferVideoUpload(file, params)
  const canUseUniUploadPath = (
    typeof file === 'string' &&
    typeof uni !== 'undefined' &&
    typeof uni.uploadFile === 'function' &&
    (typeof plus !== 'undefined' || isDingTalk)
  )
  
  if (canUseUniUploadPath || (typeof file === 'string' && isDingTalk && typeof dd !== 'undefined' && typeof dd.uploadFile === 'function')) {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('access_token')
      const formData = {}
      if (params.bizId) formData.bizId = String(params.bizId)
      if (params.bizType) formData.bizType = String(params.bizType)
      if (params.subGoodsNo) formData.subGoodsNo = String(params.subGoodsNo)
      if (params.sortNo !== undefined && params.sortNo !== null) formData.sortNo = String(params.sortNo)
      if (params.thumbnailBase64) formData.thumbnailBase64 = String(params.thumbnailBase64)
      const header = token ? { Authorization: `Bearer ${token}` } : {}
      let settled = false
      let uploadTask = null
      let uploadGuard = null
      let uploadStartupTimer = null
      const abortUpload = () => {
        try { uploadTask?.abort?.() } catch {}
      }
      activeUploadAborters.add(abortUpload)
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        activeUploadAborters.delete(abortUpload)
        uploadGuard?.clear()
        if (uploadStartupTimer !== null) clearTimeout(uploadStartupTimer)
        uploadStartupTimer = null
        fn(value)
      }
      
      const uploadApi = (isDingTalk && typeof dd !== 'undefined' && typeof dd.uploadFile === 'function') ? dd : uni;
      
      uploadTask = uploadApi.uploadFile({
        url: `${getApiBase()}/api/inspect/file/upload`,
        filePath: file,
        fileName: 'file', // dd.uploadFile typically uses fileName instead of name
        name: 'file',
        fileType: isVideo ? 'video' : 'image',
        header,
        formData,
        success: (res) => {
          if (settled) return
          try {
            const parsed = JSON.parse(res?.data || '{}')
            if (res.statusCode >= 200 && res.statusCode < 300 && (parsed.code === undefined || parsed.code === 200 || parsed.code === 0)) {
              finish(resolve, parsed.data ?? parsed)
              return
            }
            finish(reject, createUploadError(
              parsed.message || `上传失败: ${res.statusCode}`,
              res.statusCode
            ))
          } catch (error) {
            finish(reject, error)
          }
        },
        fail: (error) => {
          if (settled) return
          finish(reject, error)
        }
      })
      if (settled) return
      const hasProgressEvents = typeof uploadTask?.onProgressUpdate === 'function'
      uploadGuard = createUploadStallGuard({
        timeoutMs: hasProgressEvents
          ? UPLOAD_STALL_TIMEOUT_MS
          : (isVideo ? UPLOAD_FALLBACK_VIDEO_TIMEOUT_MS : UPLOAD_FALLBACK_IMAGE_TIMEOUT_MS),
        startImmediately: !hasProgressEvents,
        onStall: () => {
          finish(reject, new Error('上传长时间无进度，请检查网络后重试'))
          abortUpload()
        }
      })
      if (hasProgressEvents) {
        uploadStartupTimer = setTimeout(() => {
          finish(reject, new Error('上传等待时间过长，请检查网络后重试'))
          abortUpload()
        }, isVideo ? UPLOAD_FALLBACK_VIDEO_TIMEOUT_MS : UPLOAD_FALLBACK_IMAGE_TIMEOUT_MS)
        uploadTask.onProgressUpdate((progress) => {
          const loaded = Number(progress?.totalBytesSent ?? progress?.progress ?? 0)
          if (loaded > 0 && uploadStartupTimer !== null) {
            clearTimeout(uploadStartupTimer)
            uploadStartupTimer = null
          }
          uploadGuard?.markProgress(loaded)
        })
      }
    })
  }

  const token = localStorage.getItem('access_token')

  const formData = new FormData()
  formData.append('file', file)
  if (params.bizId) formData.append('bizId', String(params.bizId))
  if (params.bizType) formData.append('bizType', String(params.bizType))
  if (params.subGoodsNo) formData.append('subGoodsNo', String(params.subGoodsNo))
  if (params.sortNo !== undefined && params.sortNo !== null) {
    formData.append('sortNo', String(params.sortNo))
  }
  if (params.thumbnailBase64) formData.append('thumbnailBase64', String(params.thumbnailBase64))
  if (params.cover instanceof Blob || params.cover instanceof File) {
    formData.append('cover', params.cover)
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    let uploadStartupTimer = null
    const abortUpload = () => xhr.abort()
    const uploadGuard = createUploadStallGuard({
      timeoutMs: UPLOAD_STALL_TIMEOUT_MS,
      startImmediately: false,
      onStall: () => {
        finish(reject, new Error('上传长时间无进度，请检查网络后重试'))
        abortUpload()
      }
    })
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      uploadGuard.clear()
      if (uploadStartupTimer !== null) clearTimeout(uploadStartupTimer)
      uploadStartupTimer = null
      activeUploadAborters.delete(abortUpload)
      fn(value)
    }

    activeUploadAborters.add(abortUpload)
    uploadStartupTimer = setTimeout(() => {
      finish(reject, new Error('上传等待时间过长，请检查网络后重试'))
      abortUpload()
    }, isVideo ? UPLOAD_FALLBACK_VIDEO_TIMEOUT_MS : UPLOAD_FALLBACK_IMAGE_TIMEOUT_MS)
    xhr.open('POST', `${getApiBase()}/api/inspect/file/upload`, true)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      const loaded = Number(event.loaded || 0)
      if (loaded > 0 && uploadStartupTimer !== null) {
        clearTimeout(uploadStartupTimer)
        uploadStartupTimer = null
      }
      uploadGuard.markProgress(loaded)
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}')
        if (xhr.status < 200 || xhr.status >= 300 || (data.code !== undefined && data.code !== 200 && data.code !== 0)) {
          finish(reject, createUploadError(
            data.message || `上传失败: ${xhr.status}`,
            xhr.status
          ))
          return
        }
        finish(resolve, data.data ?? data)
      } catch (error) {
        finish(reject, error)
      }
    }
    xhr.onerror = () => finish(reject, new Error('网络异常，上传失败'))
    xhr.onabort = () => finish(reject, new Error('上传已取消'))
    xhr.send(formData)
  })
}

/**
 * 生成并同步报告
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function generateReport(payload) {
  const response = await post('/api/reports/generate', payload)
  if (response?.success === false) {
    throw new Error(response.message || '云同步失败')
  }
  return response?.data ?? response
}

/**
 * 删除已上传的检查文件
 * @param {string} fileId - 服务端返回的文件 ID
 * @returns {Promise<any>}
 */
export async function deleteInspectFile(fileId) {
  const response = await post(`/api/inspect/file/delete/${fileId}`, {})
  if (response?.success === false) {
    throw new Error(response.message || '删除文件失败')
  }
  return response?.data ?? response
}

export async function sortInspectFiles(items) {
  const response = await post('/api/inspect/file/sort', { items })
  if (response?.success === false) {
    throw new Error(response.message || '文件排序失败')
  }
  return response?.data ?? response
}

export async function moveInspectFile(payload) {
  const response = await post('/api/inspect/file/move', payload)
  if (response?.success === false) {
    throw new Error(response.message || '移动文件失败')
  }
  return response?.data ?? response
}

/**
 * 解锁/重置验货任务
 * @param {string} planId
 * @param {0|1} reportDeleteFlag 0: 解锁（保留报告） 1: 重置（删除报告）
 * @returns {Promise<any>}
 */
export async function fetchFilePreviewBlob(fileId, { signal } = {}) {
  const token = localStorage.getItem('access_token')
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const resp = await fetch(
    `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(fileId))}/preview`,
    { method: 'GET', headers, signal }
  )

  if (!resp.ok) throw new Error(`预览文件失败: ${resp.status}`)
  return resp.blob()
}

export async function fetchReportPdfBlob(reportId, { signal } = {}) {
  const token = localStorage.getItem('access_token')
  const headers = { Accept: 'application/pdf' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const normalizedReportId = encodeURIComponent(String(reportId))
  const resp = await fetch(
    `${getApiBase()}/api/reports/${normalizedReportId}/pdf`,
    { method: 'GET', headers, signal }
  )
  if (!resp.ok) throw new Error(`下载报告失败: ${resp.status}`)
  return resp.blob()
}

export async function releaseReportTask(planId, reportDeleteFlag) {
  const response = await post(
    `/api/reports/generate/release/${planId}?reportDeleteFlag=${encodeURIComponent(reportDeleteFlag)}`,
    {}
  )

  if (response?.success === false) {
    throw new Error(response.message || '操作失败')
  }

  return response?.data ?? response
}
