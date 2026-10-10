<template>
  <view class="header">
    <view class="top">
      <text class="back" @click="$emit('back')">←</text>
      <text class="title">{{ planData?.plan?.subGoodsNo || planData?.planNo }}</text>
      <SyncCloudIcon :is-syncing="isSyncing || isUploadingPhotos" :pending-count="pendingUploadCount" :debug-info="syncDebugInfo" />
    </view>
    <view class="tabs">
      <view class="tab" :class="{ active: activeTab === 'checklist' }" @click="$emit('update:activeTab', 'checklist')">
        <Icon class="tab-icon" name="records" size="18" />
        <text>{{ t('清单') }}</text>
      </view>
      <view class="tab" :class="{ active: activeTab === 'defects' }" @click="$emit('update:activeTab', 'defects')">
        <Icon class="tab-icon" name="warning" size="18" />
        <text>{{ t('疵点') }}</text>
      </view>
      <view class="tab" :class="{ active: activeTab === 'info' }" @click="$emit('update:activeTab', 'info')">
        <Icon class="tab-icon" name="description" size="18" />
        <text>{{ t('订单信息') }}</text>
      </view>
      <!-- <view class="tab" :class="{ active: activeTab === 'localData' }" @click="$emit('openLocalData')">
        <Icon class="tab-icon" name="notes" size="18" />
        <text>本地数据</text>
      </view> -->
    </view>
    <!-- <Transition name="upload-banner">
      <view v-if="isUploadingPhotos || pendingUploadCount > 0" class="upload-banner">
        <text v-if="isUploadingPhotos" class="upload-spinner"></text>
        <text v-else class="upload-dot"></text>
        <text class="upload-text">
          <template v-if="isUploadingPhotos">
            正在上传图片，请勿关闭页面
            <text v-if="pendingUploadCount > 0" class="upload-count">（剩余 {{ pendingUploadCount }} 张）</text>
          </template>
          <template v-else>
            {{ pendingUploadCount }} 张图片待同步，联网后将自动上传
          </template>
        </text>
      </view>
    </Transition> -->
  </view>
</template>

<script setup>
import { Icon } from 'vant'
import SyncCloudIcon from './SyncCloudIcon.vue'
import { useI18n } from '../../../utils/i18n.js'

const { t } = useI18n()

defineProps({
  planData: {
    type: Object,
    default: () => ({})
  },
  isSyncing: {
    type: Boolean,
    default: false
  },
  isUploadingPhotos: {
    type: Boolean,
    default: false
  },
  pendingUploadCount: {
    type: Number,
    default: 0
  },
  activeTab: {
    type: String,
    default: 'checklist'
  },
  syncDebugInfo: {
    type: Object,
    default: null
  }
})

defineEmits(['back', 'update:activeTab', 'openLocalData'])
</script>

<style scoped lang="scss">
.header {
  background: #03ae4f;
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 100;
}

.top {
  height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
}

.back {
  width: 72rpx;
  height: 72rpx;
  text-align: center;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.back {
  font-size: 48rpx;
}

.title {
  font-size: 32rpx;
  font-weight: 600;
  flex: 1;
  text-align: center;
}

.tabs {
  display: flex;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  opacity: 0.85;
  border-bottom: 6rpx solid transparent;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;

  &-icon {
    font-size: 36rpx;
  }

  &.active {
    border-bottom-color: #fff;
    opacity: 1;
    font-weight: 600;
  }
}

.upload-banner {
  display: flex;
  align-items: center;
  gap: 16rpx;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 24rpx;
  padding: 12rpx 32rpx;
  line-height: 1.4;
}

.upload-spinner {
  flex-shrink: 0;
  width: 28rpx;
  height: 28rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.upload-dot {
  flex-shrink: 0;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: #facc15;
}

.upload-text {
  flex: 1;
}

.upload-count {
  opacity: 0.8;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.upload-banner-enter-active,
.upload-banner-leave-active {
  transition: max-height 0.25s ease, opacity 0.25s ease;
  max-height: 80rpx;
  overflow: hidden;
}

.upload-banner-enter-from,
.upload-banner-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
