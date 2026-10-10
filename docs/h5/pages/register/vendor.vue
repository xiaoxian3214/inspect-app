<template>
  <view class="page">
    <view class="brand">
      <text class="brand-title">{{ t('供应商注册') }}</text>
    </view>

    <view class="card">
      <view class="form-item">
        <text class="label">{{ t('邀请码') }}</text>
        <input
          v-model="form.inviteCode"
          class="input input-disabled"
          :placeholder="t('请输入邀请码')"
          :placeholder-style="placeholderStyle"
          disabled
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('邮箱') }}</text>
        <input
          v-model="form.email"
          class="input"
          type="text"
          :placeholder="t('请输入邮箱')"
          :placeholder-style="placeholderStyle"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('姓名') }}</text>
        <input
          v-model="form.name"
          class="input"
          :placeholder="t('请输入姓名')"
          :placeholder-style="placeholderStyle"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('手机号') }}</text>
        <input
          v-model="form.mobile"
          class="input"
          type="number"
          :placeholder="t('请输入手机号')"
          :placeholder-style="placeholderStyle"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('供应商编码') }}</text>
        <input
          v-model="form.vendorCode"
          class="input"
          :placeholder="t('不知道的请和对接的QC联系')"
          :placeholder-style="placeholderStyle"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('供应商简称') }}</text>
        <input
          v-model="form.vendorSimpleName"
          class="input"
          :placeholder="t('请输入供应商简称')"
          :placeholder-style="placeholderStyle"
        />
      </view>

      <view class="form-item">
        <text class="label">{{ t('密码') }}</text>
        <view class="password-wrap">
          <input
            v-model="form.password"
            class="input password-input"
            :type="showPassword ? 'text' : 'password'"
            :placeholder="t('请输入密码')"
            :placeholder-style="placeholderStyle"
          />
          <view class="password-toggle" @click="showPassword = !showPassword">
            <UniIcons :type="showPassword ? 'eye-slash-filled' : 'eye-filled'" size="20" color="#94a3b8" />
          </view>
        </view>
      </view>

      <view class="form-item">
        <text class="label">{{ t('确认密码') }}</text>
        <view class="password-wrap">
          <input
            v-model="form.confirmPassword"
            class="input password-input"
            :type="showConfirmPassword ? 'text' : 'password'"
            :placeholder="t('请再次输入密码')"
            :placeholder-style="placeholderStyle"
          />
          <view class="password-toggle" @click="showConfirmPassword = !showConfirmPassword">
            <UniIcons :type="showConfirmPassword ? 'eye-slash-filled' : 'eye-filled'" size="20" color="#94a3b8" />
          </view>
        </view>
      </view>

      <AppButton class="register-btn" @click="doRegister" :disabled="loading">
        {{ loading ? t('注册中...') : t('注册') }}
      </AppButton>
    </view>

    <view v-if="showSuccessModal" class="success-modal-mask">
      <view class="success-modal" @click.stop>
        <text class="success-modal-title">{{ t('注册成功') }}</text>
        <text class="success-modal-desc">{{ t('{count}秒后自动跳转登录', { count: successCountdown }) }}</text>
        <AppButton class="success-modal-btn" @click="goLogin">{{ t('前往登录') }}</AppButton>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { registerVendor } from '../../services/authService.js'
import { useI18n } from '../../utils/i18n.js'

const { t } = useI18n()

const form = reactive({
  inviteCode: '',
  email: '',
  name: '',
  mobile: '',
  vendorCode: '',
  vendorSimpleName: '',
  password: '',
  confirmPassword: ''
})

const loading = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const placeholderStyle = 'color:#d4dbe8;'
const showSuccessModal = ref(false)
const successCountdown = ref(5)
const redirectedToLogin = ref(false)

let successTimer = null

onLoad((options = {}) => {
  const routeInviteCode = decodeURIComponent(String(options.inviteCode || '')).trim()
  form.inviteCode = routeInviteCode
})

onUnload(() => {
  clearSuccessTimer()
})

