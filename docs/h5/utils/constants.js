import { t } from './i18n.js'

export const API_BASE_LOCAL = 'https://inspect.letright.com.cn/qcm'
// export const API_BASE_LOCAL = 'https://inspecttest.letright.com.cn/qcm'
// export const API_BASE_LOCAL = 'http://hunk:7260/qcm'
// export const API_BASE_LOCAL = 'http://192.168.103.154:7260/qcm'

export const API_BASE_TEST = 'https://inspect.letright.com.cn/qcm'
// export const API_BASE_TEST = 'https://inspecttest.letright.com.cn/qcm'
export const API_BASE_STORAGE_KEY = 'api_base_url'


function normalizeApiBase(url) {
  const text = String(url || '').trim()
  if (!text) return ''
  return text.replace(/\/+$/, '')
}


export function getApiBase() {
  try {
    let customBase = ''
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      customBase = uni.getStorageSync(API_BASE_STORAGE_KEY) || ''
    } else if (typeof localStorage !== 'undefined') {
      customBase = localStorage.getItem(API_BASE_STORAGE_KEY) || ''
    }
    const normalizedCustom = normalizeApiBase(customBase)
    if (normalizedCustom) return normalizedCustom
  } catch {
    // ignore storage read errors
  }
  return API_BASE_LOCAL
}

export function setApiBase(url) {
  const normalized = normalizeApiBase(url)
  if (!normalized) throw new Error(t('API base URL 不能为空'))
  if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function') {
    uni.setStorageSync(API_BASE_STORAGE_KEY, normalized)
    return
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(API_BASE_STORAGE_KEY, normalized)
    return
  }
  throw new Error(t('当前环境不支持持久化 API 地址'))
}

export function resetApiBase() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.removeStorageSync === 'function') {
      uni.removeStorageSync(API_BASE_STORAGE_KEY)
      return
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(API_BASE_STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}

// 保持兼容旧代码引用
export const API_BASE = API_BASE_LOCAL
export const API_TIMEOUT = 30000

export const REPORT_STATUS = {
  NEW: 0,
  DRAFT: 1,
  SUBMITTED: 3,
  ERROR: -1
}

export const PHOTO_UPLOAD_STATUS = {
  PENDING: 'pending',
  UPLOADED: 'uploaded',
  FAILED: 'failed'
}

export const BASE_IMAGE_DIR = '_doc/qarma_images'

export const UPLOAD_CONFIG = {
  CHUNK_SIZE: 200 * 1024,
  CHUNK_CHECK_ENDPOINT: '/upload/chunk/check',
  CHUNK_UPLOAD_ENDPOINT: '/upload/chunk',
  CHUNK_MERGE_ENDPOINT: '/upload/chunk/merge',
  DIRECT_UPLOAD_ENDPOINT: '/api/inspect/file/upload'
}
