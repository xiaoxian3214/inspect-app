<template>
  <view>
    <view v-if="showSupplierRow" class="supplier-row">
      <text class="supplier-name">{{ displaySupplierName }}</text>
      <text class="order-date" @longpress.stop="copyFieldValue(detailOrderNo, t('订单号'))">{{ displayOrderDate }}</text>
    </view>
    <view class="inspection-card" @click="handleCardClick">
      <view class="card-left">
        <view
          class="download-icon-wrapper"
          :class="resolvedDownloadState"
        >
          <svg v-if="resolvedDownloadState === 'locked'" width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M7 10V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7V10" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            <rect x="5" y="10" width="14" height="11" rx="2" fill="#fff"/>
            <circle cx="12" cy="15" r="1.5" fill="#9ca3af"/>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 15L7 10H11V3H13V10H17L12 15Z" fill="#fff"/>
            <path d="M20 18H4V20H20V18Z" fill="#fff"/>
          </svg>
        </view>

        <view class="product-image">
          <text class="image-placeholder">📦</text>
        </view>
      </view>

      <view class="card-middle">
        <view class="product-name">{{ displayProductName }}</view>
        <view class="status-row">
           <text class="status-badge">{{ displayInspectType }}</text>
          <text class="goods-no" @longpress.stop="copyFieldValue(displayGoodsNo, t('货号'))">{{ displayGoodsNo }}</text>
          <view class="status-right">
            <text class="progress-status progress-right" :class="displayProgressClass">
              {{ displayProgressText }}
            </text>
          </view>
        </view>
        <view v-if="displayGoodsExtra.type === 'raw'" class="goods-extra-line">
          <view class="goods-extra-item goods-extra-item-produce">
            <text class="goods-extra-label">{{ t('制造令') }}：</text>
            <text class="goods-extra-value goods-extra-value-produce">{{ displayGoodsExtra.produceNo }}</text>
          </view>
          <view class="goods-extra-item goods-extra-item-produce">
            <text class="goods-extra-label">{{ t('模具色卡号') }}：</text>
            <text class="goods-extra-value">{{ displayGoodsExtra.modelNo }}</text>
          </view>
        </view>
        <view v-else-if="displayGoodsExtra.type === 'finished'" class="goods-extra-line">
          <view class="goods-extra-item">
            <text class="goods-extra-label">{{ t('采购合同号') }}：</text>
            <text class="goods-extra-value" @longpress.stop="copyFieldValue(displayGoodsExtra.domeNo, t('采购合同号'))">{{ displayGoodsExtra.domeNo }}</text>
          </view>
        </view>
      </view>

      <view class="card-right">
        <text v-if="showMergeFlag && isMerged" class="merge-flag" :aria-label="t('合并计划')">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 7H9L13 12L17 17H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 17H9L11 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20 17L17.5 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20 17L17.5 19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </text>

        <view v-if="showMoreButton" class="card-more-btn" @click.stop="handleMoreClick">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="1.8" fill="#64748b"/>
            <circle cx="12" cy="12" r="1.8" fill="#64748b"/>
            <circle cx="19" cy="12" r="1.8" fill="#64748b"/>
          </svg>
        </view>

        <checkbox-group
          v-if="showMergeCheckbox"
          class="merge-check-wrapper"
          :class="{ disabled: mergeDisabled }"
          @change="handleCheckboxChange"
          @click.stop
        >
          <label class="checkbox-label">
            <checkbox
              class="merge-checkbox"
              :value="String(item.id || item.planId)"
              :checked="mergeChecked"
              :disabled="mergeDisabled"
              color="#16a34a"
            />
          </label>
        </checkbox-group>
      </view>
    </view>

    <view v-if="manageActionsInCard && showUnlockModal" class="menu-overlay" @click="closeUnlockModal">
      <view class="confirm-modal" @click.stop>
        <view class="confirm-title">{{ t('解锁验货任务') }}</view>
        <view class="confirm-content">
          {{ t('当前验货会恢复到已定计划状态。请确认您需要解锁该验货任务？') }}
        </view>
        <view class="confirm-actions">
          <AppButton class="confirm-btn cancel" @click="closeUnlockModal">{{ t('取消') }}</AppButton>
          <AppButton class="confirm-btn agree" :disabled="actionSubmitting" @click="confirmUnlock">
            {{ actionSubmitting ? t('处理中...') : t('同意') }}
          </AppButton>
        </view>
      </view>
    </view>

    <view v-if="manageActionsInCard && showResetModal" class="menu-overlay" @click="closeResetModal">
      <view class="copy-modal" @click.stop>
        <view class="copy-modal-title">{{ t('重置验货任务') }}</view>
        <view class="copy-info-card">
          <view class="copy-info-row">
            <text class="copy-label">{{ t('订单号') }}</text>
            <text class="copy-value">{{ detailOrderNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('款号') }}</text>
            <text class="copy-value">{{ detailSubGoodsNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('产品名称') }}</text>
            <text class="copy-value">{{ detailProductDesc }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('总数量') }}</text>
            <text class="copy-value">{{ detailQuantity }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('样品数量') }}</text>
            <text class="copy-value">{{ detailSampleSize }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('供应商') }}</text>
            <text class="copy-value">{{ detailSupplier }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('计划日期') }}</text>
            <text class="copy-value">{{ detailPlanDate }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('检查类型') }}</text>
            <text class="copy-value">{{ detailInspectType }}</text>
          </view>
        </view>
        <view class="reset-tip">{{ t('您确定需要重置该验货任务？') }}</view>
        <view class="copy-actions">
          <AppButton class="copy-btn close" @click="closeResetModal">{{ t('取消') }}</AppButton>
          <AppButton class="copy-btn create" :disabled="actionSubmitting" @click="confirmReset">
            {{ actionSubmitting ? t('处理中...') : t('重置') }}
          </AppButton>
        </view>
      </view>
    </view>

    <view v-if="manageActionsInCard && showInspectorModal" class="menu-overlay" @click="closeInspectorModal">
      <view class="confirm-modal" @click.stop>
        <view class="confirm-title">{{ t('当前验货员') }}</view>
        <view class="confirm-content">
          <view class="copy-info-row">
            <text class="copy-label">{{ t('姓名') }}</text>
            <text class="copy-value">{{ lockedInspectorName }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('工号') }}</text>
            <text class="copy-value">{{ lockedInspectorId }}</text>
          </view>
        </view>
        <view class="confirm-actions">
          <AppButton class="confirm-btn agree" @click="closeInspectorModal">{{ t('关闭') }}</AppButton>
        </view>
      </view>
    </view>

    <view v-if="manageActionsInCard && showCopyModal" class="menu-overlay" @click="closeCopyModal">
      <view class="copy-modal" @click.stop>
        <view class="copy-modal-title">{{ copyModalTitle }}</view>

        <view v-if="copyMode === 2" class="download-merged-section">
          <view class="download-merged-title">{{ t('此合并验货包含以下验货：') }}</view>
          <view class="download-merged-table-wrap">
            <table class="download-merged-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Item</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="copyMergedPreviewLoading">
                  <td colspan="3">
                    <view class="download-preview-loading">{{ t('加载中...') }}</view>
                  </td>
                </tr>
                <tr v-for="row in copyMergedItems" v-else :key="getItemUniqueId(row)">
                  <td>{{ getItemClientOrderNo(row) }}</td>
                  <td>{{ getItemSubGoodsBatch(row) }}</td>
                  <td>{{ getItemGoodsName(row) }}</td>
                </tr>
              </tbody>
            </table>
          </view>
        </view>

        <view v-else class="copy-info-card">
          <view class="copy-info-row">
            <text class="copy-label">{{ t('订单号') }}</text>
            <text class="copy-value">{{ detailOrderNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('款号') }}</text>
            <text class="copy-value">{{ detailSubGoodsNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('产品名称') }}</text>
            <text class="copy-value">{{ detailProductDesc }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('总数量') }}</text>
            <text class="copy-value">{{ detailQuantity }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('样品数量') }}</text>
            <text class="copy-value">{{ detailSampleSize }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('供应商') }}</text>
            <text class="copy-value">{{ detailSupplier }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('计划日期') }}</text>
            <text class="copy-value">{{ detailPlanDate }}</text>
          </view>
        </view>

        <view class="copy-field">
          <view class="copy-field-label">{{ t('清单') }}</view>
          <view class="copy-field-select" @click="openChecklistPicker('copy')">
            <text class="copy-field-select-text">{{ copyChecklistDisplayName }}</text>
            <view class="checklist-select-chevron"></view>
          </view>
        </view>

        <view class="copy-field">
          <view class="copy-field-label">{{ t('检查类型') }}</view>
          <select v-model="copyInspectTypeValue" class="copy-select">
            <option v-for="opt in copyInspectTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </view>

        <view class="copy-actions">
          <AppButton class="copy-btn close" @click="closeCopyModal">{{ t('关闭') }}</AppButton>
          <AppButton
            class="copy-btn create"
            :disabled="actionSubmitting"
            @click="copyCreatedSuccess ? downloadCopiedInspection() : createCopyInspection()"
          >
            {{ actionSubmitting ? t('处理中...') : (copyCreatedSuccess ? t('下载') : copyModalActionText) }}
          </AppButton>
        </view>
        <view v-if="copyCreatedSuccess" class="copy-created-tip">
          {{ copyCreatedTip }}
        </view>
      </view>
    </view>

    <view v-if="manageActionsInCard && showDownloadModal" class="menu-overlay" @click="closeDownloadModal">
      <view class="copy-modal" @click.stop>
        <view class="copy-modal-title">{{ t('下载验货') }}</view>

        <view v-if="isMergedDownloadTarget" class="download-merged-section">
          <view class="download-merged-title">{{ t('此合并验货包含以下验货：') }}</view>
          <view class="download-merged-table-wrap">
            <table class="download-merged-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Item</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="downloadPreviewLoading">
                  <td colspan="3">
                    <view class="download-preview-loading">{{ t('加载中...') }}</view>
                  </td>
                </tr>
                <tr v-for="row in downloadMergedItems" v-else :key="getItemUniqueId(row)">
                  <td>{{ getItemClientOrderNo(row) }}</td>
                  <td>{{ getItemSubGoodsBatch(row) }}</td>
                  <td>{{ getItemGoodsName(row) }}</td>
                </tr>
              </tbody>
            </table>
          </view>

          <view class="download-summary-row">
            <text class="download-summary-label">{{ t('供应商') }}</text>
            <text class="download-summary-value">{{ detailSupplier }}</text>
          </view>
          <view class="download-summary-row">
            <text class="download-summary-label">{{ t('检查类型') }}</text>
            <text class="download-summary-value">{{ detailInspectType }}</text>
          </view>
          <view class="download-summary-row download-summary-row-clickable" @click="openChecklistPicker('download')">
            <text class="download-summary-label">{{ t('清单') }}</text>
            <view class="checklist-select-value-wrap">
              <text class="download-summary-value">{{ downloadChecklistDisplayName }}</text>
              <view class="checklist-select-chevron"></view>
            </view>
          </view>
        </view>

        <view v-else class="copy-info-card">
          <view class="copy-info-row">
            <text class="copy-label">{{ t('订单号') }}</text>
            <text class="copy-value">{{ detailOrderNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('款号') }}</text>
            <text class="copy-value">{{ detailSubGoodsNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('产品名称') }}</text>
            <text class="copy-value">{{ detailProductDesc }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('总数量') }}</text>
            <text class="copy-value">{{ detailQuantity }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('样品数量') }}</text>
            <text class="copy-value">{{ detailSampleSize }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('供应商') }}</text>
            <text class="copy-value">{{ detailSupplier }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('计划日期') }}</text>
            <text class="copy-value">{{ detailPlanDate }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('预计离港时间') }}</text>
            <text class="copy-value">{{ detailEtdDate }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('检查类型') }}</text>
            <text class="copy-value">{{ detailInspectType }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('批次') }}</text>
            <text class="copy-value">{{ detailBatchNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('采购合同') }}</text>
            <text class="copy-value">{{ detailDomeNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('制造令') }}</text>
            <text class="copy-value">{{ detailProduceNo }}</text>
          </view>
          <view class="copy-info-row">
            <text class="copy-label">{{ t('模具色卡号') }}</text>
            <text class="copy-value">{{ detailModelNo }}</text>
          </view>
          <view class="copy-info-row copy-info-row-clickable" @click="openChecklistPicker('download')">
            <text class="copy-label">{{ t('清单') }}</text>
            <view class="checklist-select-value-wrap">
              <text class="copy-value">{{ downloadChecklistDisplayName }}</text>
              <view class="checklist-select-chevron"></view>
            </view>
          </view>
        </view>

        <view class="copy-actions">
          <AppButton class="copy-btn close" :disabled="actionSubmitting" @click="closeDownloadModal">{{ t('取消') }}</AppButton>
          <AppButton class="copy-btn create" :disabled="actionSubmitting" @click="confirmDownloadInModal">
            {{ actionSubmitting ? t('下载中...') : t('下载') }}
          </AppButton>
        </view>
      </view>
    </view>

    <view v-if="useInternalActions && showActionSheet" class="menu-overlay" @click="closeActionSheet">
      <view class="action-menu" @click.stop>
        <view class="menu-header">{{ t('操作') }}</view>
        <AppButton
          v-if="resolvedShowActionDownload"
          class="menu-item-btn"
          :disabled="actionLoading"
          @click="emitCardAction('download')"
        >
          {{ actionLoading ? t('处理中...') : resolvedDownloadActionText }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionViewInspector"
          class="menu-item-btn"
          @click="emitCardAction('view-inspector')"
        >
          {{ t('查看当前验货员') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionUnlock"
          class="menu-item-btn"
          :disabled="actionLoading"
          @click="emitCardAction('unlock')"
        >
          {{ actionLoading ? t('处理中...') : t('解锁') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionReset"
          class="menu-item-btn"
          :disabled="actionLoading"
          @click="emitCardAction('reset')"
        >
          {{ actionLoading ? t('处理中...') : t('重置') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionCopy"
          class="menu-item-btn"
          @click="emitCardAction('copy')"
        >
          {{ t('复制当前验货') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionCopyMerged"
          class="menu-item-btn"
          @click="emitCardAction('copy-merged')"
        >
          {{ t('复制合并验货') }}
        </AppButton>
        <AppButton class="menu-item-btn" :disabled="actionLoading" @click="emitCardAction('ready-quantity')">
          {{ t('设置备货数量') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionReport || resolvedDownloadState === 'locked'"
          class="menu-item-btn"
          @click="emitCardAction('report')"
        >
          {{ t('显示报告') }}
        </AppButton>
        <AppButton
          v-if="resolvedShowActionSplit"
          class="menu-item-btn"
          :disabled="actionLoading"
          @click="emitCardAction('split')"
        >
          {{ actionLoading ? t('处理中...') : t('拆分验货') }}
        </AppButton>
        <!-- <AppButton
          class="menu-item-btn"
          :disabled="actionLoading"
          @click="openSplitByQuantityDialog"
        >
          {{ t('拆分船期') }}
        </AppButton> -->
        <AppButton class="menu-cancel" @click="closeActionSheet">{{ t('取消') }}</AppButton>
      </view>
    </view>

    <!-- 拆分船期弹窗 -->
    <view v-if="showSplitQuantityDialog" class="menu-overlay" @click="closeSplitByQuantityDialog">
      <view class="split-quantity-dialog" @click.stop>
        <view class="split-quantity-title">{{ t('拆分船期') }}</view>
        <view class="split-quantity-hint">{{ t('请输入拆分数量') }}</view>
        <input
          v-model="splitQuantityValue"
          class="split-quantity-input"
          type="number"
          :placeholder="t('请输入数量')"
        />
        <view class="split-quantity-actions">
          <AppButton class="split-quantity-btn cancel" @click="closeSplitByQuantityDialog">{{ t('取消') }}</AppButton>
          <AppButton class="split-quantity-btn confirm" :disabled="actionSubmitting" @click="confirmSplitByQuantity">{{ actionSubmitting ? t('处理中...') : t('确定') }}</AppButton>
        </view>
      </view>
    </view>

    <ReadyQuantityPopup
      :visible="showReadyQuantityPopup"
      :source="item"
      @close="closeReadyQuantityPopup"
      @saved="handleReadyQuantitiesSaved"
    />
    <ChecklistPickerPopup
      :visible="showChecklistPicker"
      :value-id="activeChecklistScene === 'copy' ? copyChecklistId : downloadChecklistId"
      :value-name="activeChecklistScene === 'copy' ? copyChecklistDisplayName : downloadChecklistDisplayName"
      :title="activeChecklistScene === 'copy' ? t('选择复制清单') : t('选择下载清单')"
      @close="closeChecklistPicker"
      @confirm="handleChecklistConfirm"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { ref } from 'vue'
import { downloadPlan as downloadPlanApi, getPlanDetail, splitDownloadDataToLocalPlans, savePlanToLocal, removePlanFromLocal, getLocalPlans, searchPlans, getInspectTypeDict, copyPlan as copyPlanApi, splitByQuantity } from '../../../api/plan.js'
import { releaseReportTask } from '../../../api/report.js'
import { useI18n } from '../../../utils/i18n.js'
import ChecklistPickerPopup from './ChecklistPickerPopup.vue'
import ReadyQuantityPopup from './ReadyQuantityPopup.vue'
import { patchReadyQuantities } from '../utils/readyQuantity.js'

const { t } = useI18n()
const showReadyQuantityPopup = ref(false)

function handleReadyQuantitiesSaved(changes) {
  Object.assign(props.item, patchReadyQuantities(props.item, changes))
}

function closeReadyQuantityPopup() {
  showReadyQuantityPopup.value = false
  emit('request-refresh')
}

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  currentUserId: {
    type: [String, Number],
    default: ''
  },
  isMerged: {
    type: Boolean,
    default: false
  },
  showMergeFlag: {
    type: Boolean,
    default: true
  },
  showMoreButton: {
    type: Boolean,
    default: true
  },
  statusKey: {
    type: String,
    default: ''
  },
  useInternalActions: {
    type: Boolean,
    default: false
  },
  manageActionsInCard: {
    type: Boolean,
    default: false
  },
  useInternalCardClick: {
    type: Boolean,
    default: false
  },
  isMergeMode: {
    type: Boolean,
    default: false
  },
  isLocalDownloaded: {
    type: Boolean,
    default: false
  },
  actionLoading: {
    type: Boolean,
    default: false
  },
  showMergeCheckbox: {
    type: Boolean,
    default: false
  },
  mergeChecked: {
    type: Boolean,
    default: false
  },
  mergeDisabled: {
    type: Boolean,
    default: false
  },
  showActionSplit: {
    type: Boolean,
    default: false
  },
  showSupplierRow: {
    type: Boolean,
    default: true
  }
})

const resolvedDownloadState = computed(() => {
  // 优先判断本地下载状态
  if (props.isLocalDownloaded) {
    return 'downloaded'
  }

  const lockFlag = Number(props.item?.plan?.lockFlag ?? props.item?.lockFlag)
  if (lockFlag !== 1) return 'available'

  const inspectorId = props.item?.plan?.inspectorId ?? props.item?.inspectorId
  const currentUserId = props.currentUserId
  const hasInspector = inspectorId !== undefined && inspectorId !== null && inspectorId !== ''
  const hasCurrentUser = currentUserId !== undefined && currentUserId !== null && currentUserId !== ''

  // lockFlag=1 且 inspectorId == 当前用户 -> 已下载
  if (hasInspector && hasCurrentUser && String(inspectorId) === String(currentUserId)) {
    return 'downloaded'
  }

  // lockFlag=1 且 inspectorId != 当前用户 -> 锁定
  if (hasInspector && hasCurrentUser && String(inspectorId) !== String(currentUserId)) {
    return 'locked'
  }

  // 在身份信息缺失场景，避免误判锁定
  return 'available'
})

function getPlan() {
  return props.item?.plan || {}
}

const displaySupplierName = computed(() => {
  const plan = getPlan()
  return plan.factoryName || props.item?.supplierName || props.item?.factoryName || '-'
})

const displayOrderDate = computed(() => {
  const plan = getPlan()
  return formatDetailDate(plan.createDate || props.item?.createdAt || props.item?.createDate)
})

const displayProductName = computed(() => {
  const plan = getPlan()
  return plan.goodsName || props.item?.productName || props.item?.goodsName || '-'
})

const displayInspectType = computed(() => {
  const plan = getPlan()
  return (plan.inspectType || props.item?.inspectType || '').substring(0, 2)
})

const displayGoodsNo = computed(() => {
  const plan = getPlan()
  const subGoodsNo = plan.subGoodsNo || props.item?.subGoodsNo || props.item?.planNo || '-'
  const goodsFlag = Number(plan.goodsFlag ?? props.item?.goodsFlag ?? props.item?.raw?.goodsFlag ?? -1)
  if (goodsFlag === 0) {
    return subGoodsNo
  }
  const batchNo = plan.batchNo || props.item?.batchNo
  return batchNo ? `${subGoodsNo}#${batchNo}` : subGoodsNo
})

const displayGoodsExtra = computed(() => {
  const plan = getPlan()
  const goodsFlag = Number(plan.goodsFlag ?? props.item?.goodsFlag ?? props.item?.raw?.goodsFlag ?? -1)
  if (goodsFlag === 0) {
    const produceNo = plan.produceNo || props.item?.produceNo || '-'
    const modelNo = plan.modelNo || props.item?.modelNo || '-'
    return {
      type: 'raw',
      produceNo,
      modelNo
    }
  }
  if (goodsFlag === 1) {
    const domeNo = plan.domeNo || props.item?.domeNo || '-'
    return {
      type: 'finished',
      domeNo
    }
  }
  return {
    type: ''
  }
})

const detailOrderNo = computed(() => {
  const plan = getPlan()
  return plan.clientOrderNo || plan.domeNo || props.item?.clientOrderNo || props.item?.domeNo || props.item?.planNo || '-'
})

const detailSubGoodsNo = computed(() => {
  const plan = getPlan()
  return plan.subGoodsNo || props.item?.subGoodsNo || '-'
})

const detailProductDesc = computed(() => {
  const plan = getPlan()
  return plan.goodsName || props.item?.productName || props.item?.goodsName || '-'
})

const detailQuantity = computed(() => {
  const plan = getPlan()
  const value = plan.requiredQuantity
    ?? props.item?.requiredQuantity
    ?? props.item?.quantity
  return value === undefined || value === null || value === '' ? '-' : value
})

const detailSampleSize = computed(() => {
  const plan = getPlan()
  const value = plan.sampleSize
    ?? props.item?.sampleSize
    ?? props.item?.sampleQty
  return value === undefined || value === null || value === '' ? '-' : value
})

const detailSupplier = computed(() => {
  const plan = getPlan()
  return plan.factoryName || props.item?.factoryName || props.item?.supplierName || '-'
})

const detailPlanDate = computed(() => {
  const plan = getPlan()
  return plan.deliveryDate || props.item?.deliveryDate|| '-'
})

const detailInspectType = computed(() => {
  const plan = getPlan()
  return plan.inspectType || props.item?.inspectType || '-'
})

const detailBatchNo = computed(() => {
  const plan = getPlan()
  return plan.batchNo || props.item?.batchNo || '-'
})

const detailDomeNo = computed(() => {
  const plan = getPlan()
  return plan.domeNo || props.item?.domeNo || '-'
})

const detailProduceNo = computed(() => {
  const plan = getPlan()
  return plan.produceNo || props.item?.produceNo || '-'
})

const detailModelNo = computed(() => {
  const plan = getPlan()
  return plan.modelNo || props.item?.modelNo || '-'
})

const detailChecklistName = computed(() => {
  const plan = getPlan()
  return plan.templateName || props.item?.templateName || '-'
})

const detailChecklistId = computed(() => {
  const plan = getPlan()
  return String(plan.templateId || props.item?.templateId || '').trim()
})

const detailEtdDate = computed(() => {
  const plan = getPlan()
  return formatDetailDate(plan.etd || plan.estimatedDepartureDate || props.item?.etd || props.item?.estimatedDepartureDate) || '-'
})

const displayProgressText = computed(() => {
  if (props.statusKey === 'planned') return t('已定计划')
  if (props.statusKey === 'progress') return t('进行中')
  if (props.statusKey === 'report') return t('报告')
  const status = normalizeStatus(props.item?.status)
  if (status === 0) return t('已定计划')
  if (status === 1 || status === 2) return t('进行中')
  if (status === 3) return t('已完成')
  return ''
})

const displayProgressClass = computed(() => {
  if (props.statusKey === 'planned') return 'planned'
  if (props.statusKey === 'progress') return 'in-progress'
  if (props.statusKey === 'report') return 'completed'
  const status = normalizeStatus(props.item?.status)
  if (status === 0) return 'planned'
  if (status === 1 || status === 2) return 'in-progress'
  if (status === 3) return 'completed'
  return 'planned'
})

const isPlannedOrProgress = computed(() => props.statusKey === 'planned' || props.statusKey === 'progress')
const isDownloadedLike = computed(() => props.isLocalDownloaded || resolvedDownloadState.value === 'downloaded')

const resolvedShowActionDownload = computed(() => {
  return resolvedDownloadState.value === 'available' && !isDownloadedLike.value
})

const resolvedShowActionViewInspector = computed(() => {
  return resolvedDownloadState.value === 'locked'
})

const resolvedShowActionUnlock = computed(() => {
  return isDownloadedLike.value && isPlannedOrProgress.value
})

const resolvedShowActionReset = computed(() => {
  return isDownloadedLike.value && isPlannedOrProgress.value
})

const resolvedShowActionCopy = computed(() => {
  return !!props.manageActionsInCard
})

const resolvedShowActionCopyMerged = computed(() => {
  return !!props.manageActionsInCard && isMergedDownloadTarget.value
})

const resolvedShowActionReport = computed(() => {
  const plan = getPlan()
  const status = props.item?.status ?? plan?.status ?? props.item?.raw?.status
  return normalizeStatus(status) === 3
})

const resolvedShowActionSplit = computed(() => {
  return !!props.showActionSplit
})

const resolvedDownloadActionText = computed(() => {
  if (resolvedDownloadState.value === 'locked') return t('已锁定')
  if (isDownloadedLike.value) return t('已下载')
  return t('下载')
})
const isMergedDownloadTarget = computed(() => getItemMergeType(props.item) === 2)

const showActionSheet = ref(false)
const showUnlockModal = ref(false)
const showResetModal = ref(false)
const showInspectorModal = ref(false)
const showCopyModal = ref(false)
const showSplitQuantityDialog = ref(false)
const splitQuantityValue = ref('')
const showDownloadModal = ref(false)
const actionSubmitting = ref(false)
const downloadPreviewLoading = ref(false)
const downloadMergedItems = ref([])
const copyMode = ref(1)
const copyMergedPreviewLoading = ref(false)
const copyMergedItems = ref([])
const showChecklistPicker = ref(false)
const activeChecklistScene = ref('download')
const downloadChecklistId = ref('')
const downloadChecklistName = ref('')
const copyChecklistId = ref('')
const copyChecklistValue = ref('')
const copyInspectTypeValue = ref('')
const inspectTypeDictOptions = ref([])
const copyCreatedSuccess = ref(false)
const copiedPlanId = ref('')

const lockedInspectorName = computed(() => {
  const plan = getPlan()
  return String(plan?.inspectorName || props.item?.inspectorName || props.item?.raw?.inspectorName || '').trim() || '-'
})

const lockedInspectorId = computed(() => {
  const plan = getPlan()
  return String(plan?.inspectorId || props.item?.inspectorId || props.item?.raw?.inspectorId || '').trim() || '-'
})

const downloadChecklistDisplayName = computed(() => {
  return downloadChecklistName.value || detailChecklistName.value
})

const copyChecklistDisplayName = computed(() => {
  return copyChecklistValue.value || detailChecklistName.value
})

const copyModalTitle = computed(() => {
  return copyMode.value === 2 ? t('复制合并验货') : t('复制当前验货')
})

const copyModalActionText = computed(() => {
  return copyMode.value === 2 ? t('复制合并的验货') : t('创建复制的验货')
})

const copyCreatedTip = computed(() => {
  if (copyMode.value === 2) {
    return t('合并验货已复制完成，您现在可以选择清单后下载新的验货任务。')
  }
  return t('该验货已被复制到新的验货，您现在可以下载新的验货任务。')
})

const copyInspectTypeOptions = computed(() => {
  const plan = getPlan()
  const options = []

  inspectTypeDictOptions.value.forEach((opt) => {
    const value = String(opt?.value || '').trim()
    const label = String(opt?.label || '').trim()
    if (!value || !label) return
    if (options.some((item) => item.value === value)) return
    options.push({ value, label })
  })

  const fromApi = Array.isArray(props.item?.inspectTypeOptions) ? props.item.inspectTypeOptions : []
  fromApi.forEach((opt) => {
    const text = String(opt || '').trim()
    if (!text) return
    if (options.some((item) => item.value === text)) return
    options.push({ value: text, label: text })
  })

  const current = plan.inspectType || props.item?.inspectType
  if (current && !options.some((item) => item.value === current)) {
    options.unshift({ value: current, label: current })
  }
  if (!options.length) options.push({ value: t('最终验货'), label: t('最终验货') })
  return options
})

const emit = defineEmits([
  'card-click',
  'download-click',
  'more-click',
  'merge-toggle',
  'action-download',
  'action-unlock',
  'action-reset',
  'action-copy',
  'action-copy-merged',
  'action-report',
  'action-split',
  'action-open-detail',
  'request-refresh',
  'released'
])

function handleCheckboxChange() {
  if (props.mergeDisabled) return
  emit('merge-toggle', props.item)
}

function handleMoreClick() {
  if (props.useInternalActions) {
    showActionSheet.value = true
    return
  }
  emit('more-click', props.item)
}

function handleCardClick() {
  const plan = getPlan()
  const mergeType = Number(plan?.mergeType ?? props.item?.mergeType ?? props.item?.raw?.mergeType ?? 0)
  const lockFlag = Number(plan?.lockFlag ?? props.item?.lockFlag ?? props.item?.raw?.lockFlag ?? 0)
  const status = props.item?.status ?? plan?.status ?? props.item?.raw?.status
  const normalizedStatus = normalizeStatus(status)
  console.log('[PlanListItemCard] item click fields:', { mergeType, lockFlag, status, item: props.item })

  if (!props.useInternalCardClick) {
    emit('card-click', props.item)
    return
  }

  // 列表页：合并模式优先切换勾选
  if (props.isMergeMode) {
    emit('merge-toggle', props.item)
    return
  }

  // 报告态（status=3）：点击卡片时沿用“更多”按钮逻辑
  if (normalizedStatus === 3) {
    handleMoreClick()
    return
  }

  // 统一行为：未下载弹操作，已下载进详情
  if (!props.isLocalDownloaded) {
    // 可下载且未下载：点击卡片直接进入下载弹框，不再先展示操作菜单
    if (resolvedDownloadState.value === 'available' && !isDownloadedLike.value) {
      if (props.manageActionsInCard) {
        openDownloadModal()
      } else {
        emit('action-download', props.item)
      }
      return
    }

    // 边界场景：本地数据被清空，但线上 lockFlag=1 且 inspectorId=当前用户（已下载态）
    // 此时点击卡片应自动重新拉取详情并落本地，再进入详情页
    if (resolvedDownloadState.value === 'downloaded' && props.manageActionsInCard) {
      recoverLocalDataAndOpenDetail()
      return
    }
    if (props.useInternalActions) {
      showActionSheet.value = true
    } else {
      emit('more-click', props.item)
    }
    return
  }
  if (props.manageActionsInCard) {
    openDetailInCard()
  } else {
    emit('action-open-detail', props.item)
  }
}

async function recoverLocalDataAndOpenDetail() {
  const success = await recoverPlanDetailToLocalInCard()
  if (success) {
    emit('request-refresh')
    openDetailInCard()
  }
}

async function recoverPlanDetailToLocalInCard() {
  if (actionSubmitting.value) return false
  const planId = getPlanId()
  if (!planId) {
    globalThis.showToast(t('计划ID缺失，无法恢复本地数据'))
    return false
  }
  actionSubmitting.value = true
  try {
    const result = await getPlanDetail(planId)
    const localPlans = splitDownloadDataToLocalPlans(result)
    if (!localPlans.length) {
      throw new Error(t('详情数据为空，无法保存到本地'))
    }
    for (const localPlan of localPlans) {
      await savePlanToLocal(localPlan)
    }
    emit('request-refresh')
    return true
  } catch (error) {
    console.error('恢复本地计划失败:', error)
    globalThis.showToast(error.message || t('恢复本地计划失败'))
    return false
  } finally {
    actionSubmitting.value = false
  }
}

function emitCardAction(action) {
  closeActionSheet()
  if (action === 'ready-quantity') {
    showReadyQuantityPopup.value = true
    return
  }
  if (props.manageActionsInCard) {
    if (action === 'download') return openDownloadModal()
    if (action === 'view-inspector') return showLockedInspectorInfo()
    if (action === 'unlock') return openUnlockModal()
    if (action === 'reset') return openResetModal()
    if (action === 'copy') return openCopyModal(1)
    if (action === 'copy-merged') return openCopyModal(2)
    if (action === 'report') return showReportInCard()
  }
  if (action === 'download') emit('action-download', props.item)
  if (action === 'unlock') emit('action-unlock', props.item)
  if (action === 'reset') emit('action-reset', props.item)
  if (action === 'copy') emit('action-copy', props.item)
  if (action === 'copy-merged') emit('action-copy-merged', props.item)
  if (action === 'report') emit('action-report', props.item)
  if (action === 'split') emit('action-split', props.item)
}

function showLockedInspectorInfo() {
  console.info('[PlanListItemCard] 查看当前验货员:', {
    inspectorName: lockedInspectorName.value,
    inspectorId: lockedInspectorId.value,
    item: props.item
  })
  showInspectorModal.value = true
}

function closeInspectorModal() {
  showInspectorModal.value = false
}

function closeActionSheet() {
  showActionSheet.value = false
}

function openSplitByQuantityDialog() {
  closeActionSheet()
  splitQuantityValue.value = ''
  showSplitQuantityDialog.value = true
}

function closeSplitByQuantityDialog() {
  showSplitQuantityDialog.value = false
}

async function confirmSplitByQuantity() {
  const qty = Number(splitQuantityValue.value)
  if (!qty || qty <= 0) {
    globalThis.showToast(t('请输入有效的拆分数量'))
    return
  }
  const id = getPlanId()
  if (!id) {
    globalThis.showToast(t('计划ID缺失'))
    return
  }
  try {
    actionSubmitting.value = true
    await splitByQuantity(id, qty)
    globalThis.showToast(t('拆分船期成功'))
    showSplitQuantityDialog.value = false
    emit('request-refresh')
  } catch (error) {
    console.error('拆分船期失败:', error)
    globalThis.showToast(error.message || t('拆分船期失败'))
  } finally {
    actionSubmitting.value = false
  }
}

// 返回验货计划 ID（用于 SQLite 查找 / 页面导航）
function getPlanId() {
  const plan = getPlan()
  return plan.planId || plan.id || plan.reportId || props.item?.planId || props.item?.id || props.item?.reportId
}

// 返回后端报告实体 ID（用于云同步、PDF 导出等 API 调用）
function getReportEntityId() {
  const plan = getPlan()
  return plan.reportId || plan.planId || plan.id || props.item?.reportId || props.item?.planId || props.item?.id
}

function getItemMergeType(item) {
  return Number(item?.plan?.mergeType ?? item?.mergeType ?? item?.raw?.mergeType ?? 0)
}

// plan.id = inspectionPlan.id = planId（计划 ID），优先于顶层 reportId（实体 ID）
function getItemUniqueId(item) {
  return item?.plan?.id || item?.plan?.planId || item?.planId || item?.id || item?.plan?.reportId || item?.reportId
}

function getItemParentPlanId(item) {
  return String(item?.plan?.parentPlanId ?? item?.parentPlanId ?? item?.raw?.parentPlanId ?? '').trim()
}

function getItemClientOrderNo(item) {
  return item?.plan?.clientOrderNo || item?.clientOrderNo || item?.plan?.domeNo || item?.domeNo || item?.planNo || '-'
}

function getItemSubGoodsBatch(item) {
  const subGoodsNo = item?.plan?.subGoodsNo || item?.subGoodsNo || '-'
  const batchNo = item?.plan?.batchNo || item?.batchNo || '-'
  return `${subGoodsNo}#${batchNo}`
}

function getItemGoodsName(item) {
  return item?.plan?.goodsName || item?.goodsName || item?.productName || '-'
}

function normalizeStatus(status) {
  if (typeof status === 'number') return status
  if (status === '0') return 0
  if (status === '1') return 1
  if (status === '2') return 2
  if (status === '3') return 3
  if (status === 'DOWNLOADED' || status === 'NEW') return 0
  if (status === 'DRAFT' || status === 'IN_PROGRESS') return 1
  if (status === 'DONE' || status === 'COMPLETED') return 3
  return -1
}

function copyFieldValue(rawValue, label = '') {
  const value = String(rawValue ?? '').trim()
  if (!value || value === '-') {
    globalThis.showToast(t('暂无可复制内容'))
    return
  }
  uni.setClipboardData({
    data: value,
    success: () => {
      const fieldLabel = String(label || '').trim()
      globalThis.showToast(fieldLabel ? t('{label}已复制', { label: fieldLabel }) : t('复制成功'))
    },
    fail: () => {
      globalThis.showToast(t('复制失败，请重试'))
    }
  })
}

// function handleDownloadIconClick() {
//   if (!props.manageActionsInCard) {
//     emit('download-click', props.item)
//     return
//   }

//   if (resolvedDownloadState.value === 'locked') {
//     globalThis.showToast(t('该计划已被其他验货员下载，当前账号不可操作'))
//     return
//   }

//   if (resolvedDownloadState.value === 'available') {
//     if (resolvedShowActionSplit.value) {
//       emit('action-split', props.item)
//       return
//     }
//     handleDownloadInCard()
//     return
//   }

//   if (props.statusKey === 'planned') {
//     startInspectionInCard()
//     return
//   }

//   if (props.statusKey === 'progress') {
//     openDetailInCard()
//     return
//   }

//   // exportReportInCard()
// }

function formatDetailDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekDays = [t('周日'), t('周一'), t('周二'), t('周三'), t('周四'), t('周五'), t('周六')]
  const weekDay = weekDays[date.getDay()]
  return t('{year}年{month}月{day}日 {weekDay}', { year, month, day, weekDay })
}

async function handleDownloadInCard(options = {}) {
  const {
    showSuccessToast = true,
    planIdOverride = '',
    templateIdOverride = '',
    templateNameOverride = ''
  } = options
  if (actionSubmitting.value) return
  const planId = String(planIdOverride || getPlanId() || '')
  if (!planId) {
    globalThis.showToast(t('计划ID缺失，无法下载'))
    return false
  }
  const payload = {}
  const selectedTemplateId = String(templateIdOverride || downloadChecklistId.value || '').trim()
  const selectedTemplateName = String(templateNameOverride || downloadChecklistName.value || '').trim()
  if (selectedTemplateId) payload.templateId = selectedTemplateId
  if (selectedTemplateName) payload.templateName = selectedTemplateName
  actionSubmitting.value = true
  try {
    const result = await downloadPlanApi(planId, payload)
    const localPlans = splitDownloadDataToLocalPlans(result)
    if (!localPlans.length) {
      throw new Error(t('下载数据为空，无法保存到本地'))
    }
    console.log('[PlanListItemCard] 下载后准备写入本地的数据:', {
      planId,
      count: localPlans.length,
      localPlans
    })
    for (const localPlan of localPlans) {
      console.log('[PlanListItemCard] 正在写入本地单条数据:', localPlan)
      await savePlanToLocal(localPlan)
    }
    emit('request-refresh')
    if (showSuccessToast) {
      globalThis.showToast(t('下载成功'))
    }
    return true
  } catch (error) {
    console.error('下载计划失败:', error)
    globalThis.showToast(error.message || t('下载计划失败'))
    return false
  } finally {
    actionSubmitting.value = false
  }
}

async function startInspectionInCard() {
  if (actionSubmitting.value) return
  actionSubmitting.value = true
  try {
    const updatedPlan = {
      ...props.item,
      status: 1,
      plan: {
        ...(props.item?.plan || {}),
        status: 1
      },
      startedAt: new Date().toISOString(),
      progress: 0
    }
    await savePlanToLocal(updatedPlan)
    emit('request-refresh')
    globalThis.showToast(t('已开始验货'))
  } catch (error) {
    console.error('开始验货失败:', error)
    globalThis.showToast(error.message || t('开始验货失败'))
  } finally {
    actionSubmitting.value = false
  }
}

function openDetailInCard() {
  const planId = getPlanId()
  if (!planId) return
  const detailPagePath = isDesktopClient() ? 'detail-pc' : 'detail'
  uni.navigateTo({
    url: `/pages/report/${detailPagePath}?planId=${encodeURIComponent(planId)}`
  })
}

function openDetailPcInCard() {
  const planId = getPlanId()
  if (!planId) return
  uni.navigateTo({
    url: `/pages/report/detail-pc?planId=${encodeURIComponent(planId)}`
  })
}

function isDesktopClient() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function') {
      const info = uni.getSystemInfoSync() || {}
      const platform = String(info?.platform || info?.uniPlatform || '').toLowerCase()
      if (platform.includes('windows') || platform.includes('mac') || platform === 'devtools') {
        return true
      }
      if (platform.includes('android') || platform.includes('ios')) {
        return false
      }
    }
  } catch {}

  if (typeof navigator === 'undefined') return false
  const ua = String(navigator.userAgent || '')
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)
  const hasTouch = Number(navigator.maxTouchPoints || 0) > 0
  return !isMobileUA && !hasTouch
}

async function exportReportInCard() {
  if (actionSubmitting.value) return
  const reportId = getReportEntityId()
  if (!reportId) return
  actionSubmitting.value = true
  try {
    const downloadUrl = `/api/reports/${reportId}/export`
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `验货报告_${getPlan().inspectionNo || getPlan().domeNo || props.item?.planNo || reportId}_${new Date().getTime()}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    globalThis.showToast(t('报告下载已开始'))
  } catch (error) {
    console.error('下载失败:', error)
    globalThis.showToast(error.message || t('下载失败'))
  } finally {
    actionSubmitting.value = false
  }
}

function openUnlockModal() {
  showUnlockModal.value = true
}

function closeUnlockModal() {
  showUnlockModal.value = false
}

function openResetModal() {
  showResetModal.value = true
}

function closeResetModal() {
  showResetModal.value = false
}

async function openCopyModal(mode = 1) {
  copyMode.value = Number(mode) === 2 ? 2 : 1
  const plan = getPlan()
  copyChecklistId.value = String(plan.templateId || props.item?.templateId || '').trim()
  copyChecklistValue.value = plan.templateName || props.item?.templateName || ''
  copyInspectTypeValue.value = plan.inspectType || props.item?.inspectType || ''
  copyCreatedSuccess.value = false
  copiedPlanId.value = ''
  copyMergedItems.value = []
  showCopyModal.value = true
  if (copyMode.value === 2) {
    await loadCopyMergedItems(getTargetParentPlanIdForCopy())
  }
  loadInspectTypeDictOptions()
}

function closeCopyModal() {
  showCopyModal.value = false
  copyCreatedSuccess.value = false
  copiedPlanId.value = ''
  copyMode.value = 1
  copyMergedPreviewLoading.value = false
  copyMergedItems.value = []
}

function getTargetParentPlanIdForCopy() {
  if (copyMode.value !== 2) return ''
  return getItemParentPlanId(props.item) || String(getPlanId() || '')
}

function getItemPlanId(item) {
  return String(item?.plan?.planId || item?.plan?.id || item?.planId || item?.id || '').trim()
}

async function loadCopyMergedItems(parentPlanId) {
  const targetParentPlanId = String(parentPlanId || '').trim()
  if (!targetParentPlanId) {
    copyMergedItems.value = [props.item]
    return
  }

  copyMergedPreviewLoading.value = true
  try {
    const result = await searchPlans({
      parentPlanId: targetParentPlanId
    })
    const rows = Array.isArray(result?.records) ? result.records : []
    copyMergedItems.value = rows.length ? rows : [props.item]
  } catch (error) {
    console.error('加载复制合并验货明细失败:', error)
    copyMergedItems.value = [props.item]
  } finally {
    copyMergedPreviewLoading.value = false
  }
}

async function loadInspectTypeDictOptions() {
  try {
    const rows = await getInspectTypeDict()
    inspectTypeDictOptions.value = Array.isArray(rows) ? rows : []
    if (!copyInspectTypeValue.value && inspectTypeDictOptions.value.length) {
      copyInspectTypeValue.value = String(inspectTypeDictOptions.value[0].value || '')
    }
  } catch (error) {
    console.error('加载检查类型字典失败:', error)
    if (!copyInspectTypeValue.value) {
      copyInspectTypeValue.value = t('最终验货')
    }
  }
}

async function openDownloadModal() {
  downloadChecklistId.value = detailChecklistId.value
  downloadChecklistName.value = detailChecklistName.value === '-' ? '' : detailChecklistName.value
  showDownloadModal.value = true
  await loadDownloadMergedItems()
}

function closeDownloadModal() {
  showDownloadModal.value = false
  downloadPreviewLoading.value = false
  downloadMergedItems.value = []
}

async function loadDownloadMergedItems() {
  if (!isMergedDownloadTarget.value) {
    downloadMergedItems.value = []
    return
  }

  const currentPlanId = String(getPlanId() || '')
  const parentPlanId = getItemParentPlanId(props.item)
  const targetParentPlanId = parentPlanId || currentPlanId
  if (!targetParentPlanId) {
    downloadMergedItems.value = [props.item]
    return
  }

  downloadPreviewLoading.value = true
  try {
    const result = await searchPlans({
      parentPlanId: targetParentPlanId
    })
    const rows = Array.isArray(result?.records) ? result.records : []
    const localPlans = await getLocalPlans()
    const localById = new Map(localPlans.map(item => [String(getItemUniqueId(item) || ''), item]))
    const allCandidates = [...rows, ...localPlans]
    const groupedRows = allCandidates.filter((candidate) => {
      const candidateParentPlanId = getItemParentPlanId(candidate)
      return candidateParentPlanId === targetParentPlanId
    })

    const uniqueRows = []
    const seenIds = new Set()
    groupedRows.forEach((row) => {
      const rowId = String(getItemUniqueId(row) || '')
      if (!rowId || seenIds.has(rowId)) return
      seenIds.add(rowId)
      uniqueRows.push(localById.get(rowId) || row)
    })

    downloadMergedItems.value = uniqueRows.length ? uniqueRows : [props.item]
  } catch (error) {
    console.error('加载合并验货明细失败:', error)
    downloadMergedItems.value = [props.item]
  } finally {
    downloadPreviewLoading.value = false
  }
}

async function confirmDownloadInModal() {
  const success = await handleDownloadInCard()
  if (success) {
    closeDownloadModal()
  }
}

async function doReleaseAction(reportDeleteFlag) {
  const planId = getPlanId()
  if (!planId || actionSubmitting.value) return
  actionSubmitting.value = true
  try {
    await releaseReportTask(planId, reportDeleteFlag)
    const plan = getPlan()
    const removeIdSet = new Set([
      String(planId),
      String(plan?.reportId || ''),
      String(plan?.planId || ''),
      String(plan?.id || ''),
      String(props.item?.reportId || ''),
      String(props.item?.planId || ''),
      String(props.item?.id || '')
    ].filter(Boolean))

    const mergeType = getItemMergeType(props.item)
    const parentPlanId = mergeType === 2
      ? String(plan?.parentPlanId ?? props.item?.parentPlanId ?? props.item?.raw?.parentPlanId ?? '').trim()
      : ''

    if (mergeType === 2 && parentPlanId) {
      const localPlans = await getLocalPlans()
      for (const localPlan of localPlans) {
        const localParentPlanId = String(localPlan?.plan?.parentPlanId ?? localPlan?.parentPlanId ?? localPlan?.raw?.parentPlanId ?? '').trim()
        if (localParentPlanId !== parentPlanId) continue
        const localIds = [
          localPlan?.id,
          localPlan?.planId,
          localPlan?.reportId,
          localPlan?.plan?.id,
          localPlan?.plan?.planId,
          localPlan?.plan?.reportId
        ].filter(Boolean).map(id => String(id))
        localIds.forEach(id => removeIdSet.add(id))
      }
    }

    const removeIds = Array.from(removeIdSet)
    // 先通知列表即时移除，再清理本地数据库记录
    emit('released', {
      ids: removeIds,
      parentPlanId: mergeType === 2 ? parentPlanId : '',
      mergeType,
      actionType: reportDeleteFlag === 1 ? 'reset' : 'unlock'
    })
    for (const id of removeIds) {
      await removePlanFromLocal(id)
    }
    emit('request-refresh')
    globalThis.showToast(reportDeleteFlag === 1 ? t('重置成功') : t('解锁成功'))
    return true
  } catch (error) {
    console.error('解锁/重置失败:', error)
    globalThis.showToast(error.message || t('操作失败'))
    return false
  } finally {
    actionSubmitting.value = false
  }
}

async function confirmUnlock() {
  const success = await doReleaseAction(0)
  if (success) closeUnlockModal()
}

async function confirmReset() {
  const success = await doReleaseAction(1)
  if (success) closeResetModal()
}

function extractCopiedPlanId(copyResult) {
  const candidates = [
    copyResult?.id,
    copyResult?.planId,
    copyResult?.reportId,
    copyResult?.plan?.id,
    copyResult?.plan?.planId,
    copyResult?.plan?.reportId
  ]
  const found = candidates.find((value) => value !== undefined && value !== null && String(value).trim())
  return found ? String(found).trim() : ''
}

async function createCopyInspection() {
  if (!copyChecklistValue.value || !copyInspectTypeValue.value) {
    globalThis.showToast(t('请选择清单和检查类型'))
    return
  }
  const sourcePlanId = copyMode.value === 2
    ? getTargetParentPlanIdForCopy()
    : String(getPlanId() || '')
  if (!sourcePlanId) {
    globalThis.showToast(t('计划ID缺失，无法复制'))
    return
  }
  if (actionSubmitting.value) return
  actionSubmitting.value = true
  try {
    const result = await copyPlanApi(sourcePlanId, {
      inspectType: copyInspectTypeValue.value,
      templateId: copyChecklistId.value,
      templateName: copyChecklistValue.value,
      copyFlag: copyMode.value === 2 ? 2 : 1,
      id: sourcePlanId
    })
    const copiedId = String(result?.id || '').trim() || extractCopiedPlanId(result)
    if (copyMode.value === 1 && !copiedId) {
      throw new Error(t('复制成功但未返回新计划ID'))
    }
    copiedPlanId.value = copiedId

    if (copyMode.value === 2) {
      const copiedParentPlanId = String(result?.parentPlanId || '').trim()
      if (!copiedParentPlanId) {
        throw new Error(t('复制成功但未返回合并计划ID'))
      }
      await loadCopyMergedItems(copiedParentPlanId)
      if (!copiedPlanId.value && copyMergedItems.value.length) {
        copiedPlanId.value = getItemPlanId(copyMergedItems.value[0])
      }
    }

    copyCreatedSuccess.value = true
    globalThis.showToast(result?.message || t('复制验货成功'))
  } catch (error) {
    console.error('复制验货失败:', error)
    globalThis.showToast(error.message || t('复制验货失败'))
  } finally {
    actionSubmitting.value = false
  }
}

async function downloadCopiedInspection() {
  const fallbackCopiedPlanId = copyMode.value === 2 && copyMergedItems.value.length
    ? getItemPlanId(copyMergedItems.value[0])
    : ''
  const targetPlanId = copiedPlanId.value || fallbackCopiedPlanId
  if (!targetPlanId) {
    globalThis.showToast(t('复制结果缺少计划ID，无法下载'))
    return
  }
  const success = await handleDownloadInCard({
    planIdOverride: targetPlanId,
    templateIdOverride: copyChecklistId.value,
    templateNameOverride: copyChecklistValue.value
  })
  if (success) {
    closeCopyModal()
  }
}

function showReportInCard() {
  // if (!props.isLocalDownloaded) {
  //   globalThis.showToast(t('请先下载后再查看报告'))
  //   return
  // }
  openDetailPcInCard()
}

function openChecklistPicker(scene) {
  activeChecklistScene.value = scene === 'copy' ? 'copy' : 'download'
  showChecklistPicker.value = true
}

function closeChecklistPicker() {
  showChecklistPicker.value = false
}

function handleChecklistConfirm(option) {
  const selectedId = String(option?.id || '').trim()
  const selectedName = String(option?.name || '').trim()
  if (!selectedId || !selectedName) return
  if (activeChecklistScene.value === 'copy') {
    copyChecklistId.value = selectedId
    copyChecklistValue.value = selectedName
    return
  }
  downloadChecklistId.value = selectedId
  downloadChecklistName.value = selectedName
}
</script>

<style scoped>
.supplier-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 40rpx;
  background: #fff;
}

.supplier-name {
  font-size: 28rpx;
  color: #64748b;
}

.order-date {
  font-size: 26rpx;
  color: #94a3b8;
}

.inspection-card {
  background: #fff;
  /* border-radius: 0 0 24rpx 24rpx; */
  padding: 24rpx 8rpx 24rpx 24rpx;
  display: flex;
  gap: 24rpx;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  position: relative;
  min-height: 160rpx;
}

.inspection-card:active {
  background: #f8fafc;
}

.card-left {
  position: relative;
  flex-shrink: 0;
}

.download-icon-wrapper {
  position: absolute;
  top: -8rpx;
  left: -8rpx;
  width: 56rpx;
  height: 56rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.2);
  z-index: 1;
}

.download-icon-wrapper.available {
  background: #94a3b8;
}

.download-icon-wrapper.downloaded {
  background: #16a34a;
}

.download-icon-wrapper.locked {
  background: #6b7280;
}

.download-icon-wrapper svg {
  width: 32rpx;
  height: 32rpx;
}

.download-icon-wrapper:active {
  transform: scale(0.95);
  opacity: 0.8;
}

.product-image {
  width: 140rpx;
  height: 140rpx;
  border-radius: 16rpx;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #e2e8f0;
}

.image-placeholder {
  font-size: 64rpx;
}

.card-middle {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.product-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.5;
  padding-right: 88rpx;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: nowrap;
}

.status-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex-shrink: 0;
}

.status-badge {
  background: #dbeafe;
  color: #1e40af;
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.goods-no {
  font-size: 24rpx;
  color: #64748b;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-right {
  flex-shrink: 0;
}

.goods-extra-line {
  font-size: 24rpx;
  color: #64748b;
  line-height: 1.4;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.goods-extra-line::-webkit-scrollbar {
  display: none;
}

.goods-extra-item {
  display: flex;
  align-items: baseline;
  min-width: max-content;
  flex: 0 0 auto;
  overflow: visible;
}

.goods-extra-item-produce {
  flex: 0 0 auto;
  overflow: visible;
  min-width: 160rpx;
  font-size: 20rpx;
}

.goods-extra-label {
  color: #94a3b8;
  flex-shrink: 0;
}

.goods-extra-value {
  color: #64748b;
  min-width: max-content;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.progress-status {
  font-size: 24rpx;
  font-weight: 600;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}

.progress-status.planned {
  background: #fef3c7;
  color: #92400e;
}

.progress-status.in-progress {
  background: #fef3c7;
  color: #f59e0b;
}

.progress-status.completed {
  background: #d1fae5;
  color: #065f46;
}

.card-right {
  position: absolute;
  top: 20rpx;
  right: 24rpx;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.merge-flag {
  width: 46rpx;
  height: 46rpx;
  border-radius: 12rpx;
  background: #ecfdf5;
  color: #059669;
  border: 2rpx solid #a7f3d0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2rpx 4rpx rgba(5, 150, 105, 0.12);
}

.merge-flag svg {
  width: 26rpx;
  height: 26rpx;
}

.card-more-btn {
  width: 46rpx;
  height: 46rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 12rpx;
  transition: all 0.2s;
  box-shadow: 0 2rpx 4rpx rgba(15, 23, 42, 0.08);
}

.card-more-btn:active {
  background: #f1f5f9;
  transform: scale(0.96);
}

.merge-check-wrapper {
  width: 36rpx;
  height: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: all 0.2s ease;
  margin-left: 12rpx;
}

.merge-check-wrapper.checked {
  background: transparent;
}

.merge-check-wrapper.disabled {
  opacity: 0.5;
}

.checkbox-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.merge-checkbox {
  transform: scale(0.95);
  margin: 0;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2000;
  display: flex;
  align-items: flex-end;
}

.action-menu {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 0;
  animation: slideUp 0.25s ease-out;
}

.menu-header {
  padding: 32rpx 40rpx;
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  border-bottom: 2rpx solid #f0f0f0;
}

.menu-item-btn {
  width: 100%;
  height: 104rpx;
  border: none;
  border-bottom: 2rpx solid #f5f5f5;
  background: #fff;
  color: #333;
  font-size: 32rpx;
  cursor: pointer;
}

.menu-item-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.menu-item-btn:active {
  background: #f8f8f8;
}

.menu-cancel {
  width: 100%;
  margin-top: 16rpx;
  height: 104rpx;
  border: none;
  background: #f9f9f9;
  color: #666;
  font-size: 32rpx;
  cursor: pointer;
}

.menu-cancel:active {
  background: #f0f0f0;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.confirm-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  overflow: hidden;
}

.confirm-title {
  padding: 40rpx;
  font-size: 48rpx;
  font-weight: 700;
  color: #111827;
  border-bottom: 2rpx solid #f1f5f9;
}

.confirm-content {
  padding: 40rpx;
  font-size: 30rpx;
  line-height: 1.5;
  color: #111827;
}

.confirm-actions {
  display: flex;
  gap: 24rpx;
  padding: 0 40rpx 40rpx;
}

.confirm-btn {
  height: 88rpx;
  border-radius: 20rpx;
  border: none;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn.cancel {
  width: 240rpx;
  background: #fff;
  color: #111827;
  border: 2rpx solid #e5e7eb;
}

.confirm-btn.agree {
  flex: 1;
  background: #03ae4f;
  color: #fff;
}

.copy-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 24rpx;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.copy-modal-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 24rpx;
  flex-shrink: 0;
}

.copy-info-card {
  background: #fff;
  border: 2rpx solid #e5e7eb;
  border-radius: 24rpx;
  padding: 16rpx 8rpx;
  overflow-y: auto;
}

.download-merged-section {
  margin-bottom: 16rpx;
  overflow-y: auto;
}

.download-merged-title {
  font-size: 48rpx;
  font-weight: 700;
  color: #111827;
  margin: 12rpx 0 24rpx;
}

.download-merged-table-wrap {
  border: 2rpx solid #e5e7eb;
  border-radius: 20rpx;
  overflow: hidden;
}

.download-merged-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.download-merged-table th,
.download-merged-table td {
  border-bottom: 2rpx solid #f1f5f9;
  padding: 20rpx 16rpx;
  font-size: 26rpx;
  color: #334155;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.download-merged-table th {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
}

.download-preview-loading {
  text-align: center;
  color: #64748b;
  font-size: 26rpx;
}

.download-summary-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 24rpx 0;
  border-bottom: 2rpx solid #f1f5f9;
}

.download-summary-row-clickable,
.copy-info-row-clickable,
.copy-field-select {
  cursor: pointer;
}

.download-summary-row:last-child {
  border-bottom: none;
}

.download-summary-label {
  color: #9ca3af;
  font-size: 32rpx;
  flex-shrink: 0;
}

.download-summary-value {
  color: #111827;
  font-size: 32rpx;
  font-weight: 600;
  text-align: right;
}

.checklist-select-value-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12rpx;
  min-width: 0;
}

.checklist-select-chevron {
  width: 14rpx;
  height: 14rpx;
  border-top: 3rpx solid #94a3b8;
  border-right: 3rpx solid #94a3b8;
  transform: rotate(45deg);
  flex-shrink: 0;
}

.copy-info-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f1f5f9;
}

.copy-info-row:last-child {
  border-bottom: none;
}

.copy-label {
  color: #64748b;
  font-size: 28rpx;
  flex-shrink: 0;
}

.copy-value {
  color: #111827;
  font-size: 28rpx;
  text-align: right;
}

.copy-field {
  margin-top: 28rpx;
}

.copy-field-label {
  font-size: 28rpx;
  color: #334155;
  margin-bottom: 16rpx;
}

.copy-field-select {
  min-height: 84rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  padding: 0 24rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.copy-field-select-text {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #111827;
  word-break: break-all;
}

.copy-select {
  width: 100%;
  height: 84rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  background: #f8fafc;
}

.copy-actions {
  margin-top: 36rpx;
  display: flex;
  gap: 24rpx;
  flex-shrink: 0;
}

.copy-created-tip {
  margin-top: 20rpx;
  font-size: 28rpx;
  line-height: 1.5;
  color: #059669;
}

.reset-tip {
  margin-top: 24rpx;
  font-size: 32rpx;
  color: #334155;
}

.copy-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 20rpx;
  border: none;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
}

.copy-btn.close {
  background: #fff;
  border: 2rpx solid #e5e7eb;
  color: #334155;
}

.copy-btn.create {
  background: #03ae4f;
  color: #fff;
}

.split-quantity-dialog {
  width: 560rpx;
  margin: auto;
  background: #fff;
  border-radius: 24rpx;
  padding: 48rpx 40rpx 36rpx;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.split-quantity-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
}

.split-quantity-hint {
  font-size: 26rpx;
  color: #666;
  text-align: center;
}

.split-quantity-input {
  width: 100%;
  height: 80rpx;
  border: 2rpx solid #e0e0e0;
  border-radius: 12rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: #333;
  box-sizing: border-box;
}

.split-quantity-input:focus {
  border-color: #1a5f3f;
}

.split-quantity-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 8rpx;
}

.split-quantity-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.split-quantity-btn.cancel {
  background: #f5f5f5;
  color: #666;
}

.split-quantity-btn.confirm {
  background: #1a5f3f;
  color: #fff;
}
</style>
