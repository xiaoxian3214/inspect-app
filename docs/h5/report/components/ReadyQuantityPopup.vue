<template>
  <view v-if="visible" class="ready-overlay" @click="close">
    <view class="ready-dialog" @click.stop>
      <view class="ready-title">{{ t('设置备货数量') }}</view>
      <view class="ready-body">
        <view v-if="loading" class="ready-message">{{ t('加载中...') }}</view>
        <view v-else-if="loadError" class="ready-message">
          <text>{{ loadError }}</text>
          <AppButton @click="load">{{ t('重试') }}</AppButton>
        </view>
        <view v-for="row in rows" v-else :key="row.planId" class="ready-item">
          <view class="ready-product">{{ row.productName || row.planId }}</view>
          <view class="ready-meta">{{ row.orderNo }} · {{ row.goodsNo || row.planId }}</view>
          <view class="ready-row">
            <text>{{ t('原始订单数量') }}</text>
            <text>{{ row.orderQuantity }}</text>
          </view>
          <view class="ready-row">
            <text>{{ t('新的备货数量') }}</text>
            <input v-model="row.finishQuantity" type="number" class="ready-input" :disabled="submitting" />
          </view>
        </view>
        <view v-if="saveError" class="ready-error">{{ saveError }}</view>
      </view>
      <view class="ready-actions">
        <AppButton class="ready-cancel" :disabled="submitting" @click="close">{{ t('取消') }}</AppButton>
        <AppButton class="ready-confirm" :disabled="loading || !!loadError || submitting || !rows.length" @click="save">
          {{ submitting ? t('处理中...') : t('确定') }}
        </AppButton>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getPlanDetail, searchPlans, updateFinishQuantity, getLocalPlans, savePlanToLocal } from '../../../api/plan.js'
import { useI18n } from '../../../utils/i18n.js'
import { getQuantityPlanId, getQuantityTotals, loadReadyQuantityPlans, patchReadyQuantities, saveReadyQuantities } from '../utils/readyQuantity.js'

const props = defineProps({ visible: Boolean, source: { type: Object, default: () => ({}) } })
const emit = defineEmits(['close', 'saved', 'loaded'])
const { t } = useI18n()
const rows = ref([])
const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const saveError = ref('')
let loadVersion = 0

watch(() => props.visible, visible => {
  if (visible) load()
  else loadVersion += 1
})

async function load() {
  const version = ++loadVersion
  loading.value = true
  loadError.value = ''
  saveError.value = ''
  rows.value = []
  try {
    const plans = await loadReadyQuantityPlans(props.source, { getPlanDetail, searchPlans })
    if (version !== loadVersion) return
    emit('loaded', plans)
    rows.value = plans.map(plan => {
      const totals = getQuantityTotals([plan])
      return {
        planId: getQuantityPlanId(plan),
        productName: plan.goodsName || plan.goodsCname || '',
        goodsNo: plan.subGoodsNo || plan.planNo || '',
        orderNo: plan.clientOrderNo || plan.domeNo || '',
        orderQuantity: totals.orderQuantity,
        finishQuantity: String(totals.readyQuantity),
        originalQuantity: totals.readyQuantity
      }
    })
  } catch (error) {
    if (version === loadVersion) loadError.value = t(error.message || '加载失败')
  } finally {
    if (version === loadVersion) loading.value = false
  }
}

function close() {
  if (!submitting.value) emit('close')
}

async function save() {
  if (loading.value || submitting.value || loadError.value || !rows.value.length) return
  submitting.value = true
  saveError.value = ''
  try {
    await saveReadyQuantities(rows.value, updateFinishQuantity, async changes => {
      emit('saved', changes)
      const localPlans = await getLocalPlans()
      const changedIds = new Set(changes.map(change => change.planId))
      for (const localPlan of localPlans) {
        if (changedIds.has(getQuantityPlanId(localPlan)) || localPlan.inspectionPlans?.some(plan => changedIds.has(getQuantityPlanId(plan)))) {
          await savePlanToLocal(patchReadyQuantities(localPlan, changes))
        }
      }
      for (const change of changes) {
        const row = rows.value.find(item => item.planId === change.planId)
        if (row) row.originalQuantity = change.finishQuantity
      }
    })
    globalThis.showToast(t('完工数量已更新'))
    emit('close')
  } catch (error) {
    saveError.value = t(error.message || '修改完工数量失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.ready-overlay { position: fixed; inset: 0; z-index: 12000; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 24rpx; }
.ready-dialog { width: 660rpx; max-width: 100%; max-height: 85vh; background: #fff; border-radius: 20rpx; display: flex; flex-direction: column; overflow: hidden; }
.ready-title { padding: 30rpx; font-size: 32rpx; font-weight: 600; border-bottom: 1rpx solid #eee; }
.ready-body { padding: 0 28rpx; overflow-y: auto; min-height: 0; }
.ready-item { padding: 24rpx 0; border-bottom: 1rpx solid #eee; }
.ready-product { font-size: 28rpx; font-weight: 600; overflow-wrap: anywhere; }
.ready-meta { color: #777; font-size: 24rpx; margin-top: 10rpx; overflow-wrap: anywhere; }
.ready-row { display: flex; justify-content: space-between; align-items: center; gap: 20rpx; margin-top: 20rpx; font-size: 28rpx; }
.ready-input { width: 190rpx; height: 72rpx; flex-shrink: 0; border: 1rpx solid #ddd; border-radius: 8rpx; padding: 0 16rpx; text-align: right; }
.ready-message { padding: 32rpx 0; text-align: center; }
.ready-error { color: #d93025; padding: 20rpx 0; font-size: 26rpx; }
.ready-actions { display: flex; gap: 20rpx; padding: 24rpx; }
.ready-cancel, .ready-confirm { flex: 1; min-height: 80rpx; border-radius: 10rpx; background: #f3f4f6; }
.ready-confirm { color: #fff; background: #1677ff; }
</style>
