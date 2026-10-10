<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="280"
    class="copy-items-popup"
    :style="{ height: '85vh', width: '100%' }"
    @click-overlay="handleClose"
  >
    <view class="copy-items-modal">
      <view v-if="submitting" class="copy-loading-overlay">
        <view class="copy-loading-spinner"></view>
        <text class="copy-loading-text">{{ t('正在复制中...') }}</text>
      </view>
      <view class="copy-items-header">
        <view class="close-btn" @click.stop="handleClose">✕</view>
        <text class="copy-items-title">{{ t('复制检查点到其他验货') }}</text>
        <text class="step-indicator">{{ currentStep }}/3</text>
      </view>

      <!-- Step 1: 选择复制内容 -->
      <view v-if="currentStep === 1" class="copy-items-body">
        <view class="step-title">{{ t('选择需要复制的信息') }}</view>
        <view class="select-all-row" @click="toggleSelectAllFields">
          <view class="checkbox" :class="{ checked: isAllFieldsSelected }"></view>
          <text class="select-all-text">{{ t('全选') }}</text>
        </view>
        <view class="option-list">
          <view
            v-for="field in fieldOptions"
            :key="field.key"
            class="option-item"
            :class="{ disabled: !field.available }"
            @click="field.available && toggleField(field.key)"
          >
            <view class="checkbox" :class="{ checked: copyFlags[field.key] && field.available }"></view>
            <view class="option-text-wrap">
              <text class="option-text">{{ field.label }}</text>
              <text v-if="!field.available" class="option-hint">{{ t('不适用于当前类型') }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Step 2: 选择目标单据 -->
      <view v-if="currentStep === 2" class="copy-items-body">
        <view class="step-title">{{ t('选择目标单据') }}</view>
        <scroll-view scroll-y class="plan-list-scroll">
          <view v-if="loadingPlans" class="empty-hint">
            <text>{{ t('加载中...') }}</text>
          </view>
          <view v-else-if="!eligiblePlans.length" class="empty-hint">
            <text>{{ t('暂无可选的验货单据') }}</text>
          </view>
          <view
            v-for="plan in eligiblePlans"
            :key="plan.planId"
            class="plan-item"
            :class="{ selected: selectedPlanIds.includes(plan.planId) }"
            @click="togglePlan(plan.planId)"
          >
            <view class="checkbox" :class="{ checked: selectedPlanIds.includes(plan.planId) }"></view>
            <view class="plan-item-info">
              <text class="plan-item-no">{{ plan.clientOrderNo }} <text v-if="formatPlanExtra(plan)" class="plan-item-sub">（{{ formatPlanExtra(plan) }}）</text></text>
              <text v-if="plan.subGoodsNo || plan.batchNo" class="plan-item-sub">{{ plan.subGoodsNo }}{{ plan.subGoodsNo && plan.batchNo ? '#' : '' }}{{ plan.batchNo }}</text>
              <text class="plan-item-sub">{{ plan.goodsName || plan.clientName || '' }}</text>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- Step 3: 选择检查项 -->
      <view v-if="currentStep === 3" class="copy-items-body">
        <view class="step-title">{{ t('选择要复制的检查项') }}</view>
        <scroll-view scroll-y class="items-list-scroll">
          <!-- 相同类型、检查点和标题 -->
          <view v-if="exactMatchItems.length" class="items-group">
            <view class="items-group-header">
              <text class="items-group-title">{{ t('相同的检查点类型、检查点和标题') }}</text>
            </view>
            <view class="current-item-tag">
              <text class="current-item-label">{{ t('当前检查项：{name}', { name: currentItemName }) }}</text>
            </view>
            <view class="select-all-row" @click="toggleGroupAll('exact')">
              <view class="checkbox" :class="{ checked: isExactGroupAllSelected }"></view>
              <text class="select-all-text">{{ t('全选/全不选') }}</text>
            </view>
            <view
              v-for="item in exactMatchItems"
              :key="item.id"
              class="check-item-row"
              @click="toggleItem(item.id)"
            >
              <view class="checkbox" :class="{ checked: selectedItemIds.includes(item.id) }"></view>
              <view class="check-item-info">
                <text class="check-item-name">{{ item.itemName }}</text>
                <text class="check-item-type">{{ item.itemType }}</text>
              </view>
            </view>
          </view>

          <!-- 仅相同类型 -->
          <view v-if="typeOnlyMatchItems.length" class="items-group">
            <view class="items-group-header">
              <text class="items-group-title">{{ t('相同的检查点类型') }}</text>
            </view>
            <view class="select-all-row" @click="toggleGroupAll('typeOnly')">
              <view class="checkbox" :class="{ checked: isTypeOnlyGroupAllSelected }"></view>
              <text class="select-all-text">{{ t('全选/全不选') }}</text>
            </view>
            <view
              v-for="item in typeOnlyMatchItems"
              :key="item.id"
              class="check-item-row"
              @click="toggleItem(item.id)"
            >
              <view class="checkbox" :class="{ checked: selectedItemIds.includes(item.id) }"></view>
              <view class="check-item-info">
                <text class="check-item-name">{{ item.itemName }}</text>
                <text class="check-item-type">{{ item.itemType }}</text>
              </view>
            </view>
          </view>

          <view v-if="!exactMatchItems.length && !typeOnlyMatchItems.length" class="empty-hint">
            <text>{{ t('没有找到可匹配的检查项') }}</text>
          </view>
        </scroll-view>
      </view>

      <view class="copy-items-footer">
        <AppButton v-if="currentStep > 1" class="footer-btn back" @click="prevStep">{{ t('上一步') }}</AppButton>
        <AppButton
          v-if="currentStep < 3"
          class="footer-btn next"
          :class="{ disabled: !canNext }"
          @click="nextStep"
        >{{ t('下一步') }}</AppButton>
        <AppButton
          v-if="currentStep === 3"
          class="footer-btn submit"
          :class="{ disabled: !canSubmit || submitting }"
          @click="handleSubmit"
        >{{ submitting ? t('复制中...') : t('开始复制') }}</AppButton>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { Popup } from 'vant'
import { searchPlans, copyCheckItems } from '../../../api/plan.js'
import { useAuthStore } from '../../../store/auth.js'
import { useUserStore } from '../../../store/user.js'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  sourcePlanId: { type: String, default: '' },
  sourceItemId: { type: String, default: '' },
  checklistItems: { type: Array, default: () => [] },
  currentItemId: { type: String, default: '' },
  currentItemType: { type: String, default: '' },
  currentItemName: { type: String, default: '' }
})

