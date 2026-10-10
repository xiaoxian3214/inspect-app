<template>
  <view class="tab-content">
    <template v-if="isMergedMode">
      <!-- 卡片1：合并验货，展开后显示公共字段 + 子项汇总表 -->
      <view class="info-card merge-item-card">
        <view class="merge-item-header" @click="mergedExpanded = !mergedExpanded">
          <text class="expand-icon">{{ mergedExpanded ? '⌄' : '›' }}</text>
          <view class="merge-item-meta">
            <view class="merge-item-title">{{ t('合并验货') }}</view>
            <view class="merge-item-sub">{{ t('单号：') }}{{ mergedNo }}</view>
          </view>
        </view>

        <view v-if="mergedExpanded" class="merge-item-content">
          <view class="sub-info-card">
            <view v-for="field in mergedCommonFields" :key="field.label" class="info-row">
              <text class="label">{{ field.label }}</text>
              <text class="value">{{ formatField(currentPlan, field) }}</text>
            </view>
          </view>

          <table class="merge-table">
            <thead>
              <tr>
                <th class="col-name">{{ t('订单号-款号-款名') }}</th>
                <th class="col-num">{{ t('总数量') }}</th>
                <th class="col-num">{{ t('样品数量') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in mergedRows" :key="getRowKey(row, idx)">
                <td class="col-name">{{ getMergeRowName(row, idx) }}</td>
                <td class="col-num">{{ getValue(row.requiredQuantity, '-') }}</td>
                <td class="col-num">{{ getValue(row.sampleSize, '-') }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td class="col-name">{{ t('所有') }}</td>
                <td class="col-num">{{ mergedTotalQuantity }}</td>
                <td class="col-num">{{ mergedTotalSample }}</td>
              </tr>
            </tfoot>
          </table>
        </view>
      </view>

      <!-- 卡片2…N：每个子项独立可折叠，展开显示该项详情 -->
      <view
        v-for="(row, idx) in mergedRows"
        :key="getRowKey(row, idx)"
        class="info-card merge-item-card"
      >
        <view class="merge-item-header" @click="toggleMergeItem(row, idx)">
          <text class="expand-icon">{{ isMergeItemExpanded(row, idx) ? '⌄' : '›' }}</text>
          <view class="merge-item-meta">
            <view class="merge-item-title">{{ getMergeItemTitle(row, idx) }}</view>
            <view class="merge-item-sub">{{ t('单号：') }}{{ getMergeItemNo(row) }}</view>
            <view class="merge-item-sub">{{ t('产品：') }}{{ getMergeItemProduct(row) }}</view>
          </view>
        </view>

        <view v-if="isMergeItemExpanded(row, idx)" class="merge-item-content">
          <view class="sub-info-card">
            <view v-for="field in detailFields" :key="field.label" class="info-row">
              <text class="label">{{ field.label }}</text>
              <text class="value">{{ formatField(row, field) }}</text>
            </view>
          </view>
        </view>
      </view>
    </template>

    <template v-else>
      <view class="info-card">
        <view v-for="field in detailFields" :key="field.label" class="info-row">
          <text class="label">{{ field.label }}</text>
          <text class="value">{{ formatField(currentPlan, field) }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  planData: {
    type: Object,
    default: () => ({})
  }
})

const mergedExpanded = ref(true)
const expandedMergeItems = ref({})
const { t } = useI18n()

const mergedCommonFields = computed(() => ([
  { label: t('产品名称'), key: 'goodsName', fallback: '-' },
  { label: t('总数量'), key: 'requiredQuantity', fallback: 0 },
  { label: t('样品数量'), key: 'sampleSize', fallback: 0 },
  { label: t('供应商名称'), key: 'factoryName', fallback: '-' },
  { label: t('计划日期'), key: 'deliveryDate', fallback: '-' },
  { label: t('抽样标准'), key: 'inspectionLevel', fallback: '-' },
  { label: t('验货类型'), key: 'inspectType', fallback: '-' },
  { label: t('客户名称'), key: 'clientName', fallback: '-' },
  { label: t('客户编号'), key: 'clientNo', fallback: '-' },
]))

const mergedTotalQuantity = computed(() =>
  mergedRows.value.reduce((s, r) => s + (Number(r.requiredQuantity) || 0), 0)
)

const mergedTotalSample = computed(() =>
  mergedRows.value.reduce((s, r) => s + (Number(r.sampleSize) || 0), 0)
)

const currentPlan = computed(() => {
  const data = props.planData || {}
  return data.plan && typeof data.plan === 'object' ? data.plan : data
})

const isMergedMode = computed(() => Number(currentPlan.value?.mergeType || 0) === 2)

const mergedRows = computed(() => {
  const rows = props.planData?.inspectionPlans
  if (Array.isArray(rows) && rows.length) return rows
  return currentPlan.value ? [currentPlan.value] : []
})

const mergedNo = computed(() => {
  const p = currentPlan.value || {}
  return p.parentPlanId || p.planNo || p.clientOrderNo || '-'
})


const detailFields = computed(() => ([
  { label: t('产品名称'), key: 'goodsName', fallback: '-' },
  { label: t('需验数量'), key: 'requiredQuantity', fallback: 0, suffix: t(' 件') },
  { label: t('样品数量'), key: 'sampleSize', fallback: 0, suffix: t(' 件') },
  { label: t('供应商名称'), key: 'factoryName', fallback: '-' },
  { label: t('交货日期'), key: 'deliveryDate', fallback: '-' },
  { label: t('清单'), key: 'templateName', fallback: '-' },
  { label: t('验货类型'), key: 'inspectType', fallback: '-' },
  { label: t('抽样标准'), key: 'inspectionLevel', fallback: '-' },
  { label: t('供应商编号'), key: 'factoryNo', fallback: '-' },
  { label: t('客户名称'), key: 'clientName', fallback: '-' },
  { label: t('客户编号'), key: 'clientNo', fallback: '-' },
  { label: t('货号'), key: 'subGoodsNo', fallback: '-' },
  { label: t('客户订单号'), key: 'clientOrderNo', fallback: '-' },
  { label: t('采购合同号'), key: 'domeNo', fallback: '-' },
  { label: t('制造令'), key: 'produceNo', fallback: '-' },
  { label: t('模具色卡号'), key: 'modelNo', fallback: '-' },
  { label: t('批次'), key: 'batchNo', fallback: '-' },
  { label: t('验货员'), key: 'inspectorName', fallback: '-' },
  // { label: 'Critical AQL', type: 'aql', prefix: 'critical' },
  // { label: 'Major AQL', type: 'aql', prefix: 'major' },
  // { label: 'Minor AQL', type: 'aql', prefix: 'minor' }
]))

function getRowKey(row, idx) {
  return String(row?.id || row?.planId || row?.reportId || idx)
}

function getValue(value, fallback = '-') {
  if (value === 0) return 0
  if (value === null || value === undefined || value === '') return fallback
  return value
}

function formatField(plan, field) {
  if (field.type === 'aql') {
    const p = field.prefix
    const aql = getValue(plan?.[`${p}Aql`], 0)
    const ac = getValue(plan?.[`${p}Ac`], '-')
    const re = getValue(plan?.[`${p}Re`], '-')
    return `${aql} (AC: ${ac}, RE: ${re})`
  }
  if (field.key === 'inspectionLevel') {
    const base = getValue(plan?.inspectionLevel, field.fallback ?? '-')
    const critical = getValue(plan?.criticalAql, '-')
    const major = getValue(plan?.majorAql, '-')
    const minor = getValue(plan?.minorAql, '-')
    return `${base} ${critical}/${major}/${minor}`
  }
  const base = getValue(plan?.[field.key], field.fallback ?? '-')
  return `${base}${field.suffix || ''}`
}

function toggleMergeItem(row, idx) {
  const key = getRowKey(row, idx)
  expandedMergeItems.value[key] = !expandedMergeItems.value[key]
}

function isMergeItemExpanded(row, idx) {
  return !!expandedMergeItems.value[getRowKey(row, idx)]
}

function getMergeItemTitle(row, idx) {
  return getValue(row?.goodsName, t('验货项 {index}', { index: idx + 1 }))
}

function getMergeItemNo(row) {
  return getValue(row?.clientOrderNo || row?.planNo, '-')
}

function getMergeItemProduct(row) {
  const subNo = getValue(row?.subGoodsNo, '-')
  const batchNo = getValue(row?.batchNo, '-')
  return `${subNo}#${batchNo}`
}

function getMergeRowName(row, idx) {
  const planNo = getValue(row?.planNo || row?.clientOrderNo, `#${idx + 1}`)
  const subNo = getValue(row?.subGoodsNo, '')
  const name = getValue(row?.goodsName, '')
  return [planNo, subNo, name].filter(Boolean).join('-')
}
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

.info-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 8rpx 30rpx;
  margin-bottom: 24rpx;
}

.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 24rpx;
  padding-bottom: 20rpx;
  border-bottom: 4rpx solid #f1f5f9;
}

