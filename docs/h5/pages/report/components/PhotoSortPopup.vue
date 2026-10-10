<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="290"
    class="photo-sort-popup"
    :style="{ height: '90vh', width: '100%' }"
    @click-overlay="handleClose"
  >
    <view class="sort-modal">
      <view class="sort-header">
        <view class="close-btn"  @click.stop="handleClose">✕</view>
        <text class="sort-title">{{ t('照片重新排序') }}</text>
        <text class="sort-done" :class="{ disabled: saving }" @click="handleDone">{{ saving ? t('保存中...') : t('完成') }}</text>
      </view>
      <view class="sort-hint">{{ t('按住照片拖拽可调整顺序') }}</view>
      <scroll-view scroll-y class="sort-body" :scroll-top="scrollTop" @scroll="onScroll">
        <view ref="gridRef" class="sort-grid">
          <view
            v-for="(photo, index) in sortedPhotos"
            :key="photo._id || photo.fileId || index"
            class="sort-item"
            :class="{
              dragging: dragIndex === index,
              'drag-over': dragOverIndex === index && dragOverIndex !== dragIndex
            }"
            @touchstart="onTouchStart(index, $event)"
            @touchmove="onTouchMove($event)"
            @touchend="onTouchEnd"
            @touchcancel="onTouchCancel"
            @mousedown.prevent="onMouseDown(index, $event)"
          >
            <view class="sort-index-badge">{{ index + 1 }}</view>
            <MediaItem :media="photo" mode="thumb" class="sort-thumb-item" />
          </view>
        </view>
      </scroll-view>
    </view>

    <view
      v-if="dragIndex >= 0 && ghostStyle"
      class="drag-ghost"
      :style="ghostStyle"
    >
      <MediaItem :media="sortedPhotos[dragIndex]" mode="thumb" class="ghost-thumb-item" />
    </view>
  </Popup>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Popup } from 'vant'
import { sortInspectFiles } from '../../../api/report.js'
import MediaItem from './MediaItem.vue'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'

const COLS = 3
const LONG_PRESS_MS = 100
const MOVE_CANCEL_PX = 12

const props = defineProps({
  visible: { type: Boolean, default: false },
  photos: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'sorted'])

const { t } = useI18n()

const sortedPhotos = ref([])
const saving = ref(false)
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)
const ghostStyle = ref(null)
const scrollTop = ref(0)
const gridRef = ref(null)

let itemRects = []
let gridRect = null
let currentScrollTop = 0
let pendingIndex = -1
let pressTimer = null
let pressStartX = 0
let pressStartY = 0
let isDragActive = false

watch(() => props.visible, (val) => {
  if (val) {
    sortedPhotos.value = props.photos.map((p) => p)
    dragIndex.value = -1
    dragOverIndex.value = -1
    ghostStyle.value = null
    currentScrollTop = 0
    scrollTop.value = 0
    pendingIndex = -1
    isDragActive = false
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = null
    }
  }
})

function onScroll(e) {
  currentScrollTop = e.detail?.scrollTop || 0
}

function getItemRects() {
  const container = document.querySelector('.photo-sort-popup .sort-grid')
  if (!container) return []
  gridRect = container.getBoundingClientRect()
  const items = container.querySelectorAll('.sort-item')
  return Array.from(items).map(el => {
    const rect = el.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2
    }
  })
}

function findDropIndex(clientX, clientY) {
  let closest = -1
  let minDist = Infinity
  for (let i = 0; i < itemRects.length; i++) {
    const r = itemRects[i]
    const dx = clientX - r.centerX
    const dy = clientY - r.centerY
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      closest = i
    }
  }
  return closest
}

function updateGhost(clientX, clientY) {
  if (dragIndex.value < 0 || !itemRects[dragIndex.value]) return
  const rect = itemRects[dragIndex.value]
  ghostStyle.value = {
    width: rect.width + 'px',
    height: rect.height + 'px',
    left: (clientX - rect.width / 2) + 'px',
    top: (clientY - rect.height / 2) + 'px'
  }
}

function clearPressTimer() {
  if (pressTimer) {
    clearTimeout(pressTimer)
    pressTimer = null
  }
}

function beginDrag(index, clientX, clientY) {
  isDragActive = true
  pendingIndex = -1
  dragIndex.value = index
  itemRects = getItemRects()
  updateGhost(clientX, clientY)
}

