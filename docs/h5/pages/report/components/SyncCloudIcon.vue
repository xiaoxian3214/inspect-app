<template>
  <view class="sync-cloud-wrap">
    <text
      class="sync-cloud-icon"
      :class="{ syncing: isSyncing, disabled }"
      @click="handleClick"
    >
      <svg
        class="sync-cloud-svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          class="cloud-shape"
          d="M7.5 18C5.01 18 3 15.99 3 13.5C3 11.23 4.68 9.35 6.87 9.04C7.45 6.72 9.55 5 12 5C14.79 5 17.08 7.22 17.2 9.98C19.39 10.19 21 12.05 21 14.25C21 16.6 19.1 18.5 16.75 18.5H7.5V18Z"
        />
        <path v-if="isSyncing" class="arrow-shaft" d="M12 15.2V10.4" />
        <path v-if="isSyncing" class="arrow-head" d="M10.2 12.2L12 10.4L13.8 12.2" />
      </svg>
      <view v-if="pendingCount > 0" class="sync-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</view>
    </text>

    <Transition name="sync-card">
      <view v-if="showCard" class="sync-card" @click.stop>
        <view class="sync-card-inner">
          <view class="sync-card-header">
            <view class="sync-card-icon-wrap">
              <svg class="sync-card-cloud" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.5 18C5.01 18 3 15.99 3 13.5C3 11.23 4.68 9.35 6.87 9.04C7.45 6.72 9.55 5 12 5C14.79 5 17.08 7.22 17.2 9.98C19.39 10.19 21 12.05 21 14.25C21 16.6 19.1 18.5 16.75 18.5H7.5V18Z" />
                <path d="M12 15.2V10.4" />
                <path d="M10.2 12.2L12 10.4L13.8 12.2" />
              </svg>
            </view>
            <view class="sync-card-title-area">
              <text class="sync-card-title">{{ t('上传数据') }}</text>
              <text class="sync-card-count">{{ t('{count} 个剩余项目', { count: pendingCount }) }}</text>
            </view>
            <text class="sync-card-close" @click.stop="hideCard">✕</text>
          </view>
          <view v-if="isSyncing" class="sync-card-progress">
            <view class="sync-card-progress-bar">
              <view class="sync-card-progress-fill" />
            </view>
          </view>
          <text class="sync-card-tip">{{ t('所有数据上传完毕之前务必保持app打开状态。') }}</text>

          <view v-if="debugInfo" class="sync-debug">
            <view class="sync-debug-title">🔍 {{ t('未同步数据明细') }} (DEV)</view>

            <view v-if="debugInfo.dirtyPlanIds && debugInfo.dirtyPlanIds.length" class="sync-debug-section">
              <text class="sync-debug-label">{{ t('待同步 Plan（{count}）', { count: debugInfo.dirtyPlanIds.length }) }}</text>
              <view v-for="id in debugInfo.dirtyPlanIds" :key="id" class="sync-debug-item">
                <text class="sync-debug-tag plan">PLAN</text>
                <text class="sync-debug-text">{{ id }}</text>
              </view>
            </view>

            <view v-if="debugInfo.pendingPhotos && debugInfo.pendingPhotos.length" class="sync-debug-section">
              <text class="sync-debug-label">{{ t('待上传图片（{count}）', { count: debugInfo.pendingPhotos.length }) }}</text>
              <view v-for="(item, idx) in debugInfo.pendingPhotos" :key="idx" class="sync-debug-item">
                <text class="sync-debug-tag" :class="item.status">{{ item.status.toUpperCase() }}</text>
                <view class="sync-debug-info">
                  <text class="sync-debug-name">{{ item.label }}</text>
                  <text class="sync-debug-meta">{{ item.source }}[{{ item.key }}] #{{ item.index }}{{ item.retryCount ? ' retry:' + item.retryCount : '' }}{{ item.error ? ' ⚠' + item.error : '' }}</text>
                </view>
              </view>
            </view>

            <view v-if="(!debugInfo.dirtyPlanIds || !debugInfo.dirtyPlanIds.length) && (!debugInfo.pendingPhotos || !debugInfo.pendingPhotos.length)" class="sync-debug-section">
              <text class="sync-debug-label" style="color: #4ade80;">✅ {{ t('所有数据已同步') }}</text>
            </view>
          </view>
        </view>
      </view>
    </Transition>
  </view>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  isSyncing: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  pendingCount: {
    type: Number,
    default: 0
  },
  debugInfo: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['click'])

const { t } = useI18n()

const showCard = ref(false)
let _autoHideTimer = null

