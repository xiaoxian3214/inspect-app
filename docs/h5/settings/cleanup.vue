<template>
  <view class="page">
    <LanguageSwitcher />
    <view class="card">
      <view class="row">
        <text>{{ t('启用自动清理') }}</text>
        <switch :checked="form.enabled" @change="onSwitch" />
      </view>
      <view class="field">
        <text>{{ t('保留天数（1-90）') }}</text>
        <input type="number" v-model="form.retentionDays" />
      </view>
      <view class="field">
        <text>{{ t('缓存上限MB（100-10240）') }}</text>
        <input type="number" v-model="form.maxCacheSizeMB" />
      </view>
      <AppButton type="primary" @click="save">{{ t('保存') }}</AppButton>
    </view>
  </view>
</template>

<script setup>
import { reactive } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getCleanupPolicy, saveCleanupPolicy } from '../../services/settingsService'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../utils/i18n.js'

const { t } = useI18n()

const form = reactive({
  enabled: true,
  retentionDays: 7,
  maxCacheSizeMB: 2048
})

function load() {
  const policy = getCleanupPolicy()
  form.enabled = policy.enabled
  form.retentionDays = policy.retentionDays
  form.maxCacheSizeMB = policy.maxCacheSizeMB
}

function onSwitch(e) {
  form.enabled = !!e.detail.value
}

function save() {
  saveCleanupPolicy({
    enabled: form.enabled,
    retentionDays: form.retentionDays,
    maxCacheSizeMB: form.maxCacheSizeMB
  })
  uni.showToast({ title: t('已保存'), icon: 'success' })
}

onShow(load)
</script>

<style scoped>
.page { padding: 24rpx; }
.card { background: #fff; border-radius: 12rpx; padding: 24rpx; }
.row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; }
.field { margin-bottom: 16rpx; }
.field input { margin-top: 8rpx; border: 2rpx solid #e5e7eb; border-radius: 8rpx; padding: 12rpx; }
</style>