const emit = defineEmits(['close', 'copied'])

const { t } = useI18n()

const authStore = useAuthStore()
const userStore = useUserStore()
const currentStep = ref(1)
const selectedPlanIds = ref([])
const selectedItemIds = ref([])
const eligiblePlans = ref([])
const submitting = ref(false)

const copyFlags = reactive({
  photos: true,
  status: true,
  specs: true,
  text: true,
  barcode: true,
  remarks: true
})

const ALL_FIELDS = ['photos', 'status', 'specs', 'text', 'barcode', 'remarks']

const FIELD_LABELS = {
  photos: '照片和视频',
  status: '状态',
  specs: '规格',
  text: '文本',
  barcode: '条码',
  remarks: '评论'
}

const TYPE_FIELD_MAP = {
  Standard:     ['photos', 'status', 'remarks'],
  Measurements: ['photos', 'status', 'specs', 'remarks'],
  Text:         ['photos', 'status', 'text', 'remarks'],
  Barcodes:     ['photos', 'status', 'barcode', 'remarks']
}

const availableFields = computed(() => {
  const t = props.currentItemType
  return TYPE_FIELD_MAP[t] || ALL_FIELDS
})

const fieldOptions = computed(() =>
  ALL_FIELDS.map(key => ({
    key,
    label: t(FIELD_LABELS[key]),
    available: availableFields.value.includes(key)
  }))
)

const isAllFieldsSelected = computed(() => availableFields.value.every(f => copyFlags[f]))
const hasAnyFieldSelected = computed(() => availableFields.value.some(f => copyFlags[f]))

const currentItemObj = computed(() => {
  if (!props.currentItemId) return null
  return props.checklistItems.find(item => item.id === props.currentItemId) || null
})

const exactMatchItems = computed(() => {
  if (!props.currentItemType) return props.checklistItems
  const others = props.checklistItems.filter(item =>
    item.id !== props.currentItemId &&
    item.itemType === props.currentItemType &&
    item.itemName === props.currentItemName
  )
  if (currentItemObj.value) {
    return [currentItemObj.value, ...others]
  }
  return others
})

