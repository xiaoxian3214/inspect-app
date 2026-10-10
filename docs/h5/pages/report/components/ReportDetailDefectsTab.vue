<template>
  <view class="tab-content">
    <view class="defects-summary">
      <view class="summary-item">
        <text class="summary-label">{{ getSeverityLabel('CRITICAL') }}</text>
        <text class="summary-value critical">{{ defectCounts.critical }}</text>
      </view>
      <view class="summary-item">
        <text class="summary-label">{{ getSeverityLabel('MAJOR') }}</text>
        <text class="summary-value major">{{ defectCounts.major }}</text>
      </view>
      <view class="summary-item">
        <text class="summary-label">{{ getSeverityLabel('MINOR') }}</text>
        <text class="summary-value minor">{{ defectCounts.minor }}</text>
      </view>
    </view>

    <view v-if="defects.length === 0" class="empty-state">
      <view class="empty-icon">✓</view>
      <view class="empty-text">{{ t('暂无疵点记录') }}</view>
    </view>

    <view v-else class="defects-list">
      <view
        v-for="group in defectGroups"
        :key="group.key"
        class="defect-group"
      >
        <view class="defect-group-title">
          {{ group.label }}（{{ group.items.length }}）
          <text v-if="group.affectedTotal > 0" class="defect-group-actual">{{ t('实际发现：{count}', { count: group.affectedTotal }) }}</text>
        </view>
        <view
          v-for="(defect, index) in group.items"
          :key="defect.id || `${group.key}_${index}`"
          class="defect-item"
          @click="$emit('openDefect', defect)"
        >
          <view class="defect-main">
            <view class="defect-left">
              <img
                v-if="defect.photos && defect.photos.length > 0"
                :src="getPhotoDisplayUrl(defect.photos[0])"
                class="defect-cover"
                loading="lazy"
              />
              <view v-else class="defect-cover defect-cover-placeholder">
                {{ t('暂无图片') }}
              </view>
            </view>
            <view class="defect-right">
              <view class="defect-header">
                <text class="defect-type" :class="getSeverityClass(defect.type)">{{ getSeverityLabel(defect.type) }}</text>
                <text class="defect-time">{{ formatTime(defect.createdAt) }}</text>
              </view>
              <view class="defect-desc">{{ defect.defectCode || t('未填写编码') }}</view>
              <view class="defect-desc-secondary" v-if="defect.defectDesc">{{ defect.defectDesc || t('未填写描述') }}</view>
              <view class="defect-meta">
                <text v-if="defect.quantity" class="defect-qty">{{ t('受影响数量：{count}个', { count: defect.quantity }) }}</text>
                <text v-if="defect.photos && defect.photos.length" class="defect-photo-count">
                  {{ t('{count} 张图片', { count: defect.photos.length }) }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <AppButton class="add-defect-btn" @click="$emit('addDefect')">{{ t('+ 添加疵点') }}</AppButton>
  </view>
</template>

<script setup>
import { getPhotoDisplayUrl } from '../../../utils/photoUpload.js'
import { useI18n } from '../../../utils/i18n.js'

const { t } = useI18n()

defineProps({
  defects: {
    type: Array,
    default: () => []
  },
  defectCounts: {
    type: Object,
    default: () => ({ critical: 0, major: 0, minor: 0 })
  },
  defectGroups: {
    type: Array,
    default: () => []
  },
  getSeverityLabel: {
    type: Function,
    required: true
  },
  getSeverityClass: {
    type: Function,
    required: true
  },
  formatTime: {
    type: Function,
    required: true
  }
})

defineEmits(['addDefect', 'openDefect'])
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

.empty-state {
  text-align: center;
  padding: 120rpx 40rpx;
}

.empty-icon {
  font-size: 128rpx;
  margin-bottom: 30rpx;
}

.empty-text {
  font-size: 28rpx;
  color: #94a3b8;
}

.defects-summary {
  display: flex;
  gap: 20rpx;
  margin-bottom: 30rpx;
}

.summary-item {
  flex: 1;
  background: #fff;
  padding: 30rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.summary-label {
  font-size: 24rpx;
  color: #64748b;
}

.summary-value {
  font-size: 48rpx;
  font-weight: 700;
}

.summary-value.critical {
  color: #dc2626;
}

.summary-value.major {
  color: #f59e0b;
}

.summary-value.minor {
  color: #3b82f6;
}

.defects-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 30rpx;
}

.defect-group {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.defect-group-title {
  font-size: 26rpx;
  color: #475569;
  font-weight: 600;
  padding: 0 4rpx;
}

.defect-group-actual {
  margin-left: 16rpx;
  color: #0f766e;
  font-weight: 500;
}

.defect-item {
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx;
  cursor: pointer;
  transition: all 0.2s;
}

.defect-item:active {
  transform: scale(0.99);
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.1);
}

.defect-main {
  display: flex;
  align-items: flex-start;
  gap: 24rpx;
}

.defect-left {
  flex-shrink: 0;
}

.defect-cover {
  width: 168rpx;
  height: 168rpx;
  border-radius: 20rpx;
  object-fit: cover;
  border: 2rpx solid #e5e7eb;
  background: #f8fafc;
}

.defect-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 24rpx;
}

.defect-right {
  min-width: 0;
  flex: 1;
}

.defect-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.defect-type {
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  font-size: 24rpx;
  font-weight: 600;
}

.defect-type.critical {
  background: #fee2e2;
  color: #dc2626;
}

.defect-type.major {
  background: #fef3c7;
  color: #f59e0b;
}

.defect-type.minor {
  background: #dbeafe;
  color: #3b82f6;
}

.defect-time {
  font-size: 24rpx;
  color: #94a3b8;
}

.defect-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
  flex-wrap: wrap;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #64748b;
}

.defect-desc {
  font-size: 28rpx;
  color: #1e293b;
  line-height: 1.5;
  word-break: break-word;
}

.defect-desc-secondary {
  font-size: 24rpx;
  color: #64748b;
  line-height: 1.4;
  margin-top: 4rpx;
  word-break: break-word;
}

.defect-qty {
  color: #0f766e;
}

.add-defect-btn {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  border: none;
  border-radius: 24rpx;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.add-defect-btn:active {
  opacity: 0.9;
  transform: translateY(-2rpx);
}
</style>
