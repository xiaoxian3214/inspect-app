<template>
  <view class="page">
    <LanguageSwitcher />

    <view class="brand">
      <text class="brand-title">{{ t('验货系统') }}</text>
    </view>

    <view v-if="booting" class="boot-screen">
      <text class="boot-title">{{ t('验货系统') }}</text>
      <text class="boot-sub">{{ t('正在连接钉钉，请稍候') }}</text>
      <view class="boot-dots">
        <text class="dot dot-1"></text>
        <text class="dot dot-2"></text>
        <text class="dot dot-3"></text>
      </view>
    </view>

    <view v-else class="card">
      <view class="form-item">
        <text class="label">{{ t('用户名') }}</text>
        <input
          v-model="form.userName"
          class="input"
          :placeholder="t('请输入用户名')"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('密码') }}</text>
        <input
          v-model="form.password"
          class="input"
          type="password"
          :placeholder="t('请输入密码')"
        />
      </view>

      <view class="option-row">
        <view class="check" @click="toggleRememberPwd">
          <checkbox :checked="form.rememberPwd" color="#00b050" />
          <text>{{ t('记住密码') }}</text>
        </view>
      </view>

      <view class="link-row">
        <text class="link" @click="handleForgetPwd">{{ t('忘记密码？') }}</text>
      </view>

      <AppButton class="login-btn" @click="doLogin" :disabled="loading">
        {{ loading ? t('登录中...') : t('登录') }}
      </AppButton>
    </view>
  </view>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import * as dingtalkJsApi from 'dingtalk-jsapi'
import { useAuthStore } from '../../store/auth.js'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../utils/i18n.js'
import { shouldFastEnterApp, shouldShowLoginFallback } from '../../utils/startupState.js'

const authStore = useAuthStore()
const { t } = useI18n()

const form = reactive({
  userName: '', // 默认填充测试工号
  password: '', // 默认填充测试密码
  rememberPwd: true
})

const loading = ref(false)
const booting = ref(true)
const dingtalkAutoLoginTried = ref(false)
const LOGIN_PREFS_KEY = 'login_prefs_v1'
const DEFAULT_DINGTALK_CORP_ID = 'ding241db50c7e99d7d1'
let _vConsoleInited = false

function getLocalStorageSafe(key) {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      return uni.getStorageSync(key)
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key)
    }
  } catch (error) {
    console.warn('读取本地登录偏好失败:', error)
  }
  return ''
}

function setLocalStorageSafe(key, value) {
  try {
    if (typeof uni !== 'undefined' && typeof uni.setStorageSync === 'function') {
      uni.setStorageSync(key, value)
      return
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
  } catch (error) {
    console.warn('写入本地登录偏好失败:', error)
  }
}

function saveLoginPrefs() {
  const rememberPwd = !!form.rememberPwd
  const payload = {
    userName: form.userName || '',
    password: rememberPwd ? (form.password || '') : '',
    rememberPwd
  }
  setLocalStorageSafe(LOGIN_PREFS_KEY, payload)
}

function restoreLoginPrefs() {
  const raw = getLocalStorageSafe(LOGIN_PREFS_KEY)
  if (!raw) return
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      parsed = null
    }
  }
  if (!parsed || typeof parsed !== 'object') return
  form.userName = parsed.userName || ''
  form.rememberPwd = parsed.rememberPwd !== false
  form.password = form.rememberPwd ? (parsed.password || '') : ''
}

function handleForgetPwd() {
  globalThis.showToast(t('忘记密码功能待接入'))
}

function handleOAuth(type) {
  globalThis.showToast(t('{type}登录待接入', { type }))
}

function toggleRememberPwd() {
  form.rememberPwd = !form.rememberPwd
  if (!form.rememberPwd) {
    form.password = ''
  }
  saveLoginPrefs()
}

function shouldEnableVConsole() {
  const envFlag = String(import.meta.env.VITE_ENABLE_VCONSOLE || '').toLowerCase()
  if (envFlag === 'true' || envFlag === '1') return true
  if (envFlag === 'false' || envFlag === '0') return false
  return !!import.meta.env.DEV
}

async function setupVConsoleIfNeeded() {
  if (_vConsoleInited) return
  if (!shouldEnableVConsole()) return
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  _vConsoleInited = true
  try {
    const mod = await import('vconsole')
    const VConsole = mod?.default
    if (typeof VConsole === 'function') {
      new VConsole()
      console.log('[ding-login] vConsole initialized')
    }
  } catch (error) {
    console.warn('[ding-login] vConsole init failed:', error)
  }
}

function logDingTalkDebug(label, payload = {}) {
  try {
    console.log(`[ding-login] ${label}`, payload)
  } catch {}
}

function isInDingTalk() {
  try {
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
    const isDingTalkUa = /DingTalk/i.test(ua)
    if (!isDingTalkUa) return false
    // dingtalk-jsapi 可能在非钉钉环境也被成功导入，因此不能作为环境判断依据
    return true
  } catch {
    return false
  }
}

