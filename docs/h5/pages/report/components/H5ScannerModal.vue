<template>
  <view v-if="visible" class="scanner-full-screen">
    <!-- 头部：包含返回按钮和标题 -->
    <view class="scanner-header">
      <view class="scanner-back" @click="emit('close')">
        <text class="back-icon">←</text>
      </view>
      <text class="scanner-title">{{ titleView }}</text>
    </view>

    <!-- 扫码区域 -->
    <view class="scanner-body">
      <!-- 视频容器 -->
      <view :id="elementId" class="scanner-h5-root"></view>
      
      <!-- 扫描覆盖层 -->
      <!-- 带有中心挖空的暗色蒙层 -->
      <view class="scanner-overlay-ui" @click.stop="handleDoubleTap"></view>
      
      <!-- 扫描框、动画线、文字等 UI 元素 -->
      <view class="scanner-ui-elements" @click.stop="handleDoubleTap">
        <view class="scanner-frame">
          <view class="scanner-corner tl"></view>
          <view class="scanner-corner tr"></view>
          <view class="scanner-corner bl"></view>
          <view class="scanner-corner br"></view>
          <view class="scanner-line"></view>
        </view>
        <view class="scanner-hint">{{ hintView }}</view>
        <view v-if="showZoom" class="scanner-zoom-btn" @click.stop="emit('toggle-zoom')">
          <text>{{ currentZoom }}X</text>
        </view>
      </view>
    </view>

    <!-- 底部操作区 -->
    <view class="scanner-footer">
      <view class="scanner-manual-btn" @click="emit('manual-input')">
        <text class="scanner-manual-icon">⌨️</text>
        <text class="scanner-manual-text">{{ manualView }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  elementId: {
    type: String,
    default: 'search-h5-scanner'
  },
  titleText: {
    type: String,
    default: '扫描条码'
  },
  hintText: {
    type: String,
    default: '将条码对准扫描框'
  },
  manualText: {
    type: String,
    default: '手动输入'
  },
  showZoom: {
    type: Boolean,
    default: false
  },
  currentZoom: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['close', 'manual-input', 'toggle-zoom'])

const { t } = useI18n()
const titleView = computed(() => t(props.titleText))
const hintView = computed(() => t(props.hintText))
const manualView = computed(() => t(props.manualText))

// 双击放大缩小逻辑
let lastTapTime = 0
function handleDoubleTap() {
  const now = Date.now()
  if (now - lastTapTime < 300) {
    if (props.showZoom) {
      emit('toggle-zoom')
    }
  }
  lastTapTime = now
}
</script>

<style scoped>
.scanner-full-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #000;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.3s;
}

.scanner-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 88rpx;
  /* status bar margin can be added here if needed, e.g. padding-top: var(--status-bar-height) */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2010;
  padding: 0 32rpx;
  background: linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0));
}

.scanner-back {
  position: absolute;
  left: 32rpx;
  width: 80rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
}

.back-icon {
  font-size: 48rpx;
  color: #fff;
}

.scanner-title {
  font-size: 36rpx;
  font-weight: 500;
  color: #fff;
}

.scanner-body {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.scanner-h5-root {
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  overflow: hidden !important;
}

/* 覆盖层：因为 html5-qrcode 自身会渲染 shaded region，
   我们可以让我们的覆盖层绝对定位并不拦截点击，仅用于显示动画和角 */
.scanner-overlay-ui {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 2005;
  /* 使用 mask 遮罩，把中间的正方形挖空 */
  background: rgba(0, 0, 0, 0.4);
  -webkit-mask: 
    linear-gradient(rgba(0,0,0,1), rgba(0,0,0,1))
    /* 这里和下方的 width/height/top/left 保持一致 */
    0 0 / 100% 100%,
    linear-gradient(rgba(0,0,0,1), rgba(0,0,0,1))
    center / 260px 260px no-repeat;
  -webkit-mask-composite: xor;
  mask: 
    linear-gradient(rgba(0,0,0,1), rgba(0,0,0,1))
    0 0 / 100% 100%,
    linear-gradient(rgba(0,0,0,1), rgba(0,0,0,1))
    center / 260px 260px no-repeat;
  mask-composite: exclude;
}

/* 保证四个角和扫描线不被 mask 裁掉，我们把框移出来 */
.scanner-ui-elements {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 2006;
}

.scanner-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 260px !important;
  height: 260px !important;
  box-sizing: border-box;
}

.scanner-corner {
  position: absolute;
  width: 40rpx;
  height: 40rpx;
  border: 6rpx solid #1677ff;
}

.scanner-corner.tl {
  top: -4rpx;
  left: -4rpx;
  border-right: none;
  border-bottom: none;
}

.scanner-corner.tr {
  top: -4rpx;
  right: -4rpx;
  border-left: none;
  border-bottom: none;
}

.scanner-corner.bl {
  bottom: -4rpx;
  left: -4rpx;
  border-right: none;
  border-top: none;
}

.scanner-corner.br {
  bottom: -4rpx;
  right: -4rpx;
  border-left: none;
  border-top: none;
}

.scanner-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, #1677ff, transparent);
  box-shadow: 0 0 10rpx #1677ff;
  animation: scanLine 2.5s infinite linear;
}

@keyframes scanLine {
  0% { top: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.scanner-hint {
  position: absolute;
  top: calc(50% + 150px); /* 260/2 = 130 + 20px gap */
  left: 0;
  right: 0;
  color: #fff;
  font-size: 28rpx;
  text-align: center;
  text-shadow: 0 2rpx 4rpx rgba(0,0,0,0.5);
}

.scanner-zoom-btn {
  position: absolute;
  bottom: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 80rpx;
  height: 80rpx;
  border-radius: 40rpx;
  background: rgba(0, 0, 0, 0.5);
  border: 2rpx solid rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 28rpx;
  font-weight: 500;
  pointer-events: auto; /* 允许点击 */
  cursor: pointer;
  z-index: 2006;
}

.scanner-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 2010;
  display: flex;
  justify-content: center;
  padding-top: 40rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}

.scanner-manual-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 40rpx;
  border-radius: 40rpx;
  background: rgba(0, 0, 0, 0.6);
  border: 2rpx solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
}

.scanner-manual-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
}

.scanner-manual-text {
  color: #fff;
  font-size: 28rpx;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 隐藏 html5-qrcode 默认的UI并强制视频铺满，防止撑开页面 */
:deep(.scanner-h5-root img) {
  display: none !important;
}
:deep(.scanner-h5-root) {
  border: none !important;
}
:deep(.scanner-h5-root > div) {
  width: 100% !important;
  height: 100% !important;
}
/* html5-qrcode 会在容器内生成一个 id 为 qr-shaded-region 的元素来做遮罩，
   因为我们自己画了四个角和扫描线，所以这里直接把它的遮罩也隐藏掉，
   同时它也会导致在某些屏幕比例下正方形被挤扁，隐藏掉更干净 */
:deep(#qr-shaded-region) {
  display: none !important;
}
:deep(.scanner-h5-root video) {
  object-fit: cover !important;
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
}
</style>
