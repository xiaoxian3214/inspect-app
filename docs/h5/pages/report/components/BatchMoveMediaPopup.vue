<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="285"
    class="batch-move-popup"
    :style="{ height: currentStep === 1 ? '90vh' : '90vh', width: '100%' }"
    @click-overlay="handleClose"
  >
    <view class="batch-move-modal">
      <view v-if="submitting" class="moving-overlay">
        <view class="moving-spinner"></view>
        <text class="moving-text">{{ t('移动中...') }}</text>
      </view>
      <view class="batch-move-header">
        <view class="close-btn" @click.stop="handleClose">✕</view>
        <text class="batch-move-title">{{ currentStep === 1 ? t('批量移动照片/视频') : t('选择目标检查点') }}</text>
        <text class="step-indicator">{{ currentStep }}/2</text>
      </view>

      <view v-if="currentStep === 1" class="batch-move-body">
        <view class="select-all-row" @click="toggleSelectAll">
          <view class="checkbox" :class="{ checked: isAllSelected }"></view>
          <text class="select-all-text">{{ t('全选') }}</text>
        </view>
        <view class="move-hint">
          {{ t('可移动 {movable}/{total}（未上传不可移动）', { movable: movableCount, total: totalCount }) }}
        </view>
        <scroll-view scroll-y class="media-grid-scroll">
          <view class="media-grid">
            <view
              v-for="(m, idx) in mediaList"
              :key="m.fileId || idx"
              class="media-cell"
              :class="{ selected: selectedIndexes.includes(idx), disabled: !isMovable(idx) }"
              @click="toggleIndex(idx)"
            >
              <MediaItem :media="m" mode="thumb" class="media-thumb" />
              <view class="cell-check">
                <view class="checkbox" :class="{ checked: selectedIndexes.includes(idx) }"></view>
              </view>
              <view v-if="!isMovable(idx)" class="disabled-mask">
                <text>{{ t('未上传') }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view v-if="currentStep === 2" class="batch-move-body">
        <view v-if="targetItems.length" class="select-all-row" @click="toggleSelectAllTargets">
          <view class="checkbox" :class="{ checked: isAllTargetsSelected }"></view>
          <text class="select-all-text">{{ t('全选') }}</text>
        </view>
        <scroll-view scroll-y class="target-list-scroll">
          <view class="target-list-inner">
            <view v-if="!targetItems.length" class="empty-hint">
              <text>{{ t('暂无可选的检查点') }}</text>
            </view>
            <view
              v-for="t in targetItems"
              :key="t.bizId"
              class="target-row"
              :class="{ selected: selectedTargetBizIds.includes(t.bizId) }"
              @click="toggleTarget(t.bizId)"
            >
              <view class="checkbox" :class="{ checked: selectedTargetBizIds.includes(t.bizId) }"></view>
              <view class="target-info">
                <text class="target-name">{{ t.name }}</text>
                <text v-if="t.subLabel" class="target-sub">{{ t.subLabel }}</text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="batch-move-footer">
        <AppButton v-if="currentStep === 2" class="footer-btn back" @click="currentStep = 1">{{ t('上一步') }}</AppButton>
        <AppButton class="footer-btn cancel" @click="handleClose">{{ t('取消') }}</AppButton>
        <AppButton
          v-if="currentStep === 1"
          class="footer-btn next"
          :class="{ disabled: !canNextStep }"
          @click="goNextStep"
        >{{ t('移动') }}</AppButton>
        <AppButton
          v-if="currentStep === 2"
          class="footer-btn submit"
          :class="{ disabled: !canSubmit || submitting }"
          @click="handleSubmit"
        >{{ t('完成') }}</AppButton>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Popup } from 'vant'
import MediaItem from './MediaItem.vue'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mediaList: { type: Array, default: () => [] },
  targetItems: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])

const { t } = useI18n()

const currentStep = ref(1)
const selectedIndexes = ref([])
const selectedTargetBizIds = ref([])

watch(() => props.visible, (val) => {
  if (val) {
    currentStep.value = 1
    selectedIndexes.value = []
    selectedTargetBizIds.value = []
  }
})

const isAllSelected = computed(() => {
  return movableCount.value > 0 && selectedIndexes.value.length === movableCount.value
})

const canNextStep = computed(() => selectedIndexes.value.length > 0)
const canSubmit = computed(() => selectedTargetBizIds.value.length > 0 && selectedIndexes.value.length > 0)

const isAllTargetsSelected = computed(() => {
  const total = Array.isArray(props.targetItems) ? props.targetItems.length : 0
  return total > 0 && selectedTargetBizIds.value.length === total
})

const totalCount = computed(() => Array.isArray(props.mediaList) ? props.mediaList.length : 0)