function getImportedDingTalkSdk() {
  const candidate = dingtalkJsApi?.default || dingtalkJsApi
  if (!candidate || typeof candidate !== 'object') return null
  if (typeof candidate.ready === 'function' || candidate.runtime || typeof candidate.getAuthCode === 'function') {
    return candidate
  }
  return null
}

function getDingTalkSdk() {
  const importedDd = getImportedDingTalkSdk()
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
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
  logDingTalkDebug('wait sdk start', {
    timeoutMs,
    intervalMs,
    hasImportedDd: !!getImportedDingTalkSdk(),
    hasWindowDd: typeof window !== 'undefined' && !!window.dd,
    hasGlobalDd: typeof globalThis !== 'undefined' && !!globalThis.dd,
    isDingTalkUa: /DingTalk/i.test(ua)
  })
  while (Date.now() - start <= timeoutMs) {
    const dd = getDingTalkSdk()
    if (dd && (typeof dd.ready === 'function' || dd.runtime || typeof dd.getAuthCode === 'function')) {
      logDingTalkDebug('wait sdk ready', {
        elapsedMs: Date.now() - start,
        hasReady: typeof dd.ready === 'function',
        hasRuntime: !!dd.runtime,
        hasGetAuthCode: typeof dd.getAuthCode === 'function'
      })
      return dd
    }
    await wait(intervalMs)
  }
  logDingTalkDebug('wait sdk timeout', { elapsedMs: Date.now() - start })
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
  const importedDd = getImportedDingTalkSdk()
  const winDd = (typeof window !== 'undefined') ? window.dd : undefined
  const globalDd = (typeof globalThis !== 'undefined') ? globalThis.dd : undefined
  console.log('[ding-login] dd snapshot before wait', { importedDd, winDd, globalDd })
  const dd = await waitForDingTalkSdk()
  console.log('[ding-login] dd after waitForDingTalkSdk', dd)
  if (!dd) {
    throw new Error(t('未检测到钉钉运行环境（SDK 未就绪）'))
  }

  return new Promise((resolve, reject) => {
    const corpId = getDingTalkCorpId()
    logDingTalkDebug('request auth code', {
      corpId,
      hasRuntimePermission: !!dd.runtime?.permission?.requestAuthCode,
      hasGetAuthCode: typeof dd.getAuthCode === 'function'
    })
    let settled = false
    const done = (error, code) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(code)
    }

    const timeoutId = setTimeout(() => {
      done(new Error(t('获取钉钉授权码超时，请稍后重试')))
    }, 15000)

    const finish = (error, code) => {
      clearTimeout(timeoutId)
      done(error, code)
    }

    const requestCode = () => {
      if (dd.runtime?.permission?.requestAuthCode) {
        if (!corpId) {
          finish(new Error(t('缺少钉钉 corpId，无法免登录')))
          return
        }
        dd.runtime.permission.requestAuthCode({
          corpId,
          onSuccess: ({ code }) => {
            logDingTalkDebug('requestAuthCode success', { hasCode: !!code })
            finish(null, code)
          },
          onFail: (err) => finish(new Error(err?.errorMessage || t('获取钉钉授权码失败')))
        })
        return
      }
      if (typeof dd.getAuthCode === 'function') {
        dd.getAuthCode({
          success: ({ authCode, code }) => {
            const finalCode = authCode || code
            console.log('[ding-login] dd.getAuthCode raw', { authCode, code, finalCode })
            logDingTalkDebug('getAuthCode success', { hasCode: !!finalCode })
            finish(null, finalCode)
          },
          fail: (err) => finish(new Error(err?.errorMessage || t('获取钉钉授权码失败')))
        })
        return
      }
      finish(new Error(t('当前钉钉容器不支持免登录能力')))
    }

    if (typeof dd.error === 'function') {
      dd.error((err) => {
        finish(new Error(err?.errorMessage || t('钉钉JSAPI初始化失败')))
      })
    }

    if (typeof dd.ready === 'function') {
      dd.ready(requestCode)
      return
    }

    requestCode()
  })
}

async function tryDingTalkAutoLogin() {
  if (dingtalkAutoLoginTried.value) return
  if (shouldFastEnterApp(authStore)) {
    uni.reLaunch({
      url: '/pages/report/list'
    })
    return
  }
  if (!isInDingTalk()) {
    booting.value = false
    return
  }
  dingtalkAutoLoginTried.value = true
  loading.value = true
  let redirected = false
  let loginError = null
  try {
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
    logDingTalkDebug('auto login start', {
      ua,
      hasImportedDd: !!getImportedDingTalkSdk(),
      hasWindowDd: typeof window !== 'undefined' && !!window.dd,
      hasGlobalDd: typeof globalThis !== 'undefined' && !!globalThis.dd
    })
    const authCode = await requestDingTalkAuthCode()
    console.log('[ding-login] authCode value', authCode)
    if (!authCode) throw new Error(t('未获取到钉钉授权码'))
    await authStore.dingtalkLogin(authCode)
    redirected = true
    uni.reLaunch({
      url: '/pages/report/list'
    })
  } catch (error) {
    loginError = error
    console.error('钉钉免登录失败:', error)
    globalThis.showToast(error.message || t('钉钉免登录失败，请使用账号密码登录'))
  } finally {
    loading.value = false
    if (shouldShowLoginFallback({ isInDingTalk: isInDingTalk(), redirected, error: loginError })) {
      booting.value = false
    }
  }
}

