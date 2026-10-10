import { API_BASE, API_TIMEOUT } from './constants'
import { getCachedSession } from '../db/dao/userDao'
import { getLocale, t } from './i18n.js'

function getGlobalLanguage() {
  try {
    return getLocale() || 'zh'
  } catch {
    return 'zh'
  }
}

function buildQueryString(params = {}) {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  return pairs.length ? `?${pairs.join('&')}` : ''
}

function unwrapResponse(body) {
  if (!body || typeof body !== 'object') return body
  if ('success' in body || 'code' in body) {
    const ok = body.success !== false && (body.code === undefined || Number(body.code) === 200)
    if (!ok) {
      throw new Error(body.message || t('接口调用失败'))
    }
    return body.data
  }
  return body
}

export function request({ url, method = 'GET', data = {}, query = {}, header = {} }) {
  return new Promise((resolve, reject) => {
    const session = getCachedSession()
    const language = getGlobalLanguage()
    const mergedQuery = {
      language,
      ...query
    }
    const headers = {
      'Content-Type': 'application/json',
      'Accept-Language': language,
      ...header
    }
    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`
    }

    uni.request({
      url: `${API_BASE}${url}${buildQueryString(mergedQuery)}`,
      method,
      data,
      timeout: API_TIMEOUT,
      header: headers,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(unwrapResponse(res.data))
          } catch (error) {
            reject(error)
          }
          return
        }
        reject(new Error(res.data?.message || `HTTP ${res.statusCode}`))
      },
      fail: reject
    })
  })
}