.no-border {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.merged-card {
  padding: 24rpx 30rpx;
}

.merge-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  cursor: pointer;
}

.expand-icon {
  width: 36rpx;
  color: #03ae4f;
  font-size: 30rpx;
  text-align: center;
  flex-shrink: 0;
}

.merge-meta {
  flex: 1;
}

.merge-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e293b;
}

.merge-no {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #64748b;
}

.merge-item-card {
  padding: 24rpx 30rpx;
}

.merge-item-header {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  cursor: pointer;
}

.merge-item-meta {
  flex: 1;
}

.merge-item-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.3;
}

.merge-item-sub {
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #64748b;
}

.merge-item-content {
  margin-top: 20rpx;
}

.sub-info-card {
  background: #f8fafc;
  border-radius: 20rpx;
  padding: 8rpx 24rpx;
}

.merge-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20rpx;
  font-size: 24rpx;

  th, td {
    padding: 16rpx 8rpx;
    text-align: left;
    border-bottom: 2rpx solid #f1f5f9;
    color: #1e293b;
    vertical-align: top;
  }

  th {
    font-weight: 600;
    color: #64748b;
    font-size: 22rpx;
  }

  .col-num {
    text-align: right;
    width: 112rpx;
    white-space: nowrap;
  }

  .col-name {
    word-break: break-all;
  }
}

.total-row {
  td {
    font-weight: 700;
    border-bottom: none;
    padding-top: 20rpx;
  }
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f1f5f9;
}

.info-row:last-child {
  border-bottom: none;
}

.label {
  font-size: 26rpx;
  color: #64748b;
  font-weight: 500;
}

.value {
  font-size: 26rpx;
  color: #1e293b;
  font-weight: 600;
  text-align: right;
  max-width: 60%;
  word-break: break-word;
}
</style>