function handleClick() {
  if (props.disabled) return
  if (props.pendingCount > 0 || props.isSyncing || props.debugInfo) {
    showCard.value = !showCard.value
    if (showCard.value && !props.debugInfo) {
      scheduleAutoHide()
    }
  }
  emit('click')
}

function hideCard() {
  showCard.value = false
  clearAutoHideTimer()
}

function scheduleAutoHide() {
  clearAutoHideTimer()
  _autoHideTimer = setTimeout(() => {
    showCard.value = false
  }, 4000)
}

function clearAutoHideTimer() {
  if (_autoHideTimer) {
    clearTimeout(_autoHideTimer)
    _autoHideTimer = null
  }
}

watch(() => props.pendingCount, (val) => {
  if (val === 0 && showCard.value) {
    setTimeout(() => { showCard.value = false }, 1500)
  }
})

onBeforeUnmount(() => {
  clearAutoHideTimer()
})
</script>

<style scoped lang="scss">
.sync-cloud-wrap {
  position: relative;
}

.sync-cloud-icon {
  width: 80rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  transition: transform 0.3s;
}

.sync-cloud-icon:hover {
  transform: scale(1.08);
}

.sync-cloud-icon.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.sync-badge {
  position: absolute;
  top: 6rpx;
  right: 2rpx;
  min-width: 32rpx;
  height: 32rpx;
  line-height: 32rpx;
  text-align: center;
  font-size: 20rpx;
  font-weight: 700;
  color: #fff;
  background: #ef4444;
  border-radius: 32rpx;
  padding: 0 8rpx;
  box-sizing: border-box;
}

.sync-cloud-svg {
  width: 48rpx;
  height: 48rpx;
  overflow: visible;
}

.cloud-shape {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.arrow-shaft,
.arrow-head {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

// .sync-cloud-icon.syncing .arrow-shaft,
// .sync-cloud-icon.syncing .arrow-head {
//   animation: arrowPulse 0.2s ease-in-out infinite;
// }

@keyframes arrowPulse {
  0% { opacity: 0.35; }
  50% { opacity: 1; }
  100% { opacity: 0.35; }
}

.sync-card {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  padding: 24rpx 24rpx 0;
}

.sync-card-inner {
  background: #1e293b;
  border-radius: 20rpx;
  padding: 28rpx 28rpx 24rpx;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}

.sync-card-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.sync-card-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  background: rgba(59, 130, 246, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sync-card-cloud {
  width: 40rpx;
  height: 40rpx;
  overflow: visible;
}

.sync-card-cloud path {
  fill: none;
  stroke: #60a5fa;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sync-card-title-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.sync-card-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #fff;
}

.sync-card-count {
  font-size: 24rpx;
  color: #94a3b8;
}

.sync-card-close {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #64748b;
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  transition: color 0.2s;
}

.sync-card-close:hover {
  color: #fff;
}

.sync-card-progress {
  margin-top: 20rpx;
}

.sync-card-progress-bar {
  height: 8rpx;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8rpx;
  overflow: hidden;
}

.sync-card-progress-fill {
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 8rpx;
  animation: progressSlide 1.5s ease-in-out infinite;
}

@keyframes progressSlide {
  0% { transform: translateX(-100%); width: 40%; }
  50% { transform: translateX(80%); width: 60%; }
  100% { transform: translateX(250%); width: 40%; }
}

.sync-card-tip {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #64748b;
  line-height: 1.5;
}

.sync-debug {
  margin-top: 20rpx;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 16rpx;
  max-height: 500rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.sync-debug-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #fbbf24;
  margin-bottom: 12rpx;
}

.sync-debug-section {
  margin-bottom: 12rpx;
}

.sync-debug-label {
  font-size: 22rpx;
  color: #94a3b8;
  margin-bottom: 6rpx;
  display: block;
}

.sync-debug-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 0;
}

.sync-debug-tag {
  font-size: 18rpx;
  font-weight: 700;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  flex-shrink: 0;
}

.sync-debug-tag.plan {
  background: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
}

.sync-debug-tag.pending {
  background: rgba(251, 191, 36, 0.25);
  color: #fbbf24;
}

.sync-debug-tag.error {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.sync-debug-tag.uploading {
  background: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
}

.sync-debug-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  min-width: 0;
}

.sync-debug-name {
  font-size: 22rpx;
  color: #e2e8f0;
  word-break: break-all;
}

.sync-debug-meta {
  font-size: 18rpx;
  color: #64748b;
  word-break: break-all;
}

.sync-debug-text {
  font-size: 20rpx;
  color: #cbd5e1;
  word-break: break-all;
  flex: 1;
}

.sync-card-enter-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
}

.sync-card-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.sync-card-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.sync-card-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