const typeOnlyMatchItems = computed(() => {
  if (!props.currentItemType) return []
  return props.checklistItems.filter(item =>
    item.id !== props.currentItemId &&
    item.itemType === props.currentItemType &&
    item.itemName !== props.currentItemName
  )
})

const isExactGroupAllSelected = computed(() =>
  exactMatchItems.value.length > 0 && exactMatchItems.value.every(i => selectedItemIds.value.includes(i.id))
)

const isTypeOnlyGroupAllSelected = computed(() =>
  typeOnlyMatchItems.value.length > 0 && typeOnlyMatchItems.value.every(i => selectedItemIds.value.includes(i.id))
)

const canNext = computed(() => {
  if (currentStep.value === 1) return hasAnyFieldSelected.value
  if (currentStep.value === 2) return selectedPlanIds.value.length > 0
  return true
})

const canSubmit = computed(() => selectedItemIds.value.length > 0)

watch(() => props.visible, async (val) => {
  if (val) {
    currentStep.value = 1
    selectedPlanIds.value = []
    selectedItemIds.value = []
    submitting.value = false
    ALL_FIELDS.forEach(f => { copyFlags[f] = availableFields.value.includes(f) })
    await loadEligiblePlans()
  }
})

const loadingPlans = ref(false)

async function loadEligiblePlans() {
  loadingPlans.value = true
  try {
    const currentUserId = authStore.user?.userId || userStore.userId || ''
    const result = await searchPlans({
      inspectorId: currentUserId ? String(currentUserId) : undefined,
      status: '0,1',
      lockFlag: 1,
      mergeType: 0
    }, 1, 200)
    const records = Array.isArray(result?.records) ? result.records : []
    eligiblePlans.value = records.filter(p => {
      const id = String(p.id || p.planId || '')
      return id !== props.sourcePlanId
    }).map(p => ({
      planId: String(p.id || p.planId || ''),
      clientOrderNo: p.clientOrderNo || '',
      clientName: p.clientName || '',
      inspectorName: p.inspectorName || '',
      goodsName: p.goodsName  || '',
      subGoodsNo: p.subGoodsNo || '',
      batchNo: p.batchNo || '',
      goodsFlag: p.goodsFlag,
      domeNo: p.domeNo || '',
      produceNo: p.produceNo || '',
      modelNo: p.modelNo || ''
    }))
  } catch (error) {
    console.error('加载可选计划失败:', error)
    eligiblePlans.value = []
  } finally {
    loadingPlans.value = false
  }
}

function toggleSelectAllFields() {
  const newVal = !isAllFieldsSelected.value
  ALL_FIELDS.forEach(f => {
    copyFlags[f] = newVal && availableFields.value.includes(f)
  })
}

function toggleField(field) {
  copyFlags[field] = !copyFlags[field]
}

function formatPlanExtra(plan) {
  if (plan.goodsFlag == 1) return plan.domeNo || ''
  return [plan.produceNo, plan.modelNo].filter(Boolean).join(' ')
}

function togglePlan(planId) {
  const idx = selectedPlanIds.value.indexOf(planId)
  if (idx >= 0) {
    selectedPlanIds.value.splice(idx, 1)
  } else {
    selectedPlanIds.value.push(planId)
  }
}

function toggleItem(itemId) {
  const idx = selectedItemIds.value.indexOf(itemId)
  if (idx >= 0) {
    selectedItemIds.value.splice(idx, 1)
  } else {
    selectedItemIds.value.push(itemId)
  }
}

function toggleGroupAll(group) {
  const items = group === 'exact' ? exactMatchItems.value : typeOnlyMatchItems.value
  const allSelected = items.every(i => selectedItemIds.value.includes(i.id))
  if (allSelected) {
    const ids = items.map(i => i.id)
    selectedItemIds.value = selectedItemIds.value.filter(id => !ids.includes(id))
  } else {
    const existing = new Set(selectedItemIds.value)
    items.forEach(i => existing.add(i.id))
    selectedItemIds.value = [...existing]
  }
}

