import { request } from '../utils/http'
import { isOnline } from '../utils/network'
import { aesEncrypt } from '../utils/crypto'
import { clearUserSession, getLastUserSession, saveUserSession } from '../db/dao/userDao'
import { cleanupUnsubmittedDraftFiles } from './cleanupService'
import { t } from '../utils/i18n.js'

function deviceSeed() {
  // App端可替换为 plus.device.uuid
  return `${uni.getSystemInfoSync().platform || 'unknown'}:qarma`
}

function buildEncryptKey(token = '') {
  return `${token}:${deviceSeed()}`
}

export async function login({ userName, password, rememberPwd, autoLogin }) {
  const online = await isOnline()
  if (online) {
    const data = await request({
      url: '/api/auth/login',
      method: 'POST',
      data: {
        username: userName,
        password,
        loginType: 'username'
      }
    })
    const token = data.accessToken || data.token
    const expireAt = new Date(Date.now() + Number(data.expiresIn || 7200) * 1000).toISOString()
    const session = {
      userId: String(data.userId || userName),
      userName: data.username || userName,
      token,
      refreshToken: data.refreshToken || '',
      role: Array.isArray(data.roles) ? data.roles.join(',') : (data.role || 'inspector'),
      expireAt,
      encryptedPassword: rememberPwd ? aesEncrypt(password, buildEncryptKey(token)) : '',
      rememberPwd,
      autoLogin
    }
    await saveUserSession(session)
    return session
  }

  const localSession = await getLastUserSession()
  if (!localSession?.token) {
    throw new Error(t('当前无网络且无可用离线身份，请联网登录一次'))
  }
  return localSession
}

export function registerVendor(data) {
  return request({
    url: '/api/users/register/vendor',
    method: 'POST',
    data
  })
}

export async function refreshTokenIfOnline() {
  const online = await isOnline()
  if (!online) return
  const localSession = await getLastUserSession()
  if (!localSession?.token) return
  try {
    const data = await request({
      url: '/api/auth/refresh',
      method: 'POST',
      query: { refreshToken: localSession.refreshToken || localSession.token }
    })
    const nextToken = typeof data === 'string' ? data : (data.accessToken || data.token)
    await saveUserSession({ ...localSession, token: nextToken })
  } catch (error) {
    console.warn('silent refresh failed', error)
  }
}

export async function logout() {
  await cleanupUnsubmittedDraftFiles()
  await clearUserSession()
  uni.clearStorageSync()
}