const movableIndexes = computed(() => {
  const list = Array.isArray(props.mediaList) ? props.mediaList : []
  const idxs = []
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    if (m && typeof m === 'object' && m.fileId) idxs.push(i)
  }
  return idxs
})

const movableCount = computed(() => movableIndexes.value.length)

function isMovable(idx) {
  const m = props.mediaList?.[idx]
  return !!(m && typeof m === 'object' && m.fileId)
}

function toggleIndex(idx) {
  if (!isMovable(idx)) return
  const set = new Set(selectedIndexes.value)
  if (set.has(idx)) set.delete(idx)
  else set.add(idx)
  selectedIndexes.value = Array.from(set).sort((a, b) => a - b)
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIndexes.value = []
    return
  }
  selectedIndexes.value = [...movableIndexes.value]
}

function toggleTarget(bizId) {
  const id = String(bizId || '').trim()
  if (!id) return
  const set = new Set(selectedTargetBizIds.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  selectedTargetBizIds.value = Array.from(set)
}

function toggleSelectAllTargets() {
  if (isAllTargetsSelected.value) {
    selectedTargetBizIds.value = []
    return
  }
  selectedTargetBizIds.value = props.targetItems.map(t => String(t?.bizId || '')).filter(Boolean)
}

function goNextStep() {
  if (!canNextStep.value) return
  currentStep.value = 2
}

function handleClose() {
  if (props.submitting) return
  emit('close')
}

function handleSubmit() {
  if (!canSubmit.value || props.submitting) return
  const fileIds = selectedIndexes.value
    .map(i => props.mediaList?.[i])
    .map(m => m?.fileId)
    .filter(Boolean)
    .map(id => String(id))
  const targetBizIds = selectedTargetBizIds.value.map(x => String(x)).filter(Boolean)
  if (!fileIds.length || !targetBizIds.length) return
  emit('submit', { fileIds, targetBizIds })
}
</script>

<style scoped lang="scss">
.batch-move-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  position: relative;
}

.moving-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.75);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.moving-spinner {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 6rpx solid #dbeafe;
  border-top-color: #2563eb;
  animation: spin 1s linear infinite;
}

.moving-text {
  margin-top: 24rpx;
  color: #475569;
  font-size: 28rpx;
}

.batch-move-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;

  .close-btn {
    width: 104rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44rpx;
    color: #999;
    cursor: pointer;
  }

  .batch-move-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a1a;
  }

  .step-indicator {
    width: 104rpx;
    text-align: right;
    font-size: 24rpx;
    color: #64748b;
  }
}

.batch-move-body {
  flex: 1;
  overflow: hidden;
  padding: 24rpx 24rpx 0;
  display: flex;
  flex-direction: column;
}

.select-all-row {
  display: flex;
  align-items: center;
  padding: 16rpx 8rpx;
  margin-bottom: 16rpx;
}

.select-all-text {
  margin-left: 16rpx;
  font-size: 28rpx;
  color: #1f2937;
}

.move-hint {
  margin: 0 8rpx 16rpx;
  font-size: 24rpx;
  color: #64748b;
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border-radius: 10rpx;
  border: 2rpx solid #cbd5e1;
  background: #fff;
  position: relative;
}

.checkbox.checked {
  border-color: #2563eb;
  background: #2563eb;
}

.checkbox.checked::after {
  content: '';
  position: absolute;
  left: 10rpx;
  top: 4rpx;
  width: 10rpx;
  height: 18rpx;
  border: solid #fff;
  border-width: 0 4rpx 4rpx 0;
  transform: rotate(45deg);
}

.media-grid-scroll {
  flex: 1;
  min-height: 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18rpx;
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
}

.media-cell {
  position: relative;
  border-radius: 16rpx;
  overflow: hidden;
  border: 2rpx solid transparent;
  aspect-ratio: 1;
  background: #f1f5f9;
}

.media-thumb {
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.media-cell.disabled {
  opacity: 0.7;
}

.media-cell.selected {
  border-color: #2563eb;
}

.cell-check {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
}

.disabled-mask {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24rpx;
}

.target-list-scroll {
  flex: 1;
  min-height: 0;
}

.target-list-inner {
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
}

.target-row {
  display: flex;
  align-items: center;
  padding: 22rpx 8rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.target-row.selected {
  background: #eff6ff;
}

.target-info {
  margin-left: 16rpx;
  display: flex;
  flex-direction: column;
}

.target-name {
  font-size: 30rpx;
  color: #0f172a;
}

.target-sub {
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #64748b;
}

.empty-hint {
  padding: 48rpx 0;
  text-align: center;
  color: #94a3b8;
  font-size: 28rpx;
}

.batch-move-footer {
  display: flex;
  flex-shrink: 0;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
}

.footer-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;

  &.back, &.cancel {
    background: #f5f5f5;
    color: #666;
  }

  &.next, &.submit {
    background: #1a5f3f;
    color: #fff;
  }

  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