function nextStep() {
  if (!canNext.value) return
  if (currentStep.value === 2) {
    selectedItemIds.value = exactMatchItems.value.map(i => i.id)
  }
  if (currentStep.value < 3) currentStep.value++
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

async function handleSubmit() {
  if (submitting.value || !canSubmit.value) return
  submitting.value = true
  try {
    await copyCheckItems({
      sourcePlanId: props.sourcePlanId,
      sourceItemId: props.sourceItemId || props.currentItemId,
      targetItemIds: selectedItemIds.value,
      targetPlanIds: selectedPlanIds.value,
      copyPhotos: copyFlags.photos,
      copyStatus: copyFlags.status,
      copySpecs: copyFlags.specs,
      copyText: copyFlags.text,
      copyBarcode: copyFlags.barcode,
      copyRemarks: copyFlags.remarks
    })
    globalThis.showToast(t('复制成功'))
    emit('copied', selectedPlanIds.value)
    emit('close')
  } catch (error) {
    console.error('复制检查点失败:', error)
    globalThis.showToast(error.message || t('复制失败'))
  } finally {
    submitting.value = false
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped lang="scss">
.copy-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
}

.copy-loading-spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid #e5e7eb;
  border-top-color: #1a5f3f;
  border-radius: 50%;
  animation: copy-spin 0.8s linear infinite;
}

@keyframes copy-spin {
  to { transform: rotate(360deg); }
}

.copy-loading-text {
  font-size: 28rpx;
  color: #1a5f3f;
  font-weight: 500;
}

.copy-items-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  overflow: hidden;
  position: relative;
}

.copy-items-header {
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

  .copy-items-title {
    font-size: 32rpx;
    font-weight: 600;
    color: #1a1a1a;
  }

  .step-indicator {
    font-size: 26rpx;
    color: #999;
    padding: 8rpx 16rpx;
  }
}

.copy-items-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 32rpx;
}

.step-title {
  font-size: 30rpx;
  font-weight: 500;
  color: #333;
  margin-bottom: 32rpx;
}

.select-all-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  margin-bottom: 16rpx;

  .select-all-text {
    font-size: 28rpx;
    color: #666;
  }
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 16rpx;
  border-radius: 12rpx;
  background: #f9f9f9;

  &.disabled {
    opacity: 0.45;
    pointer-events: none;
    background: #f5f5f5;
  }

  .option-text-wrap {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  .option-text {
    font-size: 28rpx;
    color: #333;
  }

  .option-hint {
    font-size: 22rpx;
    color: #bbb;
  }
}

.checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 3rpx solid #ccc;
  border-radius: 6rpx;
  flex-shrink: 0;
  position: relative;

  &.checked {
    background: #1a5f3f;
    border-color: #1a5f3f;

    &::after {
      content: '';
      position: absolute;
      left: 10rpx;
      top: 4rpx;
      width: 12rpx;
      height: 20rpx;
      border: solid #fff;
      border-width: 0 3rpx 3rpx 0;
      transform: rotate(45deg);
    }
  }
}

.plan-list-scroll {
  height: 100%;
}

.plan-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 16rpx;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  background: #f9f9f9;
  transition: background 0.2s;

  &.selected {
    background: #e8f5ee;
  }

  .plan-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    overflow: hidden;
  }

  .plan-item-no {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-item-sub {
    font-size: 24rpx;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-item-extra {
    font-size: 22rpx;
    color: #1677ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.items-list-scroll {
  height: 100%;
}

.items-group {
  margin-bottom: 32rpx;
}

.items-group-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
  margin-bottom: 12rpx;

  .items-group-title {
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
  }
}

.current-item-tag {
  padding: 16rpx 16rpx;
  margin-bottom: 12rpx;
  background: #e8f5ee;
  border-radius: 8rpx;
  border-left: 6rpx solid #1a5f3f;

  .current-item-label {
    font-size: 26rpx;
    color: #1a5f3f;
    font-weight: 500;
  }
}

.check-item-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 16rpx;
  border-radius: 12rpx;
  margin-bottom: 8rpx;
  background: #f9f9f9;

  .check-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    overflow: hidden;
  }

  .check-item-name {
    font-size: 28rpx;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .check-item-type {
    font-size: 24rpx;
    color: #999;
  }
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80rpx 0;
  color: #999;
  font-size: 28rpx;
}

.copy-items-footer {
  display: flex;
  flex-shrink: 0;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;

  .footer-btn {
    flex: 1;
    height: 80rpx;
    border-radius: 12rpx;
    font-size: 28rpx;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;

    &.back {
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
}
</style>
