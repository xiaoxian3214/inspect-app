/**
 * HTTP 请求封装
 */
import { getApiBase } from '../utils/constants.js'
import { getLocale } from '../utils/i18n.js'

let authRedirecting = false
let dingtalkReloginPromise = null
let dingtalkSdkModulePromise = null
const DEFAULT_DINGTALK_CORP_ID = 'ding241db50c7e99d7d1'

function getGlobalLanguage() {
  try {
    return getLocale() || 'zh'
  } catch {
    return 'zh'
  }
}

function appendLanguageQuery(url, language) {
  if (!language || /(?:\?|&)language=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}language=${encodeURIComponent(language)}`
}

function isInDingTalkEnv() {
  try {
    const globalDd = typeof globalThis !== 'undefined' ? globalThis.dd : null
    const windowDd = typeof window !== 'undefined' ? window.dd : null
    const dd = globalDd || windowDd
    if (dd?.env?.platform && dd.env.platform !== 'notInDingTalk') return true

    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
    if (/DingTalk/i.test(ua)) return true
  } catch {}
  return false
}

function isAuthApi(url = '') {
  return /\/api\/auth\/(login|dingtalk-login|refresh)(?:\?|$)/.test(url)
}

function isMissingTokenResponse(data = null) {
  if (!data || typeof data !== 'object') return false
  const code = Number(data.code)
  const message = String(data.message || '')
  return (code === 400 && (message.includes('未提供访问令牌') || message.includes('请先登录') || message.includes('Token无效或已过期'))) || code === 401
}

function clearAuthStorage() {
  try {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_info')
  } catch {}
  try {
    if (typeof uni !== 'undefined' && typeof uni.removeStorageSync === 'function') {
      uni.removeStorageSync('access_token')
      uni.removeStorageSync('refresh_token')
      uni.removeStorageSync('user_info')
    }
  } catch {}
}

async function getImportedDingTalkSdk() {
  if (typeof window === 'undefined' && typeof globalThis === 'undefined') return null
  if (!dingtalkSdkModulePromise) {
    dingtalkSdkModulePromise = import('dingtalk-jsapi').catch(() => null)
  }
  const mod = await dingtalkSdkModulePromise
  const candidate = mod?.default || mod
  if (!candidate || typeof candidate !== 'object') return null
  if (typeof candidate.ready === 'function' || candidate.runtime || typeof candidate.getAuthCode === 'function') {
    return candidate
  }
  return null
}

async function getDingTalkSdk() {
  const importedDd = await getImportedDingTalkSdk()
  if (importedDd) return importedDd
  if (typeof window !== 'undefined' && window.dd) return window.dd
  if (typeof globalThis !== 'undefined' && globalThis.dd) return globalThis.dd
  return null
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForDingTalkSdk(options = {}) {
  const { timeoutMs = 8000, intervalMs = 120 } = options
  const start = Date.now()
  while (Date.now() - start <= timeoutMs) {
    const dd = await getDingTalkSdk()
    if (dd && (typeof dd.ready === 'function' || dd.runtime || typeof dd.getAuthCode === 'function')) {
      return dd
    }
    await wait(intervalMs)
  }
  return null
}

function getDingTalkCorpId() {
  try {
    const fromGlobal = String(globalThis?.__DINGTALK_CORP_ID__ || '').trim()
    if (fromGlobal) return fromGlobal

    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      const fromUni = String(uni.getStorageSync('dingtalk_corp_id') || uni.getStorageSync('DINGTALK_CORP_ID') || '').trim()
      if (fromUni) return fromUni
    }

    if (typeof localStorage !== 'undefined') {
      const fromStorage = String(localStorage.getItem('dingtalk_corp_id') || localStorage.getItem('DINGTALK_CORP_ID') || '').trim()
      if (fromStorage) return fromStorage
    }

    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search || '')
      const fromQuery = String(query.get('corpId') || query.get('corp_id') || '').trim()
      if (fromQuery) return fromQuery
    }
  } catch {}
  return DEFAULT_DINGTALK_CORP_ID
}

async function requestDingTalkAuthCode() {
  const dd = await waitForDingTalkSdk()
  if (!dd) {
    throw new Error('未检测到钉钉运行环境（SDK 未就绪）')
  }

  return new Promise((resolve, reject) => {
    const corpId = getDingTalkCorpId()
    let settled = false

    const done = (error, code) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(code)
    }

    const timeoutId = setTimeout(() => {
      done(new Error('获取钉钉授权码超时，请稍后重试'))
    }, 15000)

    const finish = (error, code) => {
      clearTimeout(timeoutId)
      done(error, code)
    }

    const requestCode = () => {
      if (dd.runtime?.permission?.requestAuthCode) {
        if (!corpId) {
          finish(new Error('缺少钉钉 corpId，无法免登录'))
          return
        }
        dd.runtime.permission.requestAuthCode({
          corpId,
          onSuccess: ({ code }) => finish(null, code),
          onFail: (err) => finish(new Error(err?.errorMessage || '获取钉钉授权码失败'))
        })
        return
      }

      if (typeof dd.getAuthCode === 'function') {
        dd.getAuthCode({
          success: ({ authCode, code }) => finish(null, authCode || code),
          fail: (err) => finish(new Error(err?.errorMessage || '获取钉钉授权码失败'))
        })
        return
      }

      finish(new Error('当前钉钉容器不支持免登录能力'))
    }

    if (typeof dd.error === 'function') {
      dd.error((err) => {
        finish(new Error(err?.errorMessage || '钉钉JSAPI初始化失败'))
      })
    }

    if (typeof dd.ready === 'function') {
      dd.ready(requestCode)
      return
    }

    requestCode()
  })
}

function persistDingTalkSession(loginData) {
  const normalizedUserName = loginData.userName || loginData.username || ''
  const accessToken = loginData.accessToken || loginData.token || ''
  if (!accessToken) {
    throw new Error('钉钉免登录失败')
  }

  const userInfo = {
    userId: loginData.userId || loginData.employeeNo || '',
    userName: normalizedUserName,
    username: normalizedUserName,
    realName: loginData.realName || normalizedUserName,
    employeeNo: loginData.employeeNo,
    roles: loginData.roles || [],
    permissions: loginData.permissions || [],
    department: loginData.department,
    email: loginData.email,
    phone: loginData.phone,
    userType: loginData.userType
  }

  localStorage.setItem('access_token', accessToken)
  localStorage.setItem('refresh_token', loginData.refreshToken || '')
  localStorage.setItem('user_info', JSON.stringify(userInfo))
}

async function silentDingTalkRelogin(language) {
  const authCode = await requestDingTalkAuthCode()
  if (!authCode) {
    throw new Error('未获取到钉钉授权码')
  }

  const loginUrl = appendLanguageQuery(`${getApiBase()}/api/auth/dingtalk-login?authCode=${encodeURIComponent(authCode)}`, language)
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': language
    }
  })

  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    throw new Error(result?.message || `HTTP Error: ${response.status}`)
  }
  if (!result?.success || !result?.data) {
    throw new Error(result?.message || '钉钉免登录失败')
  }

  persistDingTalkSession(result.data)
}

async function ensureDingTalkRelogin(language) {
  if (!dingtalkReloginPromise) {
    dingtalkReloginPromise = silentDingTalkRelogin(language).finally(() => {
      dingtalkReloginPromise = null
    })
  }
  return dingtalkReloginPromise
}

async function handleAuthFailure({ url, language, options, fallbackMessage }) {
  clearAuthStorage()

  if (isAuthApi(url)) {
    throw new Error(fallbackMessage)
  }

  const inDingTalk = isInDingTalkEnv()
  if (inDingTalk && !options.__retriedAfterDingTalkRelogin) {
    try {
      await ensureDingTalkRelogin(language)
      return request(url, { ...options, __retriedAfterDingTalkRelogin: true })
    } catch {
      redirectToLogin()
      throw new Error('钉钉免登录失败，请重新登录')
    }
  }

  redirectToLogin()

  throw new Error(inDingTalk ? '钉钉免登录失败，请重新登录' : fallbackMessage)
}

function redirectToLogin() {
  if (authRedirecting) return
  authRedirecting = true
  try {
    uni.reLaunch({
      url: '/pages/login/login',
      complete: () => {
        setTimeout(() => {
          authRedirecting = false
        }, 800)
      }
    })
  } catch {
    authRedirecting = false
  }
}

/**
 * 发起 HTTP 请求
 * @param {string} url - 请求路径
 * @param {object} options - 请求配置
 * @returns {Promise}
 */
export async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 30000,
    __retriedAfterDingTalkRelogin = false
  } = options
  const language = getGlobalLanguage()

  // 构建完整 URL
  const baseUrl = url.startsWith('http') ? url : `${getApiBase()}${url}`
  const fullUrl = appendLanguageQuery(baseUrl, language)

  // 从 localStorage 获取 token
  const token = localStorage.getItem('access_token')

  // 构建请求头
  const requestHeaders = {
    'Content-Type': 'application/json',
    'Accept-Language': language,
    ...headers
  }

  // 如果有 token，添加到请求头
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`
  }

  // 构建请求配置
  const fetchOptions = {
    method,
    headers: requestHeaders
  }

  // 如果有请求体，添加到配置中
  if (body) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  try {
    // 创建超时控制器
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // 发起请求
    const response = await fetch(fullUrl, {
      ...fetchOptions,
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    // 解析响应
    const contentType = response.headers.get('content-type')
    let data

    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    // 检查响应状态
    if (!response.ok) {
      if (response.status === 401) {
        return handleAuthFailure({ url, language, options, fallbackMessage: '登录已过期，请重新登录' })
      }
      throw new Error(data.message || `HTTP Error: ${response.status}`)
    }

    // 检查业务状态码
    if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
      if (isMissingTokenResponse(data)) {
        return handleAuthFailure({ url, language, options, fallbackMessage: '登录已失效，请重新登录' })
      }
      throw new Error(data.message || '请求失败')
    }

    // 返回数据（为了兼容现有的 response.success 判断，这里自动加上 success 字段）
    if (typeof data === 'object' && data !== null) {
      data.success = (data.code === 200 || data.code === 0 || data.success === true)
    }

    return data

  } catch (error) {
    // 处理超时错误
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }

    // 处理网络错误
    if (error.message === 'Failed to fetch') {
      throw new Error('网络连接失败，请检查网络设置')
    }

    throw error
  }
}

/**
 * GET 请求
 */
export function get(url, params = {}, options = {}) {
  // 构建查询字符串
  const queryString = Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')

  const fullUrl = queryString ? `${url}?${queryString}` : url

  return request(fullUrl, { ...options, method: 'GET' })
}

/**
 * POST 请求
 */
export function post(url, data = {}, options = {}) {
  return request(url, {
    ...options,
    method: 'POST',
    body: data
  })
}

/**
 * PUT 请求
 */
export function put(url, data = {}, options = {}) {
  return request(url, {
    ...options,
    method: 'PUT',
    body: data
  })
}

/**
 * DELETE 请求
 */
export function del(url, options = {}) {
  return request(url, {
    ...options,
    method: 'DELETE'
  })
}