function showToast(title) {
  uni.showToast({
    title,
    icon: 'none'
  })
}

function validateForm() {
  if (!form.inviteCode || !form.email || !form.name || !form.mobile || !form.vendorCode || !form.vendorSimpleName || !form.password || !form.confirmPassword) {
    showToast(t('请填写完整注册信息'))
    return false
  }

  const email = String(form.email || '').trim()
  const mobile = String(form.mobile || '').trim()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const mobilePattern = /^1\d{10}$/

  if (!emailPattern.test(email)) {
    showToast(t('邮箱格式不正确'))
    return false
  }

  if (!mobilePattern.test(mobile)) {
    showToast(t('手机号格式不正确'))
    return false
  }

  if (form.password !== form.confirmPassword) {
    showToast(t('两次输入的密码不一致'))
    return false
  }

  return true
}

async function doRegister() {
  if (loading.value || !validateForm()) return

  loading.value = true
  try {
    await registerVendor({
      inviteCode: form.inviteCode,
      email: form.email,
      name: form.name,
      mobile: form.mobile,
      vendorCode: form.vendorCode,
      vendorSimpleName: form.vendorSimpleName,
      password: form.password,
      confirmPassword: form.confirmPassword
    })

    openSuccessModal()
  } catch (error) {
    console.error('供应商注册失败:', error)
    showToast(error.message || t('注册失败，请稍后重试'))
  } finally {
    loading.value = false
  }
}

function clearSuccessTimer() {
  if (successTimer) {
    clearInterval(successTimer)
    successTimer = null
  }
}

function goLogin() {
  if (redirectedToLogin.value) return
  redirectedToLogin.value = true
  clearSuccessTimer()
  uni.reLaunch({
    url: '/pages/login/login'
  })
}

function openSuccessModal() {
  clearSuccessTimer()
  redirectedToLogin.value = false
  successCountdown.value = 5
  showSuccessModal.value = true

  successTimer = setInterval(() => {
    successCountdown.value -= 1
    if (successCountdown.value <= 0) {
      goLogin()
    }
  }, 1000)
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  background: linear-gradient(180deg, #00b050, #009245);
  padding: 32rpx 36rpx 28rpx;
}

.brand {
  text-align: center;
  color: #fff;
  margin-bottom: 18rpx;
}

.brand-title {
  font-size: 46rpx;
  font-weight: 700;
  display: block;
}

.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx 38rpx;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.12);
}

.form-item {
  margin-bottom: 16rpx;
}

.label {
  font-size: 26rpx;
  color: #555;
  display: block;
  margin-bottom: 10rpx;
}

.input {
  width: 100%;
  height: 74rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 20rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  box-sizing: border-box;
  line-height: 74rpx;
}

.password-wrap {
  position: relative;
}

.password-input {
  padding-right: 100rpx;
}

.password-toggle {
  position: absolute;
  right: 20rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input:focus {
  outline: none;
  border-color: #00b050;
}

.input-disabled,
.input[disabled] {
  background-color: #f5f7fa;
  border-color: #e5e7eb;
  color: #8b95a7;
}

.input::placeholder {
  color: #d4dbe8;
}

.register-btn {
  width: 100%;
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0 32rpx;
  margin-top: 48rpx;
  border: none;
  border-radius: 32rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  font-size: 36rpx;
  font-weight: 600;
  cursor: pointer;
}

.register-btn:hover {
  opacity: 0.9;
}

.register-btn:active {
  transform: translateY(2rpx);
}

.register-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 0 36rpx;
}

.success-modal {
  width: 100%;
  background: #fff;
  border-radius: 24rpx;
  padding: 36rpx 28rpx 28rpx;
}

.success-modal-title {
  display: block;
  text-align: center;
  font-size: 34rpx;
  font-weight: 600;
  color: #111827;
}

.success-modal-desc {
  display: block;
  margin-top: 14rpx;
  text-align: center;
  font-size: 26rpx;
  color: #6b7280;
}

.success-modal-btn {
  width: 100%;
  height: 88rpx;
  margin-top: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
