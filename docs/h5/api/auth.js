/**
 * 认证相关 API
 */
import { post } from './request.js'

/**
 * 用户登录
 * @param {object} loginData - 登录数据
 * @param {string} loginData.userId - 用户工号（必填）
 * @param {string} loginData.password - 密码（必填）
 * @returns {Promise<LoginResponse>}
 */
export async function login(loginData) {
  const response = await post('/api/auth/login', loginData)

  // 返回的数据结构：{ code, message, data: { accessToken, userId, ... }, success }
  if (response.success && response.data) {
    return response.data
  }

  throw new Error(response.message || '登录失败')
}

/**
 * 钉钉免登录
 * @param {string} authCode - 钉钉授权码
 * @returns {Promise<LoginResponse>}
 */
export async function dingtalkLogin(authCode) {
  const code = String(authCode || '').trim()
  const response = await post(`/api/auth/dingtalk-login?authCode=${encodeURIComponent(code)}`, null)

  if (response.success && response.data) {
    return response.data
  }

  throw new Error(response.message || '钉钉免登录失败')
}

/**
 * 用户登出
 */
export async function logout() {
  // 清除本地存储的 token
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_info')
}

/**
 * 获取当前用户信息
 */
export function getCurrentUser() {
  const userInfo = localStorage.getItem('user_info')
  return userInfo ? JSON.parse(userInfo) : null
}

/**
 * 检查是否已登录
 */
export function isLoggedIn() {
  const token = localStorage.getItem('access_token')
  return !!token
}
