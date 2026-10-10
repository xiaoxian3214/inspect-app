<template>
  <view ref="rootRef" class="lang-switcher">
    <view class="lang-trigger" @click="toggleOpen">
      <text class="lang-current">{{ locale }}</text>
      <text class="lang-arrow" :class="{ open: open }">▾</text>
    </view>

    <view v-if="open" class="lang-dropdown">
      <view
        v-for="code in supportedLocales"
        :key="code"
        class="lang-option"
        :class="{ active: code === locale }"
        @click="selectLocale(code)"
      >
        {{ code }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../utils/i18n.js'

const { locale, supportedLocales, setLocale } = useI18n()
const open = ref(false)
const rootRef = ref(null)

function toggleOpen() {
  open.value = !open.value
}

function selectLocale(code) {
  setLocale(code)
  open.value = false
}

function handleClickOutside(event) {
  const rootEl = rootRef.value?.$el || rootRef.value
  if (!rootEl || typeof rootEl.contains !== 'function') return
  const target = event?.target
  if (!target) return
  if (typeof Node !== 'undefined' && !(target instanceof Node)) return
  if (!rootEl.contains(target)) {
    open.value = false
  }
}

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleClickOutside)
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleClickOutside)
  }
})
</script>

<style scoped>
.lang-switcher {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0) + 24rpx);
  right: 24rpx;
  z-index: 3000;
  display: inline-block;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16rpx);
  padding: 8rpx 12rpx;
  border-radius: 999rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.35);
}

.lang-trigger {
  min-width: 112rpx;
  height: 56rpx;
  border-radius: 999rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 0 20rpx;
  cursor: pointer;
  color: #fff;
}

.lang-current {
  font-size: 24rpx;
  font-weight: 700;
  text-transform: lowercase;
}

.lang-arrow {
  font-size: 24rpx;
  line-height: 1;
  transition: transform 0.2s ease;
}

.lang-arrow.open {
  transform: rotate(180deg);
}

.lang-dropdown {
  position: absolute;
  top: calc(100% + 16rpx);
  right: 0;
  min-width: 144rpx;
  border-radius: 24rpx;
  background: #fff;
  border: 2rpx solid #e5e7eb;
  box-shadow: 0 16rpx 48rpx rgba(15, 23, 42, 0.16);
  overflow: hidden;
}

.lang-option {
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 600;
  text-transform: lowercase;
  color: #334155;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.lang-option + .lang-option {
  border-top: 2rpx solid #f1f5f9;
}

.lang-option.active {
  background: #ecfdf3;
  color: #03ae4f;
}
</style>