async function doLogin() {
  // 基本验证
  if (!form.userName || !form.password) {
    globalThis.showToast(t('请输入工号与密码'))
    return
  }

  loading.value = true

  try {
    // 使用 userId 和 password 登录
    const loginData = {
      userName: form.userName,
      password: form.password
    }

    // 调用登录 API
    const response = await authStore.login(loginData)
    saveLoginPrefs()

    // 显示欢迎信息
    const userName = response.realName || response.userName || response.username || form.userName
    globalThis.showToast(t('欢迎回来，{name}！', { name: userName }))

    // 跳转到报告列表页（重定向，避免返回登录页）
    uni.reLaunch({
      url: '/pages/report/list'
    })

  } catch (error) {
    console.error('登录失败:', error)
    globalThis.showToast(error.message || t('登录失败，请检查工号和密码'))
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await setupVConsoleIfNeeded()
  restoreLoginPrefs()
  await tryDingTalkAutoLogin()
  if (booting.value && !isInDingTalk()) {
    booting.value = false
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  background: linear-gradient(180deg, #00b050, #009245);
  padding: 160rpx 72rpx 80rpx;
}

.brand {
  text-align: center;
  color: #fff;
  margin-bottom: 80rpx;
}

.brand-icon {
  width: 180rpx;
  height: 180rpx;
  border-radius: 48rpx;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 auto 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 88rpx;
  font-weight: 700;
}

.brand-title {
  font-size: 84rpx;
  font-weight: 700;
  display: block;
}

.brand-sub {
  font-size: 28rpx;
  opacity: 0.85;
  margin-top: 16rpx;
  display: block;
}

.card {
  background: #fff;
  border-radius: 48rpx;
  padding: 56rpx;
  box-shadow: 0 24rpx 80rpx rgba(0, 0, 0, 0.15);
}

.boot-screen {
  min-height: 380rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.boot-logo {
  width: 120rpx;
  height: 120rpx;
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 60rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 30rpx rgba(0, 0, 0, 0.12);
  animation: bootPulse 1.8s ease-in-out infinite;
}

.boot-title {
  margin-top: 24rpx;
  font-size: 44rpx;
  color: #fff;
  font-weight: 600;
}

.boot-text {
  font-size: 30rpx;
  color: rgba(255, 255, 255, 0.9);
}

.boot-sub {
  margin-top: 12rpx;
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.82);
}

.boot-dots {
  margin-top: 28rpx;
  display: flex;
  gap: 14rpx;
}

.dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  display: inline-block;
  animation: dotFade 1.2s infinite ease-in-out;
}

.dot-2 {
  animation-delay: 0.2s;
}

.dot-3 {
  animation-delay: 0.4s;
}

@keyframes bootPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.95;
  }
  50% {
    transform: scale(1.06);
    opacity: 1;
  }
}

@keyframes dotFade {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4rpx);
  }
}

.form-item {
  margin-bottom: 36rpx;
}

.label {
  font-size: 28rpx;
  color: #666;
  display: block;
  margin-bottom: 16rpx;
}

.input {
  width: 100%;
  height: 100rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 28rpx;
  padding: 0 32rpx;
  font-size: 32rpx;
  box-sizing: border-box;
  line-height: 100rpx;
}

.input:focus {
  outline: none;
  border-color: #00b050;
}

.captcha-row {
  display: flex;
  gap: 24rpx;
  align-items: center;
}

.captcha-input {
  flex: 1;
}

.captcha {
  min-width: 240rpx;
  height: 100rpx;
  border-radius: 28rpx;
  background: #ecfdf3;
  color: #00a450;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 700;
  cursor: pointer;
  user-select: none;
}

.captcha:hover {
  background: #d1fae5;
}

.option-row {
  display: flex;
  justify-content: space-between;
  margin: 24rpx 0 16rpx;
}

.check {
  font-size: 28rpx;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 16rpx;
  cursor: pointer;
}

.check input {
  width: auto;
  height: auto;
  cursor: pointer;
}

.check checkbox {
  transform: scale(0.95);
}

.link-row {
  text-align: right;
  margin-bottom: 32rpx;
}

.link {
  font-size: 28rpx;
  color: #00a450;
  cursor: pointer;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

.login-btn {
  width: 100%;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0 32rpx;
  border: none;
  border-radius: 32rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  font-size: 36rpx;
  font-weight: 600;
  cursor: pointer;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-btn:active {
  transform: translateY(2rpx);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.divider {
  text-align: center;
  font-size: 28rpx;
  color: #94a3b8;
  margin: 48rpx 0 28rpx;
}

.oauth-row {
  display: flex;
  gap: 24rpx;
}

.oauth {
  flex: 1;
  height: 100rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #475569;
  cursor: pointer;
}

.oauth:hover {
  background: #f9fafb;
  border-color: #00b050;
}
</style>
