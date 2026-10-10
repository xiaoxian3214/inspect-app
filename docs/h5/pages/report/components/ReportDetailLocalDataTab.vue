<template>
  <view class="tab-content local-data-tab-content">
    <view class="local-data-card">
      <view class="card-title local-data-title">
        <text>本地报告数据</text>
        <view class="local-data-actions">
          <AppButton class="local-data-action-btn" @click="$emit('refresh')">刷新</AppButton>
          <AppButton class="local-data-action-btn primary" @click="$emit('copy')">复制</AppButton>
        </view>
      </view>
      <view class="local-data-meta">更新时间：{{ updatedAt || '-' }}</view>
      <pre class="local-data-json">{{ contentText || '暂无本地数据' }}</pre>
    </view>
  </view>
</template>

<script setup>
defineProps({
  updatedAt: {
    type: String,
    default: ''
  },
  contentText: {
    type: String,
    default: ''
  }
})

defineEmits(['refresh', 'copy'])
</script>

<style scoped lang="scss">
.tab-content {
  animation: fadeIn 0.3s;
  padding: 30rpx;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20rpx); }
  to { opacity: 1; transform: translateY(0); }
}

.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 4rpx solid #f1f5f9;
}

.local-data-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.local-data-tab-content {
  padding: 0;
  height: 100%;
}

.local-data-card {
  height: 100%;
  background: #0b1220;
  display: flex;
  flex-direction: column;
  padding: 24rpx;
}

.local-data-actions {
  display: flex;
  gap: 16rpx;
}

.local-data-action-btn {
  border: 2rpx solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 12rpx;
  height: 56rpx;
  line-height: 52rpx;
  padding: 0 20rpx;
  font-size: 24rpx;
}

.local-data-action-btn.primary {
  border-color: #2563eb;
  color: #fff;
  background: #2563eb;
}

.local-data-meta {
  font-size: 24rpx;
  color: #94a3b8;
  margin-bottom: 20rpx;
}

.local-data-json {
  margin: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #111827;
  color: #e2e8f0;
  font-size: 24rpx;
  line-height: 1.45;
  white-space: pre;
  word-break: normal;
}
</style>