function onTouchStart(index, e) {
  const touch = e.touches?.[0]
  if (!touch) return

  isDragActive = false
  pendingIndex = index
  pressStartX = touch.clientX
  pressStartY = touch.clientY
  clearPressTimer()
  pressTimer = setTimeout(() => {
    beginDrag(index, pressStartX, pressStartY)
  }, LONG_PRESS_MS)
}

function onTouchMove(e) {
  const touch = e.touches?.[0]
  if (!touch) return

  if (!isDragActive) {
    if (pendingIndex < 0) return
    const dx = touch.clientX - pressStartX
    const dy = touch.clientY - pressStartY
    if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) {
      pendingIndex = -1
      clearPressTimer()
    }
    return
  }

  try { e.preventDefault() } catch {}
  const overIdx = findDropIndex(touch.clientX, touch.clientY)
  dragOverIndex.value = overIdx
  updateGhost(touch.clientX, touch.clientY)
}

function onTouchEnd() {
  clearPressTimer()
  pendingIndex = -1

  if (isDragActive) {
    if (dragIndex.value >= 0 && dragOverIndex.value >= 0 && dragIndex.value !== dragOverIndex.value) {
      const arr = [...sortedPhotos.value]
      const [moved] = arr.splice(dragIndex.value, 1)
      arr.splice(dragOverIndex.value, 0, moved)
      sortedPhotos.value = arr
    }
  }
  isDragActive = false
  dragIndex.value = -1
  dragOverIndex.value = -1
  ghostStyle.value = null
}

function onTouchCancel() {
  clearPressTimer()
  pendingIndex = -1
  isDragActive = false
  dragIndex.value = -1
  dragOverIndex.value = -1
  ghostStyle.value = null
}

function onMouseDown(index, e) {
  dragIndex.value = index
  itemRects = getItemRects()
  updateGhost(e.clientX, e.clientY)

  const onMouseMove = (ev) => {
    if (dragIndex.value < 0) return
    const overIdx = findDropIndex(ev.clientX, ev.clientY)
    dragOverIndex.value = overIdx
    updateGhost(ev.clientX, ev.clientY)
  }

  const onMouseUp = () => {
    onTouchEnd()
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

async function handleDone() {
  if (saving.value) return

  const hasRemoteFiles = sortedPhotos.value.some(p => p.fileId)
  if (hasRemoteFiles) {
    saving.value = true
    try {
      const items = sortedPhotos.value
        .filter(p => p.fileId)
        .map((p, idx) => ({ fileId: String(p.fileId), sortNo: idx + 1 }))
      if (items.length) {
        await sortInspectFiles(items)
      }
    } catch (error) {
      console.error('照片排序保存失败:', error)
      uni.showToast({ title: error.message || t('排序保存失败'), icon: 'none' })
      saving.value = false
      return
    }
    saving.value = false
    uni.showToast({ title: t('排序保存成功'), icon: 'success' })
  }

  sortedPhotos.value.forEach((p, idx) => { p.sortNo = idx + 1 })
  emit('sorted', sortedPhotos.value)
  emit('close')
}

function handleClose() {
  emit('close')
}
</script>

<style scoped lang="scss">
.sort-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
}

.sort-header {
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

  .sort-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a1a;
  }

  .sort-done {
    font-size: 28rpx;
    font-weight: 600;
    color: #1a5f3f;
    padding: 8rpx 16rpx;
    cursor: pointer;

    &.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
  }
}

.sort-hint {
  flex-shrink: 0;
  padding: 16rpx 32rpx;
  font-size: 24rpx;
  color: #94a3b8;
  background: #f8fafc;
}

.sort-body {
  flex: 1;
  min-height: 0;
  padding: 24rpx;
  width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

.sort-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  width: 100%;
  box-sizing: border-box;
}

.sort-item {
  position: relative;
  width: calc((100% - 32rpx) / 3);
  aspect-ratio: 1;
  border-radius: 16rpx;
  overflow: hidden;
  border: 3rpx solid transparent;
  box-sizing: border-box;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  background: #f1f5f9;
  flex-shrink: 0;

  &.dragging {
    opacity: 0.3;
    transform: scale(0.95);
    border-color: #1a5f3f;
  }

  &.drag-over {
    border-color: #3b82f6;
    background: #dbeafe;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.97);
  }
}

.sort-index-badge {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  pointer-events: none;
}

.sort-thumb-item {
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  border-radius: 16rpx;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  opacity: 0.85;
  transform: scale(1.08);
  transition: none;

  .ghost-thumb-item {
    width: 100%;
    height: 100%;
  }
}
</style>
