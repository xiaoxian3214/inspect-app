<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="3200"
    class="checklist-picker-popup"
    :style="{ height: '90vh', width: '100%' }"
    @click-overlay="handleClose"
  >
    <view class="checklist-picker-modal">
      <view class="checklist-picker-header">
        <view class="close-btn" @click.stop="handleClose">✕</view>
        <text class="checklist-picker-title">{{ titleText }}</text>
        <view class="header-placeholder"></view>
      </view>

      <view class="checklist-picker-body">
        <view v-if="loading" class="state-wrap">
          <view class="loading-spinner"></view>
          <text class="state-text">{{ t('加载中...') }}</text>
        </view>

        <view v-else-if="!templateOptions.length" class="state-wrap">
          <text class="state-text">{{ t('暂无可选清单') }}</text>
        </view>

        <scroll-view v-else scroll-y class="options-scroll">
          <view
            v-for="option in templateOptions"
            :key="option.id"
            class="option-row"
            :class="{ selected: option.id === selectedId }"
            @click="selectOption(option)"
          >
            <view class="option-main">
              <text class="option-name">{{ option.name }}</text>
            </view>
            <view class="option-check" :class="{ checked: option.id === selectedId }"></view>
          </view>
        </scroll-view>
      </view>

      <view class="checklist-picker-footer">
        <AppButton class="footer-btn cancel" @click="handleClose">{{ t('取消') }}</AppButton>
        <AppButton class="footer-btn confirm" :class="{ disabled: !selectedOption }" @click="handleConfirm">
          {{ t('确定') }}
        </AppButton>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Popup } from 'vant'
import { getPlanTemplates } from '../../../api/plan.js'
import { useI18n } from '../../../utils/i18n.js'
import 'vant/lib/popup/style'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  valueId: {
    type: String,
    default: ''
  },
  valueName: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'confirm'])

const { t } = useI18n()

const loading = ref(false)
const options = ref([])
const selectedId = ref('')
const selectedName = ref('')

const titleText = computed(() => props.title || t('选择清单'))

const templateOptions = computed(() => {
  const normalized = Array.isArray(options.value) ? [...options.value] : []
  const fallbackId = String(props.valueId || '').trim()
  const fallbackName = String(props.valueName || '').trim()
  if (
    fallbackId &&
    fallbackName &&
    !normalized.some(option => String(option?.id || '').trim() === fallbackId)
  ) {
    normalized.unshift({
      id: fallbackId,
      name: fallbackName,
      raw: null
    })
  }
  return normalized
})

const selectedOption = computed(() => {
  return templateOptions.value.find(option => option.id === selectedId.value) || null
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    selectedId.value = String(props.valueId || '').trim()
    selectedName.value = String(props.valueName || '').trim()
    await loadTemplates()
  }
)

async function loadTemplates() {
  loading.value = true
  try {
    const rows = await getPlanTemplates()
    options.value = Array.isArray(rows) ? rows : []
    if (!selectedId.value && options.value.length) {
      const firstOption = options.value[0]
      selectedId.value = firstOption.id
      selectedName.value = firstOption.name
    }
  } catch (error) {
    console.error('加载清单列表失败:', error)
    options.value = []
    globalThis.showToast(error.message || t('加载清单列表失败'))
  } finally {
    loading.value = false
  }
}

function selectOption(option) {
  const id = String(option?.id || '').trim()
  const name = String(option?.name || '').trim()
  if (!id || !name) return
  selectedId.value = id
  selectedName.value = name
}

function handleClose() {
  emit('close')
}

function handleConfirm() {
  if (!selectedOption.value) return
  emit('confirm', selectedOption.value)
  emit('close')
}
</script>

<style scoped lang="scss">
.checklist-picker-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
}

.checklist-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.close-btn,
.header-placeholder {
  width: 96rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.close-btn {
  font-size: 44rpx;
  color: #999;
}

.checklist-picker-title {
  flex: 1;
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
}

.checklist-picker-body {
  flex: 1;
  min-height: 0;
  padding: 24rpx 32rpx 0;
}

.options-scroll {
  height: 100%;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 28rpx 8rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.option-row.selected {
  background: #f0fdf4;
}

.option-main {
  flex: 1;
  min-width: 0;
}

.option-name {
  font-size: 30rpx;
  color: #0f172a;
  word-break: break-all;
}

.option-check {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid #cbd5e1;
  background: #fff;
  position: relative;
  flex-shrink: 0;
}

.option-check.checked {
  border-color: #03ae4f;
  background: #03ae4f;
}

.option-check.checked::after {
  content: '';
  position: absolute;
  left: 11rpx;
  top: 6rpx;
  width: 8rpx;
  height: 16rpx;
  border: solid #fff;
  border-width: 0 3rpx 3rpx 0;
  transform: rotate(45deg);
}

.state-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
}

.state-text {
  font-size: 28rpx;
  color: #94a3b8;
}

.loading-spinner {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  border: 6rpx solid #dcfce7;
  border-top-color: #03ae4f;
  animation: checklist-spin 0.8s linear infinite;
}

.checklist-picker-footer {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
}

.footer-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 500;
}

.footer-btn.cancel {
  background: #f5f5f5;
  color: #64748b;
}

.footer-btn.confirm {
  background: #03ae4f;
  color: #fff;
}

.footer-btn.disabled {
  opacity: 0.5;
  pointer-events: none;
}

@keyframes checklist-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
