<template>
  <div v-if="isPcBlocked" class="page pc-blocked-page">
    <view class="pc-blocked-card">
      <view class="pc-blocked-title">{{ t('请使用手机端继续操作') }}</view>
      <view class="pc-blocked-desc">{{ t('当前详情页仅支持手机端验货，请在手机端打开后继续。') }}</view>
      <uni-button class="pc-blocked-btn" @click="handlePcBlockedBack">{{ t('返回列表') }}</uni-button>
    </view>
  </div>
  <div class="page" v-else-if="loaded">
    <ReportDetailHeader
      :plan-data="planData"
      :is-syncing="isSyncing"
      :is-uploading-photos="isUploadingPhotos"
      :pending-upload-count="pendingUploadCount"
      :sync-debug-info="syncDebugInfo"
      :active-tab="activeTab"
      @back="goBack"
      @update:active-tab="activeTab = $event"
      @open-local-data="openLocalDataTab"
    />

    <div ref="bodyRef" class="body">
      <ChecklistTab
        v-show="activeTab === 'checklist'"
        :standard-items="standardItems"
        :has-merged-inspection-plans="hasMergedInspectionPlans"
        :inspection-plan-rows="inspectionPlanRows"
        :checklist-data="checklistData"
        :defects="defects"
        :severity-options="severityOptionsView"
        :failed-item-ids="failedItemIds"
        :failed-photo-item-ids="failedPhotoItemIds"
        @open-item="openChecklistItem"
        @open-defect="openDefectDetail"
        @set-result="setItemResult"
        @swipe-open="handleChecklistSwipeOpen"
        @photo-input="handleChecklistItemPhotoInput"
        @photo-capture="handleChecklistItemPhotoCapture"
        @finish="openFinishModal"
      />

      <ReportDetailDefectsTab
        v-show="activeTab === 'defects'"
        :defects="defects"
        :defect-counts="defectCounts"
        :defect-groups="defectGroups"
        :get-severity-label="getSeverityLabel"
        :get-severity-class="getSeverityClass"
        :format-time="formatTime"
        @add-defect="addDefect"
        @open-defect="openDefectDetail"
      />

      <ReportDetailInfoTab
        v-show="activeTab === 'info'"
        :plan-data="planData"
      />

      <ReportDetailLocalDataTab
        v-show="activeTab === 'localData'"
        :updated-at="localReportDebugUpdatedAt"
        :content-text="localReportDebugText"
        @refresh="refreshLocalReportDebug"
        @copy="copyLocalReportDebug"
      />
    </div>

    <button
      v-if="activeTab === 'checklist' || activeTab === 'defects'"
      class="floating-defect-btn"
      @click="startQuickDefect"
    >
      <span class="floating-defect-icon">❗</span>
    </button>

    <QuickDefectModal
      :visible="showQuickDefectModal"
      :editing-index="editingDefectIndex"
      :source-item="quickDefectSourceItem"
      :severity-options="severityOptionsView"
      :form="quickDefectForm"
      :tier-loading="defectTierLoading"
      :tier-error="defectTierError"
      :tier-retrying="defectTierRetrying"
      auto-capture
      @close="closeQuickDefectModal"
      @save="saveQuickDefect"
      @delete="deleteQuickDefect"
      @open-category-picker="openCategoryPicker"
      @retry-tier="handleRetryTier"
      @add-media="handleDefectAddMedia"
      @remove-media="handleDefectRemoveMedia"
      @retry-upload="handleDefectRetryUpload"
      @edit-save="handleDefectEditSave"
    />

    <CategoryPickerDrawer
      :visible="showCategoryPicker"
      :step="categoryPickerStep"
      :search-keyword="categorySearchKeyword"
      :recent-history="recentCategoryHistory"
      :filtered-options="filteredCategoryOptions"
      @close="closeCategoryPicker"
      @back="handleCategoryBack"
      @select="handleCategorySelect"
      @update:search-keyword="categorySearchKeyword = $event"
      @apply-recent="applyRecentCategory"
    />

    <CheckItemModal
      :visible="showItemModal"
      :item="currentItem"
      :item-data="currentItemData"
      :son-plan-id="currentItemSonPlanId"
      :show-check-point-upload="showCheckPointUpload"
      :defects="currentItemDefects"
      :auto-capture="itemModalAutoCapture"
      @close="closeItemModal"
      @select-result="selectResultAndClose"
      @add-media="handleMediaGridAdd"
      @add-check-point-media="handleCheckPointMediaAdd"
      @remove-media="handleRemoveMedia"
      @retry-upload="handleRetryUpload"
      @edit-save="handleEditSave"
      @auto-save="autoSaveItemData"
      @text-result-change="handleTextResultChange"
      @reset-item="resetCurrentCheckItem"
      @copy-items="handleCopyItems"
      @photos-sorted="handlePhotosSorted"
      @batch-move="openBatchMovePopup"
      @open-defect="openDefectDetail"
      @capture-start="handleItemCaptureStart"
      @capture-end="handleItemCaptureEnd"
    />

    <PhotoEditor
      :visible="showMediaEditor"
      :photo-src="mediaEditorPhotoSrc"
      @close="closeMediaEditor"
      @save="saveMediaEditor"
    />

    <CopyCheckItemsPopup
      :visible="showCopyCheckItemsPopup"
      :source-plan-id="String(planId || '')"
      :source-item-id="copySourceItemId"
      :checklist-items="flatChecklistItemsForCopy"
      :current-item-id="String(currentItem?.id || '')"
      :current-item-type="currentItem?.itemType || ''"
      :current-item-name="currentItem?.itemName || ''"
      @close="closeCopyCheckItemsPopup"
      @copied="onCheckItemsCopied"
    />
    <BatchMoveMediaPopup
      :visible="showBatchMovePopup"
      :media-list="batchMoveMediaList"
      :target-items="batchMoveTargetItems"
      :submitting="batchMoveSubmitting"
      @close="closeBatchMovePopup"
      @submit="handleBatchMoveSubmit"
    />

    <!-- 总结并提交弹窗 -->
    <view v-if="showFinishModal" class="finish-modal-overlay" @click="closeFinishModal">
      <view class="finish-modal" @click.stop>
        <!-- 顶栏 -->
        <view class="finish-modal-topbar">
          <view class="finish-product-info">
            <text class="finish-product-name">{{ finishProductTitle }}</text>
          </view>
          <uni-button class="finish-topbar-more">···</uni-button>
        </view>

        <!-- 滚动内容区 -->
        <view class="finish-modal-scroll">
          <!-- 数量 -->
          <view class="finish-section-block">
            <view class="finish-section-sep">{{ t('数量') }}</view>
            <view class="finish-info-row">
              <text class="finish-info-label">{{ t('订单数量') }}</text>
              <text class="finish-info-value">{{ finishQuantityLoading ? t('加载中...') : finishOrderQuantity }}</text>
            </view>
            <view class="finish-info-row">
              <text class="finish-info-label">
                {{ t('已备好数量') }}
                <text class="finish-set-link" @click="openFinishQuantityDialog">{{ t('（设置）') }}</text>
              </text>
              <text class="finish-info-value">{{ finishQuantityLoading ? t('加载中...') : localReadyQuantity }}</text>
            </view>
            <view class="finish-info-row">
              <text class="finish-info-label">
                {{ t('预计抽样数量') }}
              </text>
              <text class="finish-info-value">{{ finishQuantityLoading ? t('加载中...') : localSampleQuantity }}</text>
            </view>
          </view>

          <!-- 疵点 -->
          <view class="finish-section-block">
            <view class="finish-section-sep">{{ t('疵点') }}</view>
            <view class="finish-defect-header">
              <text></text>
              <text class="finish-defect-col-hd">{{ t('实际发现') }}</text>
              <text class="finish-defect-col-hd">{{ t('最大值') }}</text>
            </view>
            <view
              v-for="stat in finishDefectStats"
              :key="stat.key"
              class="finish-info-row"
            >
              <text class="finish-info-label" :class="{ 'text-danger': stat.exceed }">{{ stat.label }}</text>
              <text class="finish-defect-col" :class="{ 'text-danger': stat.exceed }">{{ stat.actual }}</text>
              <text class="finish-defect-col" :class="{ 'text-danger': stat.exceed }">{{ stat.max }}</text>
            </view>
            <view v-if="finishExceedsAql" class="finish-aql-warn">{{ t('疵点数量超出AQL允许最大值') }}</view>
          </view>

          <!-- 失败检查点（超AQL时显示） -->
          <view v-if="finishExceedsAql" class="finish-section-block">
            <view class="finish-section-sep finish-section-sep-collapse" @click="failedCheckpointsExpanded = !failedCheckpointsExpanded">
              <text>{{ t('失败检查点') }}</text>
              <text class="finish-collapse-icon">{{ failedCheckpointsExpanded ? '∧' : '∨' }}</text>
            </view>
            <view v-if="failedCheckpointsExpanded" class="finish-failed-list">
              <view v-for="item in finishFailedCheckpoints" :key="item.id" class="finish-failed-item">
                <text class="finish-failed-dot"></text>
                <text>{{ item.name }}</text>
              </view>
              <view v-if="!finishFailedCheckpoints.length" class="finish-failed-empty">{{ t('暂无失败检查点') }}</view>
            </view>
          </view>

          <!-- 状态 -->
          <view class="finish-section-block">
            <view class="finish-section-sep">{{ t('状态') }}</view>
            <view class="finish-info-row">
              <text class="finish-info-label">{{ t('状态') }}</text>
              <view class="finish-status-area">
                <text
                  v-if="overallResult"
                  class="finish-status-tag"
                  :class="'status-' + String(overallResult).toLowerCase()"
                >{{ finishStatusLabelMap[overallResult] || overallResult }}</text>
                <uni-button class="finish-set-status-btn" @click="openFinishStatusSheet">{{ t('设置状态') }}</uni-button>
              </view>
            </view>
          </view>

          <!-- 总结性评语 -->
          <view class="finish-section-block">
            <view class="finish-section-sep">{{ t('总结性评语') }}</view>
            <textarea
              v-model="overallRemarks"
              class="finish-remarks"
              :placeholder="t('总结评论')"
              rows="4"
              :maxlength="3000"
            />
          </view>
        </view>

        <!-- 底部按钮 -->
        <view class="finish-modal-footer">
          <uni-button
            class="btn-end-inspection"
            :disabled="isSubmittingFinish"
            @click="handleFinishInspection"
          >{{ isSubmittingFinish ? t('提交中…') : t('结束验货') }}</uni-button>
        </view>
      </view>
    </view>

    <view v-if="showStatusPicker" class="finish-status-sheet-overlay" @click.self="closeFinishStatusSheet">
      <view class="finish-status-sheet">
        <view class="finish-status-sheet-title">{{ t('设置状态') }}</view>
        <view
          v-for="opt in finishResultOptions"
          :key="opt.value"
          class="finish-status-sheet-option"
          @click="selectFinishStatus(opt.value)"
        >
          <text class="finish-status-sheet-label">{{ opt.label }}</text>
          <text v-if="overallResult === opt.value" class="finish-status-sheet-check">✓</text>
        </view>
        <view class="finish-status-sheet-actions">
          <uni-button class="finish-status-reset-btn" @click="resetFinishStatus">{{ t('重置状态') }}</uni-button>
        </view>
        <uni-button class="finish-status-sheet-cancel" @click="closeFinishStatusSheet">{{ t('取消') }}</uni-button>
      </view>
    </view>

    <!-- 强制性数据缺失确认框 -->
    <div v-if="showMissingDataDialog" class="missing-data-overlay">
      <div class="missing-data-dialog">
        <div class="missing-data-title">{{ t('强制性数据缺失') }}</div>
        <div class="missing-data-body">
          {{ t('有的检查项目要求必须有相关信息或图片，否则无法提交验货报告') }}
        </div>
        <div class="missing-data-actions">
          <uni-button class="missing-btn cancel" @click="showMissingDataDialog = false">{{ t('取消') }}</uni-button>
          <uni-button class="missing-btn agree" @click="confirmForceMarkErrors">{{ t('同意') }}</uni-button>
        </div>
      </div>
    </div>

    <!-- 结束验货二次确认框 -->
    <div v-if="showFinishConfirmDialog" class="finish-confirm-overlay">
      <div class="finish-confirm-dialog">
        <div class="finish-confirm-badge">{{ t('提交确认') }}</div>
        <div class="finish-confirm-title">{{ t('确认结束验货？') }}</div>
        <div class="finish-confirm-body">
          {{ t('确认后将提交验货报告并更新本地状态，请确认信息无误。') }}
        </div>
        <div class="finish-confirm-actions">
          <uni-button class="finish-confirm-btn cancel" @click="closeFinishConfirmDialog">{{ t('取消') }}</uni-button>
          <uni-button class="finish-confirm-btn submit" :disabled="isSubmittingFinish" @click="confirmFinishInspection">
            {{ t('确认') }}
          </uni-button>
        </div>
      </div>
    </div>

    <ReadyQuantityPopup
      :visible="showFinishQuantityDialog"
      :source="planData"
      @close="closeFinishQuantityDialog"
      @loaded="finishQuantityPlans = $event"
      @saved="handleFinishQuantitiesSaved"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { onHide, onLoad, onUnload } from '@dcloudio/uni-app'
import { useI18n } from '../../utils/i18n.js'
import { safeBack } from '../../utils/navigation.js'
import { getLocalPlans, savePlanToLocal, searchPlans, getPlanDetail, splitDownloadDataToLocalPlans, updateLocalPlansStatus, updateLocalPlanStatusOnly, copyPhotosToItems } from '../../api/plan.js'
import ReadyQuantityPopup from './components/ReadyQuantityPopup.vue'
import { getQuantityPlanId, getQuantityPlans, getQuantityTotals, isMergedQuantityPlan, loadReadyQuantityPlans, patchReadyQuantities } from './utils/readyQuantity.js'
import { getAffectedDefectCounts } from './utils/defectTotals.js'
import { useReportStore } from '../../store/report.js'
import { buildStandardItemsFromItemResults } from './utils/itemTree.js'
import { getDefectTierTree, getDefectLevelDict, saveDefectTierCache, loadDefectTierCache } from '../../api/defect.js'
import { generateReport, deleteInspectFile, abortActiveInspectUploads } from '../../api/report.js'
import { makePhotoRecord, makePhotoRecordFromBlob, getPhotoDisplayUrl, isPhotoRecord, processPendingUploads, hasPendingPhotoUploads, hasAutoPendingPhotoUploads, countPendingPhotoUploads, resetPhotoForRetry, resetFailedPhotoUploadsForResume, releasePhotoUploadRetryWaits, getNextPhotoUploadRetryAt, getPhotoUploadSourceStatus } from '../../utils/photoUpload.js'
import { getBlob } from '../../utils/photoBlobStore.js'
import { idbGet, isIndexedDBAvailable } from '../../db/indexedDbStorage.js'
import { createSerialTaskQueue } from '../../utils/serialTaskQueue.js'
import { detectImageUploadConcurrency } from '../../utils/networkQuality.js'
import ReportDetailHeader from './components/ReportDetailHeader.vue'
import ReportDetailDefectsTab from './components/ReportDetailDefectsTab.vue'
import ReportDetailInfoTab from './components/ReportDetailInfoTab.vue'
import ReportDetailLocalDataTab from './components/ReportDetailLocalDataTab.vue'
import ChecklistTab from './components/ChecklistTab.vue'
import QuickDefectModal from './components/QuickDefectModal.vue'
import CategoryPickerDrawer from './components/CategoryPickerDrawer.vue'
import CheckItemModal from './components/CheckItemModal.vue'
import { getMediaPhotos, toChecklistPhotos } from './utils/checkPointMedia.js'

import CopyCheckItemsPopup from './components/CopyCheckItemsPopup.vue'
import BatchMoveMediaPopup from './components/BatchMoveMediaPopup.vue'
import PhotoEditor from './components/PhotoEditor.vue'

const reportStore = useReportStore()
const { t } = useI18n()
const pageQuery = ref({})

const planId = ref('')
const planData = ref({})
const loaded = ref(false)
const isPcBlocked = ref(false)
const isSyncing = ref(false)
const isUploadingPhotos = ref(false)
const hasLocalChanges = ref(false)
const localReportDebugText = ref('')
const localReportDebugUpdatedAt = ref('')
let cloudSyncTimer = null
const pendingUploadPromises = { image: null, video: null }
const pendingUploadRerunRequested = { image: false, video: false }
let _networkOnlineHandler = null
let _networkOfflineHandler = null
let _visibilityChangeHandler = null
let _pageShowHandler = null
let _pageAlive = false
let _photoUploadsPaused = false
let _photoUploadRetryTimer = null

const activeTab = ref('checklist')
const checklistData = ref({})
const defects = ref([])

// 疵点快速录入
const showQuickDefectModal = ref(false)
const editingDefectIndex = ref(-1)
const quickDefectSourceItem = ref({ id: '', name: '', itemResultId: '' })
const quickDefectReturnToChecklist = ref(false)
const defaultSeverityOptions = [
  { value: 'CRITICAL', labelKey: '致命缺陷', sortOrder: 1 },
  { value: 'MAJOR', labelKey: '主要缺陷', sortOrder: 2 },
  { value: 'MINOR', labelKey: '次要缺陷', sortOrder: 3 }
]
const quickDefectForm = ref({
  type: 'MINOR', quantity: 1, customQuantity: '', commonFlag: 0,
  tier1Code: '', tier2Code: '', tier3Code: '', defectCode: '', defectDesc: '',
  description: '', photos: []
})
const severityOptions = ref([])
const severityOptionsView = computed(() => {
  const src = severityOptions.value.length ? severityOptions.value : defaultSeverityOptions
  return src.map(opt => ({
    ...opt,
    label: t(opt?.labelKey || opt?.label || '')
  }))
})
const defectTierTree = ref([])
const defectTierLoading = ref(false)
const defectTierLoaded = ref(false)
const defectTierError = ref('')
const defectTierRetrying = ref(false)

// 疵点类别选择器
const showCategoryPicker = ref(false)
const categoryPickerStep = ref(1)
const categorySearchKeyword = ref('')
const recentCategoryHistory = ref([])
const DEFECT_CATEGORY_HISTORY_KEY = 'defect_category_history_v1'

// 检查项弹窗
const showItemModal = ref(false)
const itemModalAutoCapture = ref(false)
const currentItem = ref(null)
const currentItemSonPlanId = ref('')
const itemCaptureBusy = ref(false)
const pendingItemModalClose = ref(false)
const currentItemData = ref({
  photos: [], barcode: '', barcodeList: [], barcodeItems: [], measurements: [],
  textData: {}, textGroups: [], comment: '', result: '', completed: false
})

// 多张拍照

const showBatchMovePopup = ref(false)
const batchMoveSubmitting = ref(false)
const batchMoveMediaList = ref([])
const batchMoveSourceItemId = ref('')
const batchMoveSourceSonPlanId = ref('')
const batchMoveSourceDataKey = ref('')


// 总结提交
const showFinishModal = ref(false)
const overallResult = ref('')
const overallRemarks = ref('')
const showMissingDataDialog = ref(false)
const showFinishConfirmDialog = ref(false)
const isSubmittingFinish = ref(false)
const validationTriggered = ref(false)
const bodyRef = ref(null)
const checklistScrollTop = ref(0)
const checklistAnchorId = ref('')

const failedItemIds = computed(() => {
  if (!validationTriggered.value) return []
  const missing = []
  standardItems.value.forEach(section => {
    ;(section.children || []).forEach(child => {
      if (!child.isRequired) return
      const itemId = String(child.id || '')
      const result = checklistData.value[itemId]?.result
      if (result === 'na') return
      if (!result) missing.push(itemId)
    })
  })
  return missing
})

const failedPhotoItemIds = computed(() => {
  if (!validationTriggered.value) return []
  const missing = []
  standardItems.value.forEach(section => {
    ;(section.children || []).forEach(child => {
      if (!child.isPhotoRequired) return
      const itemId = String(child.id || '')
      const result = checklistData.value[itemId]?.result
      if (result === 'na') return
      if (!checklistData.value[itemId]?.photos?.length) missing.push(itemId)
    })
  })
  return missing
})
const showStatusPicker = ref(false)
const finishQuantityPlans = ref([])
const finishQuantityLoading = ref(false)
const localReadyQuantity = computed(() => finishQuantityTotals.value.readyQuantity)
const localSampleQuantity = computed(() => finishQuantityTotals.value.sampleQuantity)
const failedCheckpointsExpanded = ref(true)
const finishStatusLabelMap = computed(() => ({
  APPROVED: t('合格'),
  REJECTED: t('不合格'),
  PENDING: t('待定')
}))
const finishResultOptions = computed(() => ([
  { value: 'APPROVED', label: t('合格') },
  { value: 'REJECTED', label: t('不合格') },
  { value: 'PENDING', label: t('待定') }
]))

onMounted(async () => {
  if (isPcBlocked.value) return
  if (!planId.value) {
    planId.value = pageQuery.value.reportId || pageQuery.value.planId || ''
  }
  await Promise.all([loadPlanDetail(), loadDefectLevelOptions()])
  resetUploadingPhotosToPending()
  await restorePreviewUrlsFromBlobs()
  _pageAlive = true
  _networkOnlineHandler = () => {
    if (!_pageAlive) return
    resumePhotoUploadQueue({ releaseWaiting: true }); scheduleCloudSync(); processPendingFileDeletions()
  }
  _networkOfflineHandler = () => {
    if (!_pageAlive) return
    markUploadingPhotosOfflineFailed()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', _networkOnlineHandler)
    window.addEventListener('offline', _networkOfflineHandler)
    _pageShowHandler = () => {
      if (_pageAlive) resumePhotoUploadQueue({ releaseWaiting: true })
    }
    window.addEventListener('pageshow', _pageShowHandler)
  }
  if (typeof document !== 'undefined') {
    _visibilityChangeHandler = () => {
      if (_pageAlive && document.visibilityState === 'visible') {
        resumePhotoUploadQueue({ releaseWaiting: true })
      }
    }
    document.addEventListener('visibilitychange', _visibilityChangeHandler)
  }
  if (typeof uni !== 'undefined' && typeof uni.onNetworkStatusChange === 'function') {
    uni.onNetworkStatusChange((res) => {
      if (!_pageAlive) return
      if (res.isConnected) _networkOnlineHandler()
      else _networkOfflineHandler()
    })
  }
  processPendingFileDeletions()
  resumePhotoUploadQueue({ releaseWaiting: true })
  scheduleCloudSync()
})

onLoad((options = {}) => {
  pageQuery.value = options || {}
  planId.value = pageQuery.value.reportId || pageQuery.value.planId || ''
  if (isDesktopClient()) {
    enterPcBlockedMode()
  }
})

onUnmounted(() => {
  _pageAlive = false
  clearPhotoUploadRetryTimer()
  abortActiveInspectUploads()
  persistDraftBeforeLeave({ resetUploading: true })
  revokeRestoredBlobUrls()
  if (_networkOnlineHandler && typeof window !== 'undefined') {
    window.removeEventListener('online', _networkOnlineHandler)
  }
  if (_networkOfflineHandler && typeof window !== 'undefined') {
    window.removeEventListener('offline', _networkOfflineHandler)
  }
  if (_pageShowHandler && typeof window !== 'undefined') {
    window.removeEventListener('pageshow', _pageShowHandler)
  }
  if (_visibilityChangeHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', _visibilityChangeHandler)
  }
})

onHide(() => {
  persistDraftBeforeLeave({ resetUploading: false })
})

onUnload(() => {
  _pageAlive = false
  clearPhotoUploadRetryTimer()
  abortActiveInspectUploads()
  persistDraftBeforeLeave({ resetUploading: true })
})

function resetUploadingPhotosToPending() {
  const normalizePhotos = (photos = []) => {
    if (!Array.isArray(photos)) return
    photos.forEach((photo) => {
      if (!photo || typeof photo !== 'object') return
      if (photo.uploadStatus === 'uploading') {
        const hasServerFile = !!String(photo.fileId || '').trim()
        photo.uploadStatus = hasServerFile ? 'done' : 'pending'
      }
    })
  }

  Object.keys(checklistData.value || {}).forEach((key) => {
    normalizePhotos(checklistData.value?.[key]?.photos)
  })
  ;(defects.value || []).forEach((defect) => {
    normalizePhotos(defect?.photos)
  })
}

function markUploadingPhotosOfflineFailed() {
  _photoUploadsPaused = true
  abortActiveInspectUploads()
  let changed = false
  const markPhotos = (photos = []) => {
    if (!Array.isArray(photos)) return
    photos.forEach((photo) => {
      if (!photo || typeof photo !== 'object') return
      if (photo.uploadStatus !== 'uploading') return
      if (String(photo.fileId || '').trim()) {
        photo.uploadStatus = 'done'
        return
      }
      photo.uploadStatus = 'pending'
      photo.uploadError = t('网络已断开，恢复后将自动上传')
      photo._retryCount = 0
      delete photo.uploadStartedAt
      delete photo._uploadRunId
      changed = true
    })
  }

  Object.keys(checklistData.value || {}).forEach((key) => {
    markPhotos(checklistData.value?.[key]?.photos)
  })
  ;(defects.value || []).forEach((defect) => {
    markPhotos(defect?.photos)
  })
  markPhotos(currentItemData.value?.photos)
  markPhotos(quickDefectForm.value?.photos)

  if (changed) {
    isUploadingPhotos.value = false
    savePlanData({ markDirty: hasLocalChanges.value, trySync: false })
      .catch((error) => console.warn('[detail] save offline upload failure failed:', error))
  }
}

function isDesktopClient() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function') {
      const info = uni.getSystemInfoSync() || {}
      const platform = String(info?.platform || info?.uniPlatform || '').toLowerCase()
      console.log(platform)
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

function enterPcBlockedMode() {
  if (isPcBlocked.value) return
  isPcBlocked.value = true
  if (typeof uni !== 'undefined' && typeof uni.showModal === 'function') {
    uni.showModal({
      title: t('请使用手机端'),
      content: t('当前详情页仅支持手机端验货，请前往手机端继续操作。'),
      showCancel: false,
      confirmText: t('我知道了')
    })
  }
}

const _restoredBlobUrls = []

async function restorePreviewUrlsFromBlobs() {
  const restorePhotos = async (photos) => {
    if (!Array.isArray(photos)) return
    for (const photo of photos) {
      if (!photo || typeof photo !== 'object') continue
      if (photo.previewUrl || photo.fileId) continue
      const blobKey = String(photo.blobKey || '').trim()
      if (!blobKey) continue
      try {
        const blob = await getBlob(blobKey)
        if (blob && blob instanceof Blob) {
          photo._blob = blob
          photo.previewUrl = URL.createObjectURL(blob)
          _restoredBlobUrls.push(photo.previewUrl)
        }
      } catch {}
    }
  }
  for (const key of Object.keys(checklistData.value || {})) {
    await restorePhotos(checklistData.value[key]?.photos)
  }
  for (const defect of (defects.value || [])) {
    await restorePhotos(defect?.photos)
  }
}

function revokeRestoredBlobUrls() {
  _restoredBlobUrls.forEach(url => {
    try { URL.revokeObjectURL(url) } catch {}
  })
  _restoredBlobUrls.length = 0
}

function persistDraftBeforeLeave({ resetUploading = false } = {}) {
  if (!loaded.value || !planData.value) return

  if (resetUploading) {
    resetUploadingPhotosToPending()
  }

  savePlanData({ markDirty: hasLocalChanges.value, trySync: false })
    .catch((error) => {
      console.warn('[detail] persist draft failed:', error)
    })
}

// ─── 数据计算 ────────────────────────────────────────────

const pendingUploadCount = computed(() => {
  return reportStore.dirtyPlanIds.length + countPendingPhotoUploads(checklistData.value, defects.value)
})

const syncDebugInfo = computed(() => {
  const dirtyPlanIds = [...reportStore.dirtyPlanIds]
  const pendingPhotos = []
  const itemNameMap = {}
  ;(standardItems.value || []).forEach(section => {
    ;(section.children || []).forEach(child => {
      if (child.id) itemNameMap[String(child.id)] = child.itemName || String(child.id)
    })
  })
  const resolveItemName = (key) => {
    if (itemNameMap[key]) return itemNameMap[key]
    const baseId = key.includes('_') ? key.split('_')[0] : key
    return itemNameMap[baseId] || key
  }
  const collectPhotos = (photos, source, key, label) => {
    if (!Array.isArray(photos)) return
    photos.forEach((photo, index) => {
      if (!photo || typeof photo !== 'object') return
      const status = String(photo.uploadStatus || '').toLowerCase()
      if (status === 'done' || status === 'success' || status === 'uploaded') return
      if (photo.fileId) return
      pendingPhotos.push({
        source,
        key,
        label,
        index,
        status: status || 'unknown',
        retryCount: photo._retryCount || 0,
        error: photo.uploadError || ''
      })
    })
  }
  for (const key of Object.keys(checklistData.value || {})) {
    collectPhotos(checklistData.value[key]?.photos, 'checklist', key, resolveItemName(key))
  }
  ;(defects.value || []).forEach((defect, di) => {
    const defectLabel = defect?.defectDesc || defect?.defectCode || t('疵点{index}', { index: di + 1 })
    collectPhotos(defect?.photos, 'defect', String(di), defectLabel)
  })
  return { dirtyPlanIds, pendingPhotos }
})

const standardItems = computed(() => {
  if (Array.isArray(planData.value.standardItems) && planData.value.standardItems.length) {
    return planData.value.standardItems
  }
  if (Array.isArray(planData.value.itemResults) && planData.value.itemResults.length) {
    return buildStandardItemsFromItemResults(planData.value.itemResults)
  }
  return []
})

// 所有关联的验货计划行（合并验货时为多条，普通时只有一条）
const inspectionPlanRows = computed(() => {
  if (Array.isArray(planData.value?.inspectionPlans) && planData.value.inspectionPlans.length) {
    return planData.value.inspectionPlans
  }
  if (planData.value?.plan && typeof planData.value.plan === 'object') {
    return [planData.value.plan]
  }
  return []
})

// 是否为多计划合并验货模式（决定清单是否展示子计划行）
const hasMergedInspectionPlans = computed(() => inspectionPlanRows.value.length > 1)

const showCheckPointUpload = computed(() => {
  const plans = Array.isArray(planData.value?.inspectionPlans) ? planData.value.inspectionPlans : []
  const selectedId = currentItemSonPlanId.value || String(planId.value || '')
  const selectedPlan = plans.find(row => getInspectionPlanId(row) === selectedId)
    || (plans.length === 1 ? plans[0] : null)
  return Number(selectedPlan?.goodsFlag) === 9
})

// 清单整体完成百分比（已完成项 / 总项数）
const completionProgress = computed(() => {
  let total = 0, completed = 0
  standardItems.value.forEach(section => {
    (section.children || []).forEach(child => {
      total++
      if (checklistData.value[child.id]?.completed) completed++
    })
  })
  return total > 0 ? Math.round((completed / total) * 100) : 0
})

// 当前打开检查项的关联疵点（主行：checkItemResultId 为空或等于 checkItemId；子行：精确匹配）
const currentItemDefects = computed(() => {
  if (!currentItem.value) return []
  const itemId = String(currentItem.value.id || '')
  const sonPlanId = currentItemSonPlanId.value
  return defects.value.filter(d => {
    if (String(d?.checkItemId || '') !== itemId) return false
    const rid = String(d?.checkItemResultId || '').trim()
    if (sonPlanId) return rid === `${itemId}_${sonPlanId}`
    return !rid || rid === itemId
  })
})

// 各严重等级的疵点数量统计（用于疵点 Tab 头部显示）
const defectCounts = computed(() => ({
  critical: defects.value.filter(d => normalizeSeverityValue(d?.type, d?.typeLabel) === 'CRITICAL').length,
  major: defects.value.filter(d => normalizeSeverityValue(d?.type, d?.typeLabel) === 'MAJOR').length,
  minor: defects.value.filter(d => normalizeSeverityValue(d?.type, d?.typeLabel) === 'MINOR').length
}))

// ─── 总结弹窗计算属性 ─────────────────────────────────────

const finishPlan = computed(() => {
  const d = planData.value || {}
  return (d.plan && typeof d.plan === 'object') ? d.plan : d
})

const finishProductTitle = computed(() => {
  const p = finishPlan.value
  const no = p?.subGoodsNo || p?.planNo || p?.clientOrderNo || ''
  const name = p?.goodsName || ''
  return no && name ? `${no}：${name}` : (name || no || t('验货报告'))
})

const finishQuantityTotals = computed(() => getQuantityTotals(
  finishQuantityPlans.value.length ? finishQuantityPlans.value : getQuantityPlans(planData.value)
))
const finishOrderQuantity = computed(() => finishQuantityTotals.value.orderQuantity)
const finishAffectedDefectCounts = computed(() => getAffectedDefectCounts(defects.value, normalizeSeverityValue))

const finishDefectStats = computed(() => {
  const p = finishPlan.value
  const toNum = v => Number(v ?? 0)
  return [
    { key: 'critical', label: t('极严重'), actual: finishAffectedDefectCounts.value.critical, max: toNum(p?.criticalAc) },
    { key: 'major',    label: t('大'),     actual: finishAffectedDefectCounts.value.major,    max: toNum(p?.majorAc)    },
    { key: 'minor',    label: t('小'),     actual: finishAffectedDefectCounts.value.minor,    max: toNum(p?.minorAc)    },
  ].map(s => ({ ...s, exceed: s.actual > s.max }))
})

const finishExceedsAql = computed(() => finishDefectStats.value.some(s => s.exceed))

const finishFailedCheckpoints = computed(() => {
  const list = []
  standardItems.value.forEach(section => {
    ;(section.children || []).forEach(child => {
      const result = checklistData.value[String(child.id)]?.result
      if (result === 'fail') list.push({ id: child.id, name: child.itemName })
    })
  })
  return list
})

// 按严重等级分组的疵点列表，保持排序顺序（用于疵点 Tab 分组展示）
const defectGroups = computed(() => {
  const groupMap = new Map()
  const opts = severityOptionsView.value
  opts.forEach(opt => {
    groupMap.set(opt.value, { key: opt.value, label: opt.label, order: Number(opt.sortOrder || 999), affectedTotal: 0, items: [] })
  })
  defects.value.forEach(defect => {
    const key = normalizeSeverityValue(defect?.type, defect?.typeLabel)
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, label: getSeverityLabel(key), order: 999, affectedTotal: 0, items: [] })
    }
    const g = groupMap.get(key)
    g.items.push(defect)
    const qty = Number(defect?.quantity || 0)
    if (qty > 0) g.affectedTotal += qty
  })
  return Array.from(groupMap.values()).filter(g => g.items.length > 0).sort((a, b) => a.order - b.order)
})

// 按 checkItemId 索引的疵点 Map（供清单行快速查找关联疵点）
const itemDefectMap = computed(() => {
  const map = {}
  defects.value.forEach(d => {
    if (!d?.checkItemId) return
    if (!map[d.checkItemId]) map[d.checkItemId] = []
    map[d.checkItemId].push(d)
  })
  return map
})

// 疵点类别树各级别的可选节点（过滤已禁用节点）
const level1Options = computed(() => (defectTierTree.value || []).filter(n => n.status !== '1'))
const selectedLevel1 = computed(() => level1Options.value.find(n => n.code === quickDefectForm.value.tier1Code) || null)
const level2Options = computed(() => (selectedLevel1.value?.children || []).filter(n => n.status !== '1'))
const selectedLevel2 = computed(() => level2Options.value.find(n => n.code === quickDefectForm.value.tier2Code) || null)
const level3Options = computed(() =>
  (selectedLevel2.value?.children || []).filter(n => n.status !== '1' && (n.isLeaf || !n.children || !n.children.length))
)
// 当前类别选择步骤下对应的选项列表
const currentCategoryOptions = computed(() => {
  if (categoryPickerStep.value === 1) return level1Options.value
  if (categoryPickerStep.value === 2) return level2Options.value
  return level3Options.value
})
// 根据搜索关键词过滤后的当前级别选项
const filteredCategoryOptions = computed(() => {
  const kw = (categorySearchKeyword.value || '').toLowerCase()
  if (!kw) return currentCategoryOptions.value
  return currentCategoryOptions.value.filter(n =>
    (n.code || '').toLowerCase().includes(kw) || (n.name || '').toLowerCase().includes(kw)
  )
})

// ─── 工具函数 ────────────────────────────────────────────

// 将原始疵点严重等级值/标签统一映射为 CRITICAL / MAJOR / MINOR
function normalizeSeverityValue(rawValue, rawLabel) {
  const text = `${String(rawValue || '').toLowerCase()} ${String(rawLabel || '').toLowerCase()}`
  if (text.includes('critical') || text.includes('致命') || text.includes('极严重')) return 'CRITICAL'
  if (text.includes('major') || text.includes('主要') || text.includes('严重') || text.includes('大')) return 'MAJOR'
  if (text.includes('minor') || text.includes('次要') || text.includes('轻微') || text.includes('小')) return 'MINOR'
  return String(rawValue || 'MINOR').toUpperCase()
}

// 根据严重等级 key 获取可读标签（优先从服务端配置取，回退到默认配置）
function getSeverityLabel(type) {
  const key = normalizeSeverityValue(type, type)
  const opt = severityOptionsView.value.find(o => o.value === key)
  const label = opt?.labelKey || opt?.label
  if (label) return t(label)
  const fallback = defaultSeverityOptions.find(o => o.value === key)?.label
  return fallback ? t(fallback) : key
}

// 根据严重等级 key 返回对应 CSS 类名（用于颜色标记）
function getSeverityClass(type) {
  const key = normalizeSeverityValue(type, type)
  if (key === 'CRITICAL') return 'critical'
  if (key === 'MAJOR') return 'major'
  return 'minor'
}

// 将时间字符串格式化为"刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期"
function formatTime(timeStr) {
  if (!timeStr) return ''
  const date = new Date(timeStr)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('刚刚')
  if (minutes < 60) return t('{minutes}分钟前', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{hours}小时前', { hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('{days}天前', { days })
  return date.toLocaleDateString()
}

// 生成 checklistData 的存储键：合并验货时追加子计划 id 以区分不同计划行的数据
function getChecklistDataKey(itemId, sonPlanId = '') {
  const base = String(itemId || '')
  const son = String(sonPlanId || '').trim()
  return son ? `${base}__${son}` : base
}

// 从验货计划对象中提取计划 id 字符串
function getInspectionPlanId(plan) {
  return String(plan?.id || '').trim()
}

// 将本地结果值（pass/fail/pending/na）映射为服务端 resultStatus 枚举
function mapResultStatus(result) {
  if (result === 'pass') return 'APPROVED'
  if (result === 'fail') return 'REJECTED'
  if (result === 'pending') return 'PENDING'
  if (result === 'na') return 'NA'
  return null
}

// 将服务端 resultStatus 枚举映射回本地结果值（用于本地回显）
function parseResultStatus(resultStatus) {
  const status = String(resultStatus || '').toUpperCase()
  if (status === 'APPROVED' || status === 'PASS') return 'pass'
  if (status === 'REJECTED' || status === 'FAIL') return 'fail'
  if (status === 'PENDING') return 'pending'
  if (status === 'NA' || status === 'N/A') return 'na'
  return ''
}

function toMeasurementRows(specResult) {
  if (!specResult) return []
  if (Array.isArray(specResult)) return specResult
  if (typeof specResult === 'object') return [specResult]
  if (typeof specResult === 'string') {
    try {
      const parsed = JSON.parse(specResult)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') return [parsed]
      return []
    } catch {
      return []
    }
  }
  return []
}

function parseTextRows(textContent) {
  if (!textContent) return []
  if (Array.isArray(textContent)) return textContent
  if (typeof textContent === 'object') return [textContent]
  try {
    const parsed = JSON.parse(textContent)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
    return []
  } catch {
    return []
  }
}

function normalizeBarcodeItems(rawItems) {
  const rows = Array.isArray(rawItems) ? rawItems : []
  return rows
    .map((item) => {
      if (typeof item === 'string') {
        const code = String(item || '').trim()
        return code ? { name: '', code, format: '' } : null
      }
      if (!item || typeof item !== 'object') return null
      const code = String(item.code ?? item.value ?? item.barcode ?? '').trim()
      const name = String(item.name ?? item.label ?? '').trim()
      const format = String(item.format ?? item.scanType ?? '').trim()
      if (!code && !name && !format) return null
      return { name, code, format }
    })
    .filter(Boolean)
}

function parseBarcodeItems(rawBarcodeValue, fallbackBarcodeList = []) {
  if (Array.isArray(rawBarcodeValue)) {
    return normalizeBarcodeItems(rawBarcodeValue)
  }
  const text = String(rawBarcodeValue || '').trim()
  if (text) {
    try {
      const parsed = JSON.parse(text)
      const parsedItems = normalizeBarcodeItems(parsed)
      if (parsedItems.length) return parsedItems
    } catch {
      return [{ name: '', code: text, format: '' }]
    }
  }
  const fallbackItems = (Array.isArray(fallbackBarcodeList) ? fallbackBarcodeList : [])
    .map(code => String(code || '').trim())
    .filter(Boolean)
    .map(code => ({ name: '', code, format: '' }))
  return fallbackItems
}

function buildBarcodeValueJson(barcodeItems = [], barcode = '', barcodeList = []) {
  const items = normalizeBarcodeItems(barcodeItems)
  if (!items.length) {
    const manualCode = String(barcode || '').trim()
    if (manualCode) items.push({ name: '', code: manualCode, format: '' })
  }
  if (!items.length) {
    ;(Array.isArray(barcodeList) ? barcodeList : [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
      .forEach(code => items.push({ name: '', code, format: '' }))
  }
  return items.length ? JSON.stringify(items) : null
}

// 当本地没有 checklistData 时，基于 itemResults 回填回显数据
function buildChecklistDataFromItemResults(itemResults = []) {
  const rows = Array.isArray(itemResults) ? itemResults : []
  const data = {}
  rows.forEach((row) => {
    const rowId = String(row?.id || row?.itemResultId || '').trim()
    if (!rowId) return
    const sonPlanId = String(row?.sonPlanId || '').trim()
    let baseItemId = rowId
    if (sonPlanId) {
      if (row?.baseItemResultId) {
        baseItemId = String(row.baseItemResultId)
      } else if (rowId.endsWith(`_${sonPlanId}`)) {
        baseItemId = rowId.slice(0, -(`_${sonPlanId}`.length))
      }
    }
    const key = getChecklistDataKey(baseItemId, sonPlanId)
    const result = parseResultStatus(row?.resultStatus)
    const barcodeItems = parseBarcodeItems(row?.barcodeValue)
    const barcodeList = barcodeItems.map(item => String(item.code || '').trim()).filter(Boolean)
    const photos = toChecklistPhotos(row?.fileList)
    const measurements = toMeasurementRows(row?.specResult)
    const textGroups = parseTextRows(row?.textContent)
    const comment = row?.remarks || ''
    const completed = !!result
      || photos.length > 0
      || barcodeList.length > 0
      || hasFilledMeasurementValue(measurements)
      || hasFilledTextValue(textGroups)
      || !!String(comment).trim()
    data[key] = {
      photos,
      barcode: barcodeList[0] || '',
      barcodeList,
      barcodeItems,
      measurements,
      textData: {},
      textGroups,
      comment,
      result,
      completed
    }
  })
  return data
}

// 将检查项类型字符串标准化为固定枚举值
function mapItemType(type) {
  if (type === 'Measurements') return 'Measurements'
  if (type === 'Text') return 'Text'
  if (type === 'Barcodes') return 'Barcodes'
  return 'Standard'
}

// 将 standardItems 树形结构展开为一维数组（按章节顺序）
function flattenChecklistItems() {
  const rows = []
  standardItems.value.forEach(section => {
    (section?.children || []).forEach(child => rows.push(child))
  })
  return rows
}

const flatChecklistItemsForCopy = computed(() => {
  const rows = []
  standardItems.value.forEach(section => {
    (section?.children || []).forEach(child => rows.push(child))
  })
  return rows
})

function formatPlanRowLabel(plan) {
  const subGoodsNo = String(plan?.subGoodsNo || '').trim()
  const batchNo = String(plan?.batchNo || '').trim()
  const clientOrderNo = String(plan?.clientOrderNo || '').trim()
  const extra = [subGoodsNo, batchNo].filter(Boolean).join('#')
  if (extra && clientOrderNo) return `${clientOrderNo}（${extra}）`
  return clientOrderNo || extra || String(plan?.id || '').trim()
}

function findMergedBizIdForItem(item, sonPlanId) {
  const targetSon = String(sonPlanId || '').trim()
  if (!targetSon) return ''
  const itemId = String(item?.id || '').trim()
  const itemStandardId = String(item?.standardItemId || '').trim()
  const rows = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  const matched = rows.find(row => {
    if (String(row?.sonPlanId || '').trim() !== targetSon) return false
    const rowId = String(row?.id || row?.itemResultId || '').trim()
    const baseItemResultId = String(row?.baseItemResultId || '').trim()
    const rowStandardItemId = String(row?.standardItemId || '').trim()
    if (baseItemResultId && itemId && baseItemResultId === itemId) return true
    if (itemStandardId && rowStandardItemId && itemStandardId === rowStandardItemId) return true
    return !!rowId && itemId && rowId === `${itemId}_${targetSon}`
  })
  return matched ? String(matched.id || matched.itemResultId || '').trim() : ''
}

const batchMoveTargetItems = computed(() => {
  const items = flattenChecklistItems()
  const sourceItemId = String(batchMoveSourceItemId.value || '').trim()
  const sourceSon = String(batchMoveSourceSonPlanId.value || '').trim()
  const list = []

  if (!hasMergedInspectionPlans.value) {
    items.forEach(item => {
      const itemId = String(item?.id || '').trim()
      if (!itemId) return
      if (itemId === sourceItemId) return
      list.push({ bizId: itemId, itemId, sonPlanId: '', name: item.itemName || itemId, subLabel: '' })
    })
    return list
  }

  items.forEach(item => {
    const itemId = String(item?.id || '').trim()
    if (!itemId) return
    if (itemId === sourceItemId && !sourceSon) return
    list.push({ bizId: itemId, itemId, sonPlanId: '', name: item.itemName || itemId, subLabel: '' })
  })

  inspectionPlanRows.value.forEach(planRow => {
    const sonPlanId = getInspectionPlanId(planRow)
    if (!sonPlanId) return
    const subLabel = formatPlanRowLabel(planRow)
    items.forEach(item => {
      const itemId = String(item?.id || '').trim()
      if (!itemId) return
      if (itemId === sourceItemId && sonPlanId === sourceSon) return
      const bizId = findMergedBizIdForItem(item, sonPlanId)
      if (!bizId) return
      list.push({ bizId, itemId, sonPlanId, name: item.itemName || itemId, subLabel })
    })
  })

  return list
})

// 在 standardItems 树中根据 id 查找单个检查项
function findChecklistItemById(itemId) {
  for (const section of standardItems.value || []) {
    const found = (section.children || []).find(c => c.id === itemId)
    if (found) return found
  }
  return null
}

// 检查测量数据行中是否存在至少一个非空值
function hasFilledMeasurementValue(measurements) {
  return (Array.isArray(measurements) ? measurements : []).some(
    row => row && Object.values(row).some(v => String(v || '').trim())
  )
}

// 检查文本数据行中是否存在至少一个非空值
function hasFilledTextValue(textRows) {
  return (Array.isArray(textRows) ? textRows : []).some(
    row => row && Object.values(row).some(v => String(v || '').trim())
  )
}

// 根据检查项类型及当前填写数据判断该项是否已完成
function isItemCompleted(item, data, sonPlanId = '') {
  const isMergedChildRow = hasMergedInspectionPlans.value && !!String(sonPlanId || '').trim()
  if (!isMergedChildRow && item.isPhotoRequired && (!data.photos || !data.photos.length)) return false
  if (item.itemType === 'Barcodes') {
    if (Array.isArray(data.barcodeItems) && data.barcodeItems.some(i => String(i?.code || '').trim())) return true
    return !!(data.barcodeList?.length)
  }
  if (item.itemType === 'Measurements') return hasFilledMeasurementValue(data.measurements)
  if (item.itemType === 'Text') return hasFilledTextValue(data.textGroups)
  if (item.itemType === 'Standard') return !!(data.result)
  return true
}

// 将原始测量数据规范化为对象数组，每个对象的键与 specAttributes attrId 对齐
function normalizeMeasurementRows(rawMeasurements, specAttributes = []) {
  const attrIds = (specAttributes || []).map(a => a.attrId)
  const empty = () => Object.fromEntries(attrIds.map(id => [id, '']))
  if (Array.isArray(rawMeasurements) && rawMeasurements.length) {
    return rawMeasurements.map(row => {
      const r = empty()
      attrIds.forEach(id => { r[id] = row?.[id] ?? '' })
      return r
    })
  }
  if (rawMeasurements && typeof rawMeasurements === 'object' && !Array.isArray(rawMeasurements)) {
    const r = empty()
    attrIds.forEach(id => { r[id] = rawMeasurements[id] ?? '' })
    return [r]
  }
  return [empty()]
}

// 将原始文本数据规范化为对象数组，每个对象的键与 specAttributes attrId 对齐
function normalizeTextRows(rawTextRows, specAttributes = []) {
  const attrIds = (specAttributes || []).map(a => a.attrId)
  const empty = () => Object.fromEntries(attrIds.map(id => [id, '']))
  if (Array.isArray(rawTextRows) && rawTextRows.length) {
    return rawTextRows.map(row => {
      const r = empty()
      attrIds.forEach(id => { r[id] = row?.[id] ?? '' })
      return r
    })
  }
  if (rawTextRows && typeof rawTextRows === 'object' && !Array.isArray(rawTextRows)) {
    const r = empty()
    attrIds.forEach(id => { r[id] = rawTextRows[id] ?? '' })
    return [r]
  }
  return [empty()]
}

// 将测量数据转换为提交给服务端的 specResult 数组格式（过滤空行，值转字符串）
function buildSpecResultFromMeasurements(measurements) {
  if (!Array.isArray(measurements)) {
    return (measurements && typeof measurements === 'object') ? [measurements] : []
  }
  return measurements.map(row => {
    if (!row || typeof row !== 'object') return null
    const cleaned = {}
    Object.keys(row).forEach(k => { cleaned[k] = row[k] == null ? '' : String(row[k]) })
    return cleaned
  }).filter(Boolean)
}

// 将疵点严重等级映射为数值评分（用于服务端 severity 字段）
function mapDefectSeverityScore(type) {
  const key = normalizeSeverityValue(type, type)
  if (key === 'CRITICAL') return 4
  if (key === 'MAJOR') return 3
  if (key === 'MINOR') return 2
  return 1
}

// ─── 数据加载 ────────────────────────────────────────────

// 若当前计划是合并验货（mergeType=2）中的子计划，返回主计划 id；否则返回 null
function getMergedSiblingPrimaryId(plan) {
  const mergeType = Number(plan?.plan?.mergeType ?? plan?.mergeType ?? 0)
  if (mergeType !== 2) return null
  const parentId = String(plan?.plan?.parentPlanId ?? plan?.parentPlanId ?? '').trim()
  const ownId = String(plan?.id || plan?.planId || plan?.reportId || '').trim()
  if (!parentId || parentId === ownId) return null
  return parentId
}

// 从本地存储加载验货计划详情，合并验货时同步读取主计划的清单数据
async function loadPlanDetail() {
  try {
    const normalizedPlanId = String(planId.value || '').trim()
    if (!normalizedPlanId) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.showToast === 'function') {
        globalThis.showToast(t('缺少计划ID'))
      } else {
        alert(t('缺少计划ID'))
      }
      uni.reLaunch({ url: '/pages/report/list' })
      return
    }

    const needsRefresh = checkAndClearRefreshMark(normalizedPlanId)
    if (needsRefresh) {
      try {
        const freshData = await getPlanDetail(normalizedPlanId)
        if (freshData) {
          const plans = splitDownloadDataToLocalPlans(freshData)
          if (plans.length) {
            await savePlanToLocal(plans[0])
          }
        }
      } catch (e) {
        console.warn('从后端刷新数据失败，使用本地缓存:', e)
      }
    }

    let localPlans = await getLocalPlans()
    let localPlan = localPlans.find(p => String(p?.id ?? p?.planId ?? p?.reportId ?? '') === normalizedPlanId)

    if (!localPlan) {
      try {
        const freshData = await getPlanDetail(normalizedPlanId)
        if (freshData) {
          const plans = splitDownloadDataToLocalPlans(freshData)
          for (const record of plans) {
            await savePlanToLocal(record)
          }
        }
      } catch (e) {
        console.warn('从后端拉取计划详情失败，使用本地缓存:', e)
      }
      localPlans = await getLocalPlans()
      localPlan = localPlans.find(p => String(p?.id ?? p?.planId ?? p?.reportId ?? '') === normalizedPlanId)
    }

    if (localPlan) {
      const primaryId = getMergedSiblingPrimaryId(localPlan)
      const primaryPlan = primaryId
        ? localPlans.find(p => String(p?.id || p?.planId || p?.reportId || '') === String(primaryId || '').trim()) || null
        : null
      const sharedSource = primaryPlan || localPlan
      planData.value = {
        ...localPlan,
        itemResults: sharedSource.itemResults || localPlan.itemResults || [],
        standardItems: sharedSource.standardItems || localPlan.standardItems || []
      }
      const primarySyncSource = primaryPlan || localPlan
      hasLocalChanges.value = primarySyncSource?.syncStatus === 'DIRTY' || !!primarySyncSource?.pendingSyncPayload
      const savedChecklistData = sharedSource.checklistData
      checklistData.value = (savedChecklistData && Object.keys(savedChecklistData).length)
        ? savedChecklistData
        : buildChecklistDataFromItemResults(sharedSource.itemResults || [])
      const defectSource = sharedSource.defects || sharedSource.defectRecords || []
      defects.value = (Array.isArray(defectSource) ? defectSource : []).map((defect, index) => {
        const itemResultId = String(defect?.checkItemResultId || defect?.itemResultId || '').trim()
        const checkItemId = String(defect?.checkItemId || (itemResultId.includes('_') ? itemResultId.split('_')[0] : itemResultId) || '').trim()
        const defectCode = String(defect?.defectCode || defect?.tier3Code || '').trim()
        return {
          id: defect?.id || `${Date.now()}_defect_${index}`,
          type: normalizeSeverityValue(defect?.type || defect?.defectType || defect?.defectLevel, defect?.typeLabel || defect?.defectLevel),
          quantity: Number(defect?.quantity ?? defect?.defectCount ?? 0),
          commonFlag: Number(defect?.commonFlag ?? (defect?.isCommon ? 1 : 0)),
          defectCode,
          defectDesc: String(defect?.defectDesc || '').trim(),
          tier1Code: defect?.tier1Code || '',
          tier2Code: defect?.tier2Code || '',
          tier3Code: defect?.tier3Code || defectCode,
          description: defect?.description || defect?.remark || '',
          checkItemId,
          checkItemName: defect?.checkItemName || defect?.defectPosition || '',
          checkItemResultId: itemResultId,
          sonPlanId: String(defect?.sonPlanId || '').trim(),
          photos: (Array.isArray(defect?.photos) && defect.photos.length) ? defect.photos : toChecklistPhotos(defect?.fileList),
          createdAt: defect?.createdAt,
          updatedAt: defect?.updatedAt,
        }
      })
      loaded.value = true
    } else {
      if (typeof globalThis !== 'undefined' && typeof globalThis.showToast === 'function') {
        globalThis.showToast(t('未找到验货计划'))
      } else {
        alert(t('未找到验货计划'))
      }
      uni.reLaunch({ url: '/pages/report/list' })
    }
  } catch (error) {
    console.error('加载计划详情失败:', error)
    if (typeof globalThis !== 'undefined' && typeof globalThis.showToast === 'function') {
      globalThis.showToast(error.message || t('加载失败'))
    } else {
      alert(error.message || t('加载失败'))
    }
    uni.reLaunch({ url: '/pages/report/list' })
  }
}

// 从服务端拉取疵点严重等级字典并归一化，加载失败时回退到本地默认配置
async function loadDefectLevelOptions() {
  try {
    const rows = await getDefectLevelDict()
    const options = (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
      if (!item || typeof item !== 'object') return acc
      const rawValue = item.dictValue ?? item.value ?? item.code
      const rawLabel = item.dictLabel ?? item.label ?? item.name
      const value = normalizeSeverityValue(rawValue, rawLabel)
      const label = String(rawLabel || '').trim()
      if (value && label) acc.push({ value, label, sortOrder: Number(item.sortOrder || 0) })
      return acc
    }, [])
    if (options.length) {
      const deduped = Array.from(new Map(options.map(o => [o.value, o])).values())
      severityOptions.value = deduped.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
    } else {
      severityOptions.value = [...defaultSeverityOptions]
    }
  } catch {
    severityOptions.value = [...defaultSeverityOptions]
  }
}

// ─── 本地调试数据 ─────────────────────────────────────────

// 切换到"本地数据"调试 Tab 并刷新展示内容
async function openLocalDataTab() {
  activeTab.value = 'localData'
  await refreshLocalReportDebug()
}

// 递归裁剪调试数据：截断长字符串、替换 base64 图片、处理循环引用，避免 JSON 体积过大
function simplifyDebugValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > 20) return '[Depth Limited]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) return `[ImageBase64 omitted, length=${value.length}]`
    if (value.length > 2000) return `${value.slice(0, 200)}... [omitted ${value.length - 200} chars]`
    return value
  }
  if (Array.isArray(value)) return value.map(item => simplifyDebugValue(item, depth + 1, seen))
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const out = {}
    Object.keys(value).forEach(key => { out[key] = simplifyDebugValue(value[key], depth + 1, seen) })
    return out
  }
  return value
}

// 读取本地存储中当前报告的原始数据并序列化为格式化 JSON，供调试 Tab 展示
async function refreshLocalReportDebug() {
  try {
    const localPlans = await getLocalPlans()
    const key = String(planId.value || '')
    const currentReport = localPlans.find(item => String(item?.id || item?.planId || item?.reportId || '') === key) || null
    let memoryDb = null
    try {
      if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
        memoryDb = uni.getStorageSync('__QARMA_MEMORY_DB__')
      }
      if (!memoryDb && isIndexedDBAvailable()) {
        memoryDb = await idbGet('__QARMA_MEMORY_DB__')
      }
    } catch {}
    const reportTableRows = Array.isArray(memoryDb?.report)
      ? memoryDb.report.filter(row => String(row?.reportId || '') === key)
      : []
    localReportDebugText.value = JSON.stringify(simplifyDebugValue({ reportId: key, reportTableRows, currentReport }), null, 2)
    localReportDebugUpdatedAt.value = new Date().toLocaleString()
  } catch (error) {
    localReportDebugText.value = `加载本地数据失败: ${error?.message || error}`
    localReportDebugUpdatedAt.value = new Date().toLocaleString()
  }
}

// 将调试 JSON 复制到系统剪贴板（适配 uni 环境与 Web 环境）
async function copyLocalReportDebug() {
  const text = localReportDebugText.value || ''
  if (!text) { alert(t('暂无可复制内容')); return }
  try {
    if (typeof uni !== 'undefined' && typeof uni.setClipboardData === 'function') {
      await new Promise((resolve, reject) => {
        uni.setClipboardData({ data: text, success: resolve, fail: reject })
      })
      alert(t('已复制到剪贴板'))
      return
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      alert(t('已复制到剪贴板'))
      return
    }
    throw new Error(t('当前环境不支持复制'))
  } catch (error) {
    alert(error?.message || t('复制失败'))
  }
}

// ─── 同步 ────────────────────────────────────────────────

// 返回上一页
function goBack() { safeBack({ fallbackUrl: '/pages/report/list' }) }
function handlePcBlockedBack() { goBack() }

let _syncDataLock = false
async function syncData() {
  if (_syncDataLock) return
  _syncDataLock = true
  try {
    await savePlanData({ markDirty: true, trySync: false })
    await tryCloudSync({ force: true, showToast: true })
  } catch (error) {
    console.error('同步失败:', error)
    alert(error.message || t('同步失败'))
  } finally {
    _syncDataLock = false
  }
}

// 将当前 checklistData / defects 合并回 planData 并持久化到本地存储；
// markDirty=true 时标记待同步，trySync=true 时调度自动云同步
const enqueuePlanSave = createSerialTaskQueue()

function savePlanData(options = {}) {
  return enqueuePlanSave(() => performSavePlanData(options))
}

async function performSavePlanData(options = {}) {
  const { markDirty = true, trySync = true } = options
  const now = new Date().toISOString()
  const syncedItemResults = syncLocalItemResultsFromChecklistData()
  planData.value = { ...planData.value, itemResults: syncedItemResults }
  const pendingSyncPayload = buildGeneratePayload()
  const currentLocalStatusRaw = planData.value?.status
  const currentLocalStatusNum = Number(currentLocalStatusRaw)
  const currentLocalStatusText = String(currentLocalStatusRaw ?? '').trim().toUpperCase()
  const isNotStarted = Number.isFinite(currentLocalStatusNum)
    ? currentLocalStatusNum === 0
    : (currentLocalStatusText === '0' || currentLocalStatusText === 'DOWNLOADED' || currentLocalStatusText === 'NEW')
  const shouldMoveToInProgress = markDirty && isNotStarted
  const normalizedCurrentStatus = Number.isFinite(currentLocalStatusNum)
    ? (currentLocalStatusNum === 2 ? 1 : currentLocalStatusNum)
    : 1
  const nextLocalStatus = shouldMoveToInProgress
    ? 1
    : normalizedCurrentStatus
  const rawPlanStatus = Number(planData.value?.plan?.status)
  const nextPlanStatus = markDirty
    ? (Number.isFinite(rawPlanStatus) ? Math.max(rawPlanStatus, 1) : 1)
    : (planData.value?.plan?.status ?? 1)

  const primaryId = getMergedSiblingPrimaryId(planData.value)
  const isMergedChild = !!primaryId

  const updatedPlan = {
    ...planData.value,
    status: nextLocalStatus,
    plan: { ...(planData.value?.plan || {}), status: nextPlanStatus },
    itemResults: syncedItemResults,
    checklistData: checklistData.value,
    defects: defects.value,
    progress: completionProgress.value,
    pendingSyncPayload: isMergedChild ? null : pendingSyncPayload,
    syncStatus: isMergedChild
      ? (planData.value?.syncStatus || 'SYNCED')
      : (markDirty ? 'DIRTY' : (planData.value?.syncStatus || 'SYNCED')),
    updatedAt: now
  }
  await savePlanToLocal(updatedPlan)

  if (primaryId) {
    try {
      const allPlans = await getLocalPlans()
      const primaryPlan = allPlans.find(p => String(p?.id || p?.planId || p?.reportId || '') === primaryId)
      if (primaryPlan) {
        await savePlanToLocal({
          ...primaryPlan,
          checklistData: checklistData.value,
          defects: defects.value,
          itemResults: syncedItemResults,
          progress: completionProgress.value,
          pendingSyncPayload: markDirty ? pendingSyncPayload : (primaryPlan.pendingSyncPayload || null),
          syncStatus: markDirty ? 'DIRTY' : (primaryPlan.syncStatus || 'SYNCED'),
          updatedAt: now
        })
      }
    } catch (error) {
      console.warn('同步清单数据到合并主计划失败:', error)
    }
  }

  if (markDirty) await syncMergedSiblingPlansInProgress(updatedPlan)
  planData.value = updatedPlan
  if (markDirty) {
    hasLocalChanges.value = true
    reportStore.markPlanDirty(planId.value)
  }
  if (trySync) scheduleCloudSync()
}

// 获取本地计划的数值状态（0=未开始，1=进行中，2=已完成）
function getLocalPlanNumericStatus(plan) {
  const s = String(plan?.status ?? '').trim()
  const n = Number(s)
  if (Number.isFinite(n)) {
    if (n === 2) return 1
    return n
  }
  const t = s.toUpperCase()
  if (t === 'DOWNLOADED' || t === 'NEW') return 0
  if (t === 'DRAFT' || t === 'IN_PROGRESS') return 1
  if (t === 'COMPLETED' || t === 'DONE' || t === 'SUBMITTED') return 3
  const raw = Number(plan?.plan?.status)
  if (Number.isFinite(raw)) return raw
  return 0
}

function isReportAlreadySubmitted(plan = planData.value) {
  const statusRaw = String(plan?.status ?? '').trim()
  const numericStatus = Number(statusRaw)
  if (Number.isFinite(numericStatus) && numericStatus === 3) return true
  const statusText = statusRaw.toUpperCase()
  if (['COMPLETED', 'DONE', 'SUBMITTED'].includes(statusText)) return true
  const numericPlanStatus = Number(plan?.plan?.status)
  if (Number.isFinite(numericPlanStatus) && numericPlanStatus === 3) return true
  const planStatusText = String(plan?.plan?.status || '').toUpperCase()
  return ['COMPLETED', 'DONE', 'SUBMITTED'].includes(statusText) ||
    ['COMPLETED', 'DONE', 'SUBMITTED'].includes(planStatusText)
}

// 将同一合并验货组内还处于"未开始"状态的兄弟计划同步标记为"进行中"
async function syncMergedSiblingPlansInProgress(currentPlan) {
  const mergeType = Number(currentPlan?.plan?.mergeType ?? currentPlan?.mergeType ?? 0)
  const parentPlanId = String(currentPlan?.plan?.parentPlanId ?? currentPlan?.parentPlanId ?? '').trim()
  if (mergeType !== 2 || !parentPlanId) return
  const currentKey = String(currentPlan?.planId || currentPlan?.id || '')
  const localPlans = await getLocalPlans()
  if (!Array.isArray(localPlans) || !localPlans.length) return
  const siblingPlanIds = []
  for (const sibling of localPlans) {
    const siblingKey = String(sibling?.planId || sibling?.id || '')
    if (siblingKey === currentKey) continue
    const siblingMergeType = Number(sibling?.plan?.mergeType ?? sibling?.mergeType ?? 0)
    const siblingParentId = String(sibling?.plan?.parentPlanId ?? sibling?.parentPlanId ?? '').trim()
    if (siblingMergeType !== 2 || siblingParentId !== parentPlanId) continue
    if (getLocalPlanNumericStatus(sibling) !== 0) continue
    if (siblingKey) siblingPlanIds.push(siblingKey)
  }
  if (siblingPlanIds.length) {
    try {
      await updateLocalPlansStatus(siblingPlanIds, 1)
    } catch (error) {
      console.warn('同步合并验货状态失败:', error)
    }
  }
}

function buildReportedLocalPlan(plan, now = new Date().toISOString()) {
  const inspectionPlans = Array.isArray(plan?.inspectionPlans)
    ? plan.inspectionPlans.map((row) => ({ ...(row || {}), status: 3 }))
    : []
  return {
    ...plan,
    status: 3,
    plan: { ...(plan?.plan || {}), status: 3 },
    inspectionPlans,
    updatedAt: now
  }
}

async function syncMergedSiblingPlansToReported(currentPlan) {
  const mergeType = Number(currentPlan?.plan?.mergeType ?? currentPlan?.mergeType ?? 0)
  const parentPlanId = String(currentPlan?.plan?.parentPlanId ?? currentPlan?.parentPlanId ?? '').trim()
  if (mergeType !== 2 || !parentPlanId) return
  const currentKey = String(currentPlan?.planId || currentPlan?.id || '')
  const localPlans = await getLocalPlans()
  if (!Array.isArray(localPlans) || !localPlans.length) return
  const now = new Date().toISOString()
  const siblingPlanIds = []
  for (const sibling of localPlans) {
    const siblingKey = String(sibling?.planId || sibling?.id || '')
    if (siblingKey === currentKey) continue
    const siblingMergeType = Number(sibling?.plan?.mergeType ?? sibling?.mergeType ?? 0)
    const siblingParentId = String(sibling?.plan?.parentPlanId ?? sibling?.parentPlanId ?? '').trim()
    if (siblingMergeType !== 2 || siblingParentId !== parentPlanId) continue
    if (getLocalPlanNumericStatus(sibling) !== 1) continue
    if (siblingKey) siblingPlanIds.push(siblingKey)
  }
  if (siblingPlanIds.length) {
    try {
      await updateLocalPlansStatus(siblingPlanIds, 3)
    } catch (error) {
      console.warn('同步合并验货报告状态失败:', error)
    }
  }
}

async function markCurrentAndMergedPlansReported() {
  const now = new Date().toISOString()
  const currentPlanId = String(planId.value || planData.value?.planId || '').trim()
  const current = {
    ...planData.value,
    status: 3,
    plan: { ...(planData.value?.plan || {}), status: 3 },
    updatedAt: now
  }
  if (currentPlanId) {
    await updateLocalPlanStatusOnly(currentPlanId, 3)
  }
  planData.value = current
  await syncMergedSiblingPlansToReported(current)
}

function isReportedStatus(status) {
  const raw = String(status ?? '').trim()
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric === 3) return true
  const text = raw.toUpperCase()
  return ['COMPLETED', 'DONE', 'SUBMITTED', 'REPORTED'].includes(text)
}

function pickCurrentInspectionPlan(detail, currentPlanId) {
  const inspectionPlans = Array.isArray(detail?.inspectionPlans) ? detail.inspectionPlans : []
  if (!inspectionPlans.length) return detail?.plan || detail?.report || null
  const normalizedCurrentPlanId = String(currentPlanId || '').trim()
  if (!normalizedCurrentPlanId) return inspectionPlans[0] || null
  return inspectionPlans.find((row) => {
    const rowId = String(row?.id || row?.planId || row?.reportId || '').trim()
    return rowId === normalizedCurrentPlanId
  }) || inspectionPlans[0] || null
}

async function isCurrentPlanReportedOnServer() {
  const currentPlanId = String(planId.value || planData.value?.planId || planData.value?.id || '').trim()
  if (!currentPlanId) return false
  const detail = await getPlanDetail(currentPlanId)
  const currentInspectionPlan = pickCurrentInspectionPlan(detail, currentPlanId)
  const planStatus = currentInspectionPlan?.status
  const rootPlanStatus = detail?.plan?.status
  return isReportedStatus(planStatus) || isReportedStatus(rootPlanStatus)
}

// 延迟触发云同步（防抖，避免频繁保存时重复请求）
function scheduleCloudSync(delay = 500) {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer)
  cloudSyncTimer = setTimeout(() => {
    if (isUploadingPhotos.value) {
      scheduleCloudSync(2000)
      return
    }
    tryCloudSync()
  }, delay)
}

// 检测当前网络是否在线（适配 uni 环境与浏览器环境）
async function isNetworkOnline() {
  return new Promise((resolve) => {
    if (typeof uni === 'undefined' || typeof uni.getNetworkType !== 'function') {
      resolve(navigator?.onLine !== false)
      return
    }
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType !== 'none'),
      fail: () => resolve(false)
    })
  })
}

// 获取当前计划的子货号（用于图片上传时附带业务标识）
function getSubGoodsNo() {
  return planData.value?.plan?.subGoodsNo || ''
}

function clearPhotoUploadRetryTimer() {
  if (_photoUploadRetryTimer !== null) clearTimeout(_photoUploadRetryTimer)
  _photoUploadRetryTimer = null
}

function scheduleNextPhotoUploadRetry(nextRetryAt = getNextPhotoUploadRetryAt(checklistData.value, defects.value)) {
  clearPhotoUploadRetryTimer()
  if (nextRetryAt === null || nextRetryAt === undefined || nextRetryAt === '') return
  const retryAt = Number(nextRetryAt)
  if (!_pageAlive || !Number.isFinite(retryAt)) return
  const delay = Math.max(0, Math.min(retryAt - Date.now(), 2_147_000_000))
  _photoUploadRetryTimer = setTimeout(() => {
    _photoUploadRetryTimer = null
    if (_pageAlive) triggerPendingUploads()
  }, delay)
}

function resumePhotoUploadQueue({ releaseWaiting = false } = {}) {
  resetFailedPhotoUploadsForResume(checklistData.value, defects.value)
  if (releaseWaiting) {
    releasePhotoUploadRetryWaits(checklistData.value, defects.value)
  }
  clearPhotoUploadRetryTimer()
  _photoUploadsPaused = false
  triggerPendingUploads()
}

function updatePhotoUploadingState() {
  isUploadingPhotos.value = !!(
    pendingUploadPromises.image || pendingUploadPromises.video
  )
}

async function triggerPhotoUploadQueue(mediaKind) {
  if (pendingUploadPromises[mediaKind]) {
    pendingUploadRerunRequested[mediaKind] = true
    return pendingUploadPromises[mediaKind]
  }
  if (_photoUploadsPaused) return
  if (!hasAutoPendingPhotoUploads(checklistData.value, defects.value, mediaKind)) {
    scheduleNextPhotoUploadRetry()
    return
  }

  pendingUploadPromises[mediaKind] = (async () => {
    const online = await isNetworkOnline()
    if (!online) return
    const concurrency = mediaKind === 'image'
      ? await detectImageUploadConcurrency()
      : 1
    try {
      const result = await processPendingUploads(
        checklistData.value, defects.value,
        () => savePlanData({ markDirty: false, trySync: false }),
        {
          mediaKind,
          concurrency,
          videoConcurrency: 1,
          onUploaded: () => reportStore.removePhotos(),
          shouldContinue: () => _pageAlive && !_photoUploadsPaused
        }
      )
      if (result.needsAttention > 0) {
        uni.showToast({ title: t('{count} 张图片需要处理', { count: result.needsAttention }), icon: 'none', duration: 3000 })
      }
    } catch (error) {
      console.warn('批量上传图片失败:', error)
      uni.showToast({ title: t('图片上传失败: {msg}', { msg: error.message || t('未知错误') }), icon: 'none', duration: 3000 })
    } finally {
      scheduleNextPhotoUploadRetry()
      if (!_photoUploadsPaused && hasAutoPendingPhotoUploads(checklistData.value, defects.value, mediaKind)) {
        setTimeout(() => triggerPhotoUploadQueue(mediaKind), 0)
      } else if (!hasPendingPhotoUploads(checklistData.value, defects.value) && hasLocalChanges.value) {
        scheduleCloudSync(500)
      }
    }
  })().finally(() => {
    pendingUploadPromises[mediaKind] = null
    updatePhotoUploadingState()
    if (pendingUploadRerunRequested[mediaKind]) {
      pendingUploadRerunRequested[mediaKind] = false
      if (!_photoUploadsPaused && hasAutoPendingPhotoUploads(checklistData.value, defects.value, mediaKind)) {
        setTimeout(() => triggerPhotoUploadQueue(mediaKind), 0)
      }
    }
  })
  updatePhotoUploadingState()

  return pendingUploadPromises[mediaKind]
}

function triggerPendingUploads() {
  return Promise.all([
    triggerPhotoUploadQueue('image'),
    triggerPhotoUploadQueue('video')
  ])
}

// 执行一次云同步：先上传 pending 图片，再提交报告数据；离线或无本地变更时跳过
async function tryCloudSync(options = {}) {
  const { force = false, showToast = false } = options
  if (isSyncing.value) return false
  if (isUploadingPhotos.value) {
    scheduleCloudSync(2000)
    return false
  }
  if (!force && !hasLocalChanges.value) return false
  if (isReportAlreadySubmitted()) {
    hasLocalChanges.value = false
    if (showToast) alert(t('该报告已提交，无法再次同步'))
    return false
  }
  const online = await isNetworkOnline()
  if (!online) {
    if (showToast) alert(t('当前无网络，暂无法同步'))
    return false
  }
  isSyncing.value = true
  try {
    const payload = buildGeneratePayload()
    await generateReport(payload)
    hasLocalChanges.value = false
    const syncedNow = new Date().toISOString()
    const syncedPlan = {
      ...planData.value,
      syncStatus: 'SYNCED',
      pendingSyncPayload: null,
      syncedAt: syncedNow,
      updatedAt: syncedNow
    }
    await savePlanToLocal(syncedPlan)
    planData.value = syncedPlan
    await clearMergedGroupSyncStatus(syncedPlan, syncedNow)
    reportStore.markPlanSynced(planId.value)
    if (showToast) alert(t('同步成功'))
    return true
  } catch (error) {
    console.error('云同步失败:', error)
    if (showToast) alert(error.message || t('同步失败'))
    return false
  } finally {
    isSyncing.value = false
  }
}

async function clearMergedGroupSyncStatus(currentPlan, syncedAt) {
  const mergeType = Number(currentPlan?.plan?.mergeType ?? currentPlan?.mergeType ?? 0)
  if (mergeType !== 2) return
  const parentPlanId = String(currentPlan?.plan?.parentPlanId ?? currentPlan?.parentPlanId ?? '').trim()
  const currentKey = String(currentPlan?.id || currentPlan?.planId || currentPlan?.reportId || '')
  if (!parentPlanId) return
  try {
    const allPlans = await getLocalPlans()
    for (const sibling of allPlans) {
      const siblingKey = String(sibling?.id || sibling?.planId || sibling?.reportId || '')
      if (siblingKey === currentKey) continue
      const siblingParentId = String(sibling?.plan?.parentPlanId ?? sibling?.parentPlanId ?? '').trim()
      const isSameGroup = siblingParentId === parentPlanId || siblingKey === parentPlanId
      if (!isSameGroup) continue
      if (sibling.syncStatus !== 'DIRTY' && !sibling.pendingSyncPayload) continue
      await savePlanToLocal({
        ...sibling,
        syncStatus: 'SYNCED',
        pendingSyncPayload: null,
        syncedAt,
        updatedAt: syncedAt
      })
    }
  } catch (error) {
    console.warn('清除合并验货组同步状态失败:', error)
  }
}

// 等待同步相关接口进入空闲状态（上传图片/云同步），避免与"结束验货提交"并发冲突
async function waitForSyncIdle(options = {}) {
  const { timeoutMs = 30000, intervalMs = 120 } = options
  const start = Date.now()
  while (isSyncing.value || isUploadingPhotos.value) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(t('同步任务处理超时，请稍后重试'))
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

// ─── 清单数据同步 ─────────────────────────────────────────

// 合并验货模式下，确保子计划对应的 itemResult 行已存在（不存在则基于主行克隆新增）
function ensureMergedItemResultRow(itemId, sonPlanId = '') {
  const childPlanId = String(sonPlanId || '').trim()
  if (!hasMergedInspectionPlans.value || !childPlanId) return
  const rows = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  if (!rows.length) return
  const sourceId = String(itemId || '')
  const sourceRow = rows.find(row => String(row?.id || row?.itemResultId || '') === sourceId && !row?.sonPlanId)
  if (!sourceRow) return
  const sourceStandardId = String(sourceRow.standardItemId || '')
  const existed = rows.some(row => {
    if (String(row?.sonPlanId || '').trim() !== childPlanId) return false
    return String(row?.baseItemResultId || '') === sourceId ||
      (sourceStandardId && String(row?.standardItemId || '') === sourceStandardId)
  })
  if (existed) {
    // 历史子行可能沿用了主行必填配置，这里统一矫正为非必填
    planData.value = {
      ...planData.value,
      itemResults: rows.map(row => {
        if (String(row?.sonPlanId || '').trim() !== childPlanId) return row
        return { ...row, isRequired: 0, isPhotoRequired: 0 }
      })
    }
    return
  }
  const newId = `${sourceId}_${childPlanId}`
  planData.value = {
    ...planData.value,
    itemResults: [...rows, {
      ...sourceRow,
      id: newId,
      itemResultId: newId,
      baseItemResultId: sourceId,
      sonPlanId: childPlanId,
      isRequired: 0,
      isPhotoRequired: 0,
      updateDate: new Date().toISOString()
    }]
  }
}

// 将 checklistData 的最新填写结果同步写回 planData.itemResults，生成可提交的记录数组
function syncLocalItemResultsFromChecklistData() {
  const rows = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  if (!rows.length) return []
  const checklistItemMap = new Map()
  flattenChecklistItems().forEach(item => {
    const id = String(item?.id || '')
    if (id) checklistItemMap.set(id, item)
  })
  return rows.map(row => {
    const rowId = String(row?.id || row?.itemResultId || '')
    const rowSonPlanId = String(row?.sonPlanId || '').trim()
    if (!rowId) return row
    let baseItemId = rowId
    if (rowSonPlanId) {
      if (row?.baseItemResultId) {
        baseItemId = String(row.baseItemResultId)
      } else if (rowId.endsWith(`_${rowSonPlanId}`)) {
        baseItemId = rowId.slice(0, -(`_${rowSonPlanId}`.length))
      }
    }
    const checklistItem = checklistItemMap.get(baseItemId)
    if (!checklistItem) return row
    const dataKey = getChecklistDataKey(baseItemId, rowSonPlanId)
    const sourceData = checklistData.value?.[dataKey]
    if (!sourceData || typeof sourceData !== 'object') return row
    const itemType = mapItemType(checklistItem?.itemType || row?.itemType)
    const barcodeList = Array.isArray(sourceData?.barcodeList) ? sourceData.barcodeList : []
    const barcodeValueJson = buildBarcodeValueJson(sourceData?.barcodeItems, sourceData?.barcode, barcodeList)
    const syncedFileList = (Array.isArray(sourceData?.photos) ? sourceData.photos : [])
      .filter(p => p && typeof p === 'object' && (p.fileId || p.filePath || p.thumbnailPath))
      .map(p => {
        const entry = { fileId: p.fileId || '', filePath: p.filePath || '', thumbnailPath: p.thumbnailPath || '' }
        if (p.bizType) entry.bizType = p.bizType
        if (p.fileType) entry.fileType = p.fileType
        if (p.fileExt) entry.fileExt = p.fileExt
        if (p.fileName) entry.fileName = p.fileName
        if (p.mediaType) entry.mediaType = p.mediaType
        if (p.mimeType) entry.mimeType = p.mimeType
        if (p.coverUrl) entry.coverUrl = p.coverUrl
        if (p.duration) entry.duration = p.duration
        return entry
      })
    const nextRow = {
      ...row,
      barcodeValue: barcodeValueJson,
      resultStatus: mapResultStatus(sourceData.result),
      remarks: sourceData.comment || null,
      fileList: syncedFileList.length ? syncedFileList : (row.fileList || null),
      updateDate: new Date().toISOString()
    }
    if (itemType === 'Measurements') {
      const specResult = buildSpecResultFromMeasurements(sourceData.measurements)
      nextRow.specResult = specResult.length ? JSON.stringify(specResult) : null
      nextRow.textContent = null
    } else if (itemType === 'Text') {
      nextRow.textContent = JSON.stringify(normalizeTextRows(sourceData.textGroups ?? sourceData.textData, checklistItem.specAttributes || []))
      nextRow.specResult = null
    } else {
      nextRow.specResult = null
      nextRow.textContent = null
    }
    return nextRow
  })
}

// 仅更新 planData.itemResults 中对应行的 resultStatus（轻量同步，避免全量重算）
function syncLocalItemResultStatus(itemId, result, sonPlanId = '') {
  const targetId = String(itemId || '')
  const targetSon = String(sonPlanId || '').trim()
  const nextStatus = mapResultStatus(result)
  const rows = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  if (!rows.length) return
  planData.value = {
    ...planData.value,
    itemResults: rows.map(row => {
      const rowId = String(row?.id || row?.itemResultId || '')
      const rowSon = String(row?.sonPlanId || '').trim()
      if (rowId !== targetId || rowSon !== targetSon) return row
      return { ...row, resultStatus: nextStatus, updateDate: new Date().toISOString() }
    })
  }
}

// ─── 生成同步 payload ─────────────────────────────────────

// 根据当前 checklistData / defects 构建提交给后端 generateReport 的完整 payload
function buildGeneratePayload() {
  const currentPlanId = String(planId.value || planData.value?.id || planData.value?.planId || '')
  const currentReportId = String(planData.value?.reportId || planData.value?.report?.id || currentPlanId)
  const inspectorName = String(planData.value?.plan?.inspectorName || '')
  const rawItemResults = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  const sourceItemResultById = new Map()
  const itemResultIdByStandardItemId = new Map()
  const sonPlanRowIdLookup = new Map()

  rawItemResults.forEach(row => {
    const rowId = String(row?.id || row?.itemResultId || '')
    if (rowId && !sourceItemResultById.has(rowId)) sourceItemResultById.set(rowId, row)
    const standardItemId = String(row?.standardItemId || row?.id || '')
    const recordId = String(row?.id || row?.itemResultId || '')
    if (!standardItemId || !recordId) return
    if (!row?.sonPlanId && !itemResultIdByStandardItemId.has(standardItemId)) {
      itemResultIdByStandardItemId.set(standardItemId, recordId)
    }
    const rowSonPlanId = String(row?.sonPlanId || '').trim()
    if (rowSonPlanId && standardItemId) {
      const lk = `${standardItemId}:::${rowSonPlanId}`
      if (!sonPlanRowIdLookup.has(lk)) sonPlanRowIdLookup.set(lk, recordId)
    }
  })

  const shouldInclude = (data = {}) => {
    if (!data || typeof data !== 'object') return false
    if (String(data.result || '').trim()) return true
    if (Array.isArray(data.photos) && data.photos.length) return true
    if (Array.isArray(data.barcodeItems) && data.barcodeItems.some(i => String(i?.code || '').trim())) return true
    if (Array.isArray(data.barcodeList) && data.barcodeList.length) return true
    if (String(data.barcode || '').trim()) return true
    if (String(data.comment || '').trim()) return true
    if (hasFilledMeasurementValue(data.measurements)) return true
    if (hasFilledTextValue(data.textGroups)) return true
    return false
  }

  const createPayload = (checklistItem, sourceData = {}, opts = {}) => {
    const sourceTemplate = sourceItemResultById.get(String(checklistItem?.id || '')) || {}
    const itemId = String(checklistItem?.id || '')
    const originalItemResultId = itemResultIdByStandardItemId.get(itemId) || itemId
    const sonPlanId = String(opts.sonPlanId || '')
    const standardItemId = String(checklistItem?.standardItemId || sourceTemplate?.standardItemId || '')
    const checklistStandardId = String(checklistItem?.standardItemId || '')
    const barcodeList = Array.isArray(sourceData?.barcodeList) ? sourceData.barcodeList : []
    const barcodeValueJson = buildBarcodeValueJson(sourceData?.barcodeItems, sourceData?.barcode, barcodeList)
    const itemType = mapItemType(checklistItem?.itemType)
    const payloadId = sonPlanId
      ? (sonPlanRowIdLookup.get(`${checklistStandardId}:::${sonPlanId}`) || `${originalItemResultId}_${sonPlanId}`)
      : originalItemResultId

    const specResultRows = itemType === 'Measurements' ? buildSpecResultFromMeasurements(sourceData.measurements) : []
    const specResult = itemType === 'Measurements' && specResultRows.length
      ? JSON.stringify(specResultRows)
      : null
    
    let textContent = null
    if (itemType === 'Text' && hasFilledTextValue(sourceData.textGroups ?? sourceData.textData)) {
      textContent = JSON.stringify(normalizeTextRows(sourceData.textGroups ?? sourceData.textData, checklistItem.specAttributes || []))
    }

    const result = {
      id: payloadId, planId: currentPlanId, standardItemId, itemType, textContent,
      barcodeValue: barcodeValueJson,
      resultStatus: mapResultStatus(sourceData.result),
      remarks: sourceData.comment || null,
      sonPlanId: sonPlanId || null
    }
    if (specResult) result.specResult = specResult
    return result
  }

  const itemResults = []
  flattenChecklistItems().forEach(checklistItem => {
    const itemId = String(checklistItem?.id || '')
    if (!itemId) return
    if (hasMergedInspectionPlans.value) {
      itemResults.push(createPayload(checklistItem, checklistData.value?.[itemId] || {}))
      inspectionPlanRows.value.forEach(planRow => {
        const sonPlanId = getInspectionPlanId(planRow)
        if (!sonPlanId) return
        const rowKey = getChecklistDataKey(itemId, sonPlanId)
        const sourceData = checklistData.value?.[rowKey] || {}
        if (!shouldInclude(sourceData)) return
        itemResults.push(createPayload(checklistItem, sourceData, { sonPlanId }))
      })
      return
    }
    itemResults.push(createPayload(checklistItem, checklistData.value?.[itemId] || {}))
  })

  const defectRecords = (defects.value || []).map((defect, i) => ({
    id: defect?.id || `${currentPlanId}_defect_${i}`,
    defectId: defect?.id || `${currentPlanId}_defect_${i}`,
    planId: currentPlanId,
    defectType: normalizeSeverityValue(defect?.type || defect?.defectType || defect?.defectLevel, defect?.typeLabel || defect?.defectLevel).toLowerCase(),
    defectCode: defect?.defectCode || '',
    defectDesc: defect?.defectDesc || '',
    // defectPosition: defect?.checkItemName || defect?.defectPosition || '',
    itemResultId: defect?.checkItemResultId || defect?.itemResultId || '',
    defectCount: Number(defect?.quantity ?? defect?.defectCount ?? 0),
    commonFlag: Number(defect?.commonFlag ?? (defect?.isCommon ? 1 : 0)),
    // severity: mapDefectSeverityScore(defect?.type || defect?.defectType || defect?.defectLevel),
    remark: defect?.description || defect?.remark || '',
    findUser: inspectorName,
    // boxNo: String(planData.value?.plan?.batchNo || ''),
    // sampleNo: String(planData.value?.plan?.sampleSize || ''),
    sonPlanId: defect?.sonPlanId || null
  }))

  const seenIds = new Set()
  const deduped = itemResults.filter(r => {
    const rid = String(r?.id || '')
    if (!rid || seenIds.has(rid)) return false
    seenIds.add(rid)
    return true
  })

  return {
    reportId: currentReportId,
    planId: currentPlanId,
    itemResults: deduped,
    defectRecords,
    overallResult: null,
    overallRemarks: String(planData.value?.overallRemarks || planData.value?.plan?.overallRemarks || ''),
    finishFlag: '0'
  }
}

// ─── 清单操作 ─────────────────────────────────────────────

// 滑动操作展开时，若该项尚无结果则自动设为"通过"（快捷操作入口）
async function handleChecklistSwipeOpen(itemId, sonPlanId = '') {
  ensureMergedItemResultRow(itemId, sonPlanId)
  const dataKey = getChecklistDataKey(itemId, sonPlanId)
  const currentResult = checklistData.value[dataKey]?.result
  if (!currentResult) {
    if (!checklistData.value[dataKey]) checklistData.value[dataKey] = {}
    checklistData.value[dataKey].result = 'pass'
    checklistData.value[dataKey].completed = true
    checklistData.value[dataKey].updatedAt = new Date().toISOString()
    syncLocalItemResultStatus(itemId, 'pass', sonPlanId)
    await savePlanData()
  }
}

// 直接设置清单项结果并保存；结果为"不合格"时自动打开快速录入疵点弹窗
async function setItemResult(itemId, result, sonPlanId = '', checklistItem = null) {
  ensureMergedItemResultRow(itemId, sonPlanId)
  const dataKey = getChecklistDataKey(itemId, sonPlanId)
  if (!checklistData.value[dataKey]) checklistData.value[dataKey] = {}
  checklistData.value[dataKey].result = result
  checklistData.value[dataKey].completed = result !== 'pending'
  checklistData.value[dataKey].updatedAt = new Date().toISOString()
  syncLocalItemResultStatus(itemId, result, sonPlanId)
  await savePlanData()
  if (result === 'fail') {
    const item = checklistItem || findChecklistItemById(itemId)
    if (item) await startQuickDefectForChecklistItem(item, sonPlanId)
  }
}

// 根据 standardItemId（及可选的子计划 id）查找对应的 itemResult 记录 id
function getItemResultIdForItem(standardItemId, sonPlanId = '') {
  const rows = planData.value?.itemResults || []
  if (sonPlanId) {
    const mergedRow = rows.find(r =>
      String(r?.standardItemId || '') === String(standardItemId) && String(r?.sonPlanId || '') === String(sonPlanId)
    )
    if (mergedRow) return String(mergedRow.id || mergedRow.itemResultId || '')
  }
  const baseRow = rows.find(r => String(r?.standardItemId || '') === String(standardItemId) && !r?.sonPlanId)
  return baseRow ? String(baseRow.id || baseRow.itemResultId || '') : ''
}

function resolveChecklistPhotoBizId(item, sonPlanId = '') {
  const itemId = String(item?.id || '').trim()
  if (!itemId) return ''
  const childPlanId = String(sonPlanId || '').trim()
  if (!childPlanId) return itemId
  const rows = Array.isArray(planData.value?.itemResults) ? planData.value.itemResults : []
  const matched = rows.find(row => {
    if (String(row?.sonPlanId || '').trim() !== childPlanId) return false
    const rowId = String(row?.id || row?.itemResultId || '').trim()
    const baseItemResultId = String(row?.baseItemResultId || '').trim()
    const rowStandardItemId = String(row?.standardItemId || '').trim()
    const itemStandardItemId = String(item?.standardItemId || '').trim()
    if (baseItemResultId && baseItemResultId === itemId) return true
    if (itemStandardItemId && rowStandardItemId && itemStandardItemId === rowStandardItemId) return true
    return !!rowId && rowId === `${itemId}_${childPlanId}`
  })
  const matchedId = String(matched?.id || matched?.itemResultId || '').trim()
  return matchedId || `${itemId}_${childPlanId}`
}

// ─── 检查项弹窗 ───────────────────────────────────────────

// 打开检查项详情弹窗，初始化 currentItemData（规范化测量/文本数据格式）
function openChecklistItem(item, sonPlanId = '') {
  currentItem.value = item
  currentItemSonPlanId.value = String(sonPlanId || '')
  const dataKey = getChecklistDataKey(item.id, currentItemSonPlanId.value)
  const savedData = checklistData.value[dataKey] || {}
  const measurements = item.itemType === 'Measurements'
    ? normalizeMeasurementRows(savedData.measurements ?? savedData.specResult, item.specAttributes || [])
    : (Array.isArray(savedData.measurements) ? savedData.measurements : [])
  const textGroups = item.itemType === 'Text'
    ? normalizeTextRows(savedData.textGroups ?? savedData.textData, item.specAttributes || [])
    : (Array.isArray(savedData.textGroups) ? savedData.textGroups : [])
  currentItemData.value = {
    photos: savedData.photos || [],
    barcode: '',
    barcodeList: savedData.barcodeList || [],
    barcodeItems: Array.isArray(savedData.barcodeItems)
      ? savedData.barcodeItems
      : parseBarcodeItems(savedData.barcodeValue, savedData.barcodeList || []),
    measurements,
    textData: savedData.textData || {},
    textGroups,
    comment: savedData.comment || '',
    result: savedData.result || '',
    completed: savedData.completed || false
  }
  showItemModal.value = true
}

// 关闭检查项弹窗并清空当前项状态
function closeItemModal() {
  if (itemCaptureBusy.value) {
    pendingItemModalClose.value = true
    return
  }
  showItemModal.value = false
  pendingItemModalClose.value = false
  itemModalAutoCapture.value = false
  currentItem.value = null
  currentItemSonPlanId.value = ''
}

function handleItemCaptureStart() {
  itemCaptureBusy.value = true
}

function handleItemCaptureEnd() {
  itemCaptureBusy.value = false
  if (pendingItemModalClose.value) closeItemModal()
}

function getPhotoIdentity(photo) {
  if (!photo || typeof photo !== 'object') return ''
  return [
    photo._id,
    photo.blobKey,
    photo.fileId,
    photo.localPath,
    photo.previewUrl,
    photo.sourceName
  ].map(value => String(value || '').trim()).find(Boolean) || ''
}

function mergeLivePhotoUploadState(nextData = {}, existingData = {}) {
  const nextPhotos = Array.isArray(nextData.photos) ? nextData.photos : []
  const existingPhotos = Array.isArray(existingData.photos) ? existingData.photos : []
  if (!nextPhotos.length || !existingPhotos.length) return nextData

  const existingByIdentity = new Map()
  existingPhotos.forEach((photo) => {
    const key = getPhotoIdentity(photo)
    if (key) existingByIdentity.set(key, photo)
  })

  const photos = nextPhotos.map((photo) => {
    if (!photo || typeof photo !== 'object') return photo
    const existing = existingByIdentity.get(getPhotoIdentity(photo))
    if (!existing || existing === photo) return photo

    const existingStatus = String(existing.uploadStatus || '').toLowerCase()
    const nextStatus = String(photo.uploadStatus || '').toLowerCase()
    const existingHasLiveUploadState = existingStatus === 'uploading'
      || existingStatus === 'done'
      || existingStatus === 'error'
      || existingStatus === 'retry_wait'
      || existingStatus === 'needs_attention'
      || !!String(existing.fileId || '').trim()

    if (!existingHasLiveUploadState || (nextStatus && nextStatus !== 'pending')) {
      return photo
    }

    return {
      ...photo,
      uploadStatus: existing.uploadStatus,
      uploadError: existing.uploadError,
      _retryCount: existing._retryCount,
      nextRetryAt: existing.nextRetryAt,
      fileId: existing.fileId,
      fileName: existing.fileName,
      filePath: existing.filePath,
      fileExt: existing.fileExt,
      thumbnailPath: existing.thumbnailPath,
      fileType: existing.fileType,
      mediaType: existing.mediaType || photo.mediaType,
      mimeType: existing.mimeType || photo.mimeType,
      previewUrl: existing.previewUrl || photo.previewUrl,
      coverUrl: existing.coverUrl || photo.coverUrl
    }
  })

  return { ...nextData, photos }
}

function buildCurrentItemSaveData(dataKey) {
  const existingData = checklistData.value?.[dataKey] || {}
  const nextData = {
    ...currentItemData.value,
    completed: isItemCompleted(currentItem.value, currentItemData.value, currentItemSonPlanId.value),
    updatedAt: new Date().toISOString()
  }
  return mergeLivePhotoUploadState(nextData, existingData)
}

// 在检查项弹窗中确认结果：校验必填照片 → 保存 → 不合格时跳转录入疵点 → 关闭弹窗
async function selectResultAndClose(result) {
  if (!currentItem.value) return
  currentItemData.value.result = result
  const isMergedChildRow = hasMergedInspectionPlans.value && !!String(currentItemSonPlanId.value || '').trim()
  if (!isMergedChildRow && currentItem.value.isPhotoRequired && (!currentItemData.value.photos || !currentItemData.value.photos.length)) {
    alert(t('请上传照片(必填项)'))
    return
  }
  const itemId = currentItem.value.id
  ensureMergedItemResultRow(itemId, currentItemSonPlanId.value)
  const dataKey = getChecklistDataKey(itemId, currentItemSonPlanId.value)
  checklistData.value[dataKey] = buildCurrentItemSaveData(dataKey)
  syncLocalItemResultStatus(itemId, result, currentItemSonPlanId.value)
  await savePlanData()
  if (result === 'fail') {
    const item = currentItem.value
    const sonPlanId = currentItemSonPlanId.value
    closeItemModal()
    await startQuickDefectForChecklistItem(item, sonPlanId)
    return
  }
  closeItemModal()
}

// 文本检查项下拉选择变更：选择"不合格"时自动保存并跳转疵点录入，否则仅自动保存
async function handleTextResultChange(attrId, groupIndex = 0) {
  const value = currentItemData.value.textGroups?.[groupIndex]?.[attrId]
  if (value !== '不合格') {
    await autoSaveItemData()
    return
  }
  currentItemData.value.result = 'fail'
  if (!currentItem.value) return
  const checklistItem = currentItem.value
  ensureMergedItemResultRow(checklistItem.id, currentItemSonPlanId.value)
  const itemId = checklistItem.id
  const dataKey = getChecklistDataKey(itemId, currentItemSonPlanId.value)
  checklistData.value[dataKey] = buildCurrentItemSaveData(dataKey)
  syncLocalItemResultStatus(itemId, 'fail', currentItemSonPlanId.value)
  await savePlanData()
  closeItemModal()
  await startQuickDefectForChecklistItem(checklistItem, currentItemSonPlanId.value)
}

// 将检查项弹窗当前填写内容自动保存到 checklistData（不关闭弹窗）
async function autoSaveItemData() {
  if (!currentItem.value) return
  const itemId = currentItem.value.id
  ensureMergedItemResultRow(itemId, currentItemSonPlanId.value)
  const dataKey = getChecklistDataKey(itemId, currentItemSonPlanId.value)
  checklistData.value[dataKey] = buildCurrentItemSaveData(dataKey)
  await savePlanData()
}

// ─── 检查点重置 ───────────────────────────────────────────

// 尝试删除服务端已上传文件；离线时加入待删除队列
async function processPendingFileDeletions() {
  if (!navigator.onLine) return
  const pending = Array.isArray(planData.value?.pendingFileDeletions)
    ? planData.value.pendingFileDeletions
    : []
  if (!pending.length) return

  const remaining = []
  for (const entry of pending) {
    try {
      await deleteInspectFile(entry.fileId)
    } catch (e) {
      console.warn('[resetItem] 删除文件失败，稍后重试:', entry.fileId, e)
      remaining.push(entry)
    }
  }

  if (remaining.length !== pending.length) {
    planData.value = { ...planData.value, pendingFileDeletions: remaining }
    await savePlanToLocal(planData.value)
  }
}

// 将文件 id 加入待删除队列（去重），并在在线时立即触发删除
async function enqueueFileDeletion(fileId) {
  const id = String(fileId || '').trim()
  if (!id) return
  const prev = Array.isArray(planData.value?.pendingFileDeletions)
    ? planData.value.pendingFileDeletions
    : []
  if (!prev.some(entry => String(entry?.fileId || '').trim() === id)) {
    planData.value = {
      ...planData.value,
      pendingFileDeletions: [...prev, { fileId: id }]
    }
    await savePlanToLocal(planData.value)
  }
  await processPendingFileDeletions()
}

async function deleteRemoteFileForUserAction(photo) {
  const id = String(photo?.fileId || '').trim()
  if (!id) return true
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    uni.showToast({ title: t('网络离线，无法确认线上删除'), icon: 'none', duration: 3000 })
    return false
  }
  try {
    await deleteInspectFile(id)
    return true
  } catch (error) {
    console.warn('[media] 删除文件失败:', id, error)
    uni.showToast({
      title: error?.message || t('线上删除失败，请重试'),
      icon: 'none',
      duration: 3000
    })
    return false
  }
}

// 重置当前检查项到初始状态（含二次确认 + 图片删除 + 持久化）
async function resetCurrentCheckItem() {
  if (!currentItem.value) return

  const confirmed = confirm(
    '重置检查点\n请确认您是否把当前检查点重置到下载/初始创建的状态？'
  )
  if (!confirmed) return

  const itemId = currentItem.value.id
  const sonPlanId = currentItemSonPlanId.value
  const dataKey = getChecklistDataKey(itemId, sonPlanId)
  const savedData = checklistData.value[dataKey] || {}

  // 1. 收集已上传的图片，加入删除队列后异步处理
  const uploadedPhotos = (Array.isArray(savedData.photos) ? savedData.photos : [])
    .filter(p => p?.fileId)
  if (uploadedPhotos.length) {
    const prev = Array.isArray(planData.value.pendingFileDeletions)
      ? planData.value.pendingFileDeletions
      : []
    planData.value = {
      ...planData.value,
      pendingFileDeletions: [
        ...prev,
        ...uploadedPhotos.map(p => ({ fileId: p.fileId }))
      ]
    }
    processPendingFileDeletions()
  }

  // 2. 子行（sonPlanId 有值）：直接删除对应 checklistData 键和 itemResult 行
  if (sonPlanId) {
    delete checklistData.value[dataKey]
    planData.value = {
      ...planData.value,
      itemResults: (planData.value.itemResults || []).filter(row => {
        const rid = String(row.id || row.itemResultId || '')
        return rid !== `${itemId}_${sonPlanId}`
      })
    }
  } else {
    // 2. 二级行：只清除填写内容，保留 key
    delete checklistData.value[dataKey]
  }

  // 3. 重置弹窗内当前展示数据
  currentItemData.value = {
    photos: [],
    barcode: '',
    barcodeList: [],
    barcodeItems: [],
    result: null,
    comment: '',
    measurements: [],
    textGroups: [],
    completed: false
  }

  // 4. 保存 + 关闭弹窗
  await savePlanData()
  closeItemModal()
}

// ─── 媒体处理 ─────────────────────────────────────────────

// 长按检查项媒体：弹出确认后删除该媒体并自动保存
const showMediaEditor = ref(false)
const mediaEditorPhotoSrc = ref('')
let mediaEditorIndex = -1

function showMediaMenu(index) {
  uni.showActionSheet({
    itemList: ['编辑', '删除'],
    success: (res) => {
      if (res.tapIndex === 0) {
        openMediaEditor(index)
      } else if (res.tapIndex === 1) {
        deleteMedia(index)
      }
    }
  })
}

async function deleteMedia(index) {
  uni.showModal({
    title: '删除图片',
    content: '确定要删除这张图片吗？',
    success: async (res) => {
      if (!res.confirm) return
      const targetPhoto = currentItemData.value.photos?.[index]
      if (targetPhoto?.fileId) {
        const deleted = await deleteRemoteFileForUserAction(targetPhoto)
        if (!deleted) return
      }
      currentItemData.value.photos.splice(index, 1)
      autoSaveItemData()
      if (targetPhoto?.blobKey) {
        import('../../utils/photoBlobStore.js').then(m => m.removeBlob(targetPhoto.blobKey)).catch(() => {})
      } else if (targetPhoto && isPhotoRecord(targetPhoto) && targetPhoto.uploadStatus !== 'done') {
        reportStore.removePhotos()
      }
    }
  })
}

function openMediaEditor(index) {
  const photo = currentItemData.value.photos?.[index]
  if (!photo) return
  mediaEditorIndex = index
  mediaEditorPhotoSrc.value = getPhotoDisplayUrl(photo, 'preview') || photo.dataUrl || photo.localPath || ''
  showMediaEditor.value = true
}

function closeMediaEditor() {
  showMediaEditor.value = false
  mediaEditorPhotoSrc.value = ''
  mediaEditorIndex = -1
  defectPhotoEditing.value = false
}

function saveMediaEditor(dataUrl) {
  if (defectPhotoEditing.value) {
    if (mediaEditorIndex >= 0 && quickDefectForm.value.photos?.[mediaEditorIndex]) {
      const oldPhoto = quickDefectForm.value.photos[mediaEditorIndex]
      const subGoodsNo = oldPhoto?.subGoodsNo || getSubGoodsNo()
      const sortNo = oldPhoto?.sortNo || (mediaEditorIndex + 1)
      if (oldPhoto?.fileId) {
        enqueueFileDeletion(oldPhoto.fileId)
      } else if (oldPhoto?.uploadStatus !== 'done') {
        reportStore.removePhotos()
      }
      const newRecord = makePhotoRecord(dataUrl, { bizId: '', bizType: 'defect', subGoodsNo, sortNo })
      quickDefectForm.value.photos[mediaEditorIndex] = newRecord
      reportStore.addPhotos()
      triggerPendingUploads()
    }
    defectPhotoEditing.value = false
  } else if (mediaEditorIndex >= 0 && currentItemData.value.photos?.[mediaEditorIndex]) {
    const oldPhoto = currentItemData.value.photos[mediaEditorIndex]
    const bizId = oldPhoto?.bizId || resolveChecklistPhotoBizId(currentItem.value, currentItemSonPlanId.value) || String(currentItem.value?.id || '')
    const subGoodsNo = oldPhoto?.subGoodsNo || getSubGoodsNo()
    const sortNo = oldPhoto?.sortNo || (mediaEditorIndex + 1)
    if (oldPhoto?.fileId) {
      enqueueFileDeletion(oldPhoto.fileId)
    } else if (oldPhoto?.uploadStatus !== 'done') {
      reportStore.removePhotos()
    }
    const newRecord = makePhotoRecord(dataUrl, { bizId, bizType: oldPhoto?.bizType || 'checkResult', subGoodsNo, sortNo })
    currentItemData.value.photos[mediaEditorIndex] = newRecord
    reportStore.addPhotos()
    autoSaveItemData()
    triggerPendingUploads()
  }
  closeMediaEditor()
}

async function addMedia() {
  try {
    const files = await pickLocalFiles({ accept: 'image/*,video/*', multiple: true })
    if (!files.length) return
    const itemId = currentItem.value?.id || ''
    const photoBizId = resolveChecklistPhotoBizId(currentItem.value, currentItemSonPlanId.value) || itemId
    const subGoodsNo = getSubGoodsNo()
    if (!currentItemData.value.photos) currentItemData.value.photos = []
    let addedCount = 0
    for (let i = 0; i < files.length; i++) {
      const resolvedFile = normalizeSelectedMediaToFile(files[i])
      const sortNo = currentItemData.value.photos.length + 1
      const params = { bizId: photoBizId, bizType: 'checkResult', subGoodsNo, sortNo }
      let record
      if (resolvedFile instanceof File || resolvedFile instanceof Blob) {
        record = await makePhotoRecordFromBlob(resolvedFile, params)
      } else {
        record = await makePhotoRecord(resolvedFile, params)
      }
      currentItemData.value.photos.push(record)
      addedCount++
    }
    if (addedCount > 0) reportStore.addPhotos(addedCount)
    await autoSaveItemData()
    triggerPendingUploads()
  } catch (error) {
    console.error('添加媒体失败:', error)
    alert(t('添加媒体失败，请重试'))
  }
}

async function handleChecklistItemPhotoInput(e, item, sonPlanId = '') {
  try {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (!files.length || !item?.id) return
    await appendChecklistItemMediaFiles(item, sonPlanId, files)
  } catch (error) {
    console.error('上传检查项图片失败:', error)
    alert(t('上传图片失败，请重试'))
  } finally {
    if (e?.target) e.target.value = ''
  }
}

async function handleChecklistItemPhotoCapture(item, sonPlanId = '') {
  if (!item?.id) return
  itemModalAutoCapture.value = true
  openChecklistItem(item, sonPlanId)
}

const enqueueChecklistMediaAppend = createSerialTaskQueue()

function handleMediaGridAdd(mediaItems) {
  return appendCurrentItemMedia(mediaItems, 'checkResult')
}

function handleCheckPointMediaAdd(mediaItems) {
  if (!showCheckPointUpload.value) return
  return appendCurrentItemMedia(mediaItems, 'checkPoint')
}

async function appendCurrentItemMedia(mediaItems, bizType) {
  const item = currentItem.value
  const sonPlanId = currentItemSonPlanId.value
  if (!item?.id || !Array.isArray(mediaItems) || !mediaItems.length) return
  const items = mediaItems.filter(m => m.source)
  if (!items.length) return
  const dataKey = getChecklistDataKey(item.id, sonPlanId)
  const syncPhotos = () => {
    const isCurrentItem = String(currentItem.value?.id || '') === String(item.id)
      && String(currentItemSonPlanId.value || '') === String(sonPlanId || '')
    if (!isCurrentItem) return
    const savedData = checklistData.value[dataKey] || {}
    currentItemData.value.photos = savedData.photos ? [...savedData.photos] : []
  }
  return enqueueChecklistMediaAppend(async () => {
    try {
      await appendChecklistItemMediaFiles(item, sonPlanId, items, syncPhotos, bizType)
      syncPhotos()
    } catch (error) {
      console.error('保存拍摄文件失败:', error)
      uni.showToast({
        title: error?.message || t('本地文件保存失败，请重试'),
        icon: 'none',
        duration: 3000
      })
    }
  })
}

async function handleRemoveMedia(idx) {
  const item = currentItem.value
  const sonPlanId = currentItemSonPlanId.value
  if (!item?.id) return
  const dataKey = getChecklistDataKey(item.id, sonPlanId)
  const savedData = checklistData.value[dataKey]
  if (!savedData?.photos?.length || idx < 0 || idx >= savedData.photos.length) return
  const photo = savedData.photos[idx]
  if (photo?.fileId) {
    const deleted = await deleteRemoteFileForUserAction(photo)
    if (!deleted) return
  }
  if (photo?.blobKey) {
    import('../../utils/photoBlobStore.js').then(m => m.removeBlob(photo.blobKey)).catch(() => {})
  }
  savedData.photos.splice(idx, 1)
  currentItemData.value.photos = [...savedData.photos]
  await savePlanData()
}

async function handleRetryUpload(idx) {
  const item = currentItem.value
  const sonPlanId = currentItemSonPlanId.value
  if (!item?.id) return
  const dataKey = getChecklistDataKey(item.id, sonPlanId)
  const savedData = checklistData.value[dataKey]
  if (!savedData?.photos?.length || idx < 0 || idx >= savedData.photos.length) return
  const photo = savedData.photos[idx]
  const sourceStatus = await getPhotoUploadSourceStatus(photo)
  if (sourceStatus.status === 'unavailable') {
    resetPhotoForRetry(photo)
    photo.uploadError = t('本地图片暂时无法读取，稍后自动重试')
    currentItemData.value.photos = [...savedData.photos]
    await savePlanData({ markDirty: true, trySync: false })
    resumePhotoUploadQueue()
    return
  }
  if (sourceStatus.status === 'missing') {
    photo.uploadStatus = 'needs_attention'
    photo.uploadError = t('本地文件已失效，请重新拍照')
    photo._retryCount = Number.MAX_SAFE_INTEGER
    currentItemData.value.photos = [...savedData.photos]
    await savePlanData({ markDirty: true, trySync: false })
    uni.showToast({ title: t('本地文件已失效，请重新拍照'), icon: 'none', duration: 3000 })
    resumePhotoUploadQueue()
    return
  }
  resetPhotoForRetry(photo)
  currentItemData.value.photos = [...savedData.photos]
  resumePhotoUploadQueue()
}

async function handleEditSave({ index, dataUrl }) {
  const item = currentItem.value
  const sonPlanId = currentItemSonPlanId.value
  if (!item?.id || !dataUrl) return
  const dataKey = getChecklistDataKey(item.id, sonPlanId)
  const savedData = checklistData.value[dataKey]
  if (!savedData?.photos?.length || index < 0 || index >= savedData.photos.length) return
  const oldPhoto = savedData.photos[index]
  if (oldPhoto.fileId) {
    enqueueFileDeletion(oldPhoto.fileId)
  }
  if (oldPhoto.blobKey) {
    import('../../utils/photoBlobStore.js').then(m => m.removeBlob(oldPhoto.blobKey)).catch(() => {})
  }
  const resolvedBizId = String(oldPhoto?.bizId || '').trim()
    || resolveChecklistPhotoBizId(item, sonPlanId)
    || String(item.id || '').trim()
  const resolvedSubGoodsNo = String(oldPhoto?.subGoodsNo || '').trim() || getSubGoodsNo()
  const params = {
    bizId: resolvedBizId,
    bizType: oldPhoto?.bizType || 'checkResult',
    subGoodsNo: resolvedSubGoodsNo,
    sortNo: oldPhoto?.sortNo || index + 1
  }
  const newRecord = await makePhotoRecord(dataUrl, params)
  savedData.photos[index] = newRecord
  currentItemData.value.photos = [...savedData.photos]
  await savePlanData()
  triggerPendingUploads()
}

async function appendChecklistItemMediaFiles(item, sonPlanId = '', mediaItems = [], onRecordAdded = null, bizType = 'checkResult') {
  if (!item?.id || !Array.isArray(mediaItems) || !mediaItems.length) return
  ensureMergedItemResultRow(item.id, sonPlanId)
  const dataKey = getChecklistDataKey(item.id, sonPlanId)
  const savedData = checklistData.value[dataKey] || {}
  const existingPhotos = savedData.photos || []
  const subGoodsNo = getSubGoodsNo()
  const photoBizId = resolveChecklistPhotoBizId(item, sonPlanId) || String(item.id || '')
  const photos = existingPhotos
  let addedCount = 0
  for (let i = 0; i < mediaItems.length; i++) {
    const mi = mediaItems[i]
    const source = mi.source || mi
    const sortNo = photos.length + 1
    const params = { bizId: photoBizId, bizType, subGoodsNo, sortNo }
    let record
    if (source instanceof File || source instanceof Blob) {
      record = await makePhotoRecordFromBlob(source, params)
    } else {
      record = await makePhotoRecord(source, params)
    }
    photos.push(record)
    addedCount++
    const tempMerged = { ...savedData, photos: [...photos] }
    checklistData.value[dataKey] = {
      ...tempMerged,
      completed: isItemCompleted(item, tempMerged, sonPlanId),
      updatedAt: new Date().toISOString()
    }
    if (onRecordAdded) onRecordAdded()
  }
  if (addedCount > 0) reportStore.addPhotos(addedCount)
  await savePlanData()
  triggerPendingUploads()
}

// 将 File/Blob 对象读取为 base64 DataURL
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 通过 fetch 将远程 URL 资源转换为 base64 DataURL
function readUrlAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then(resp => { if (!resp.ok) throw new Error(t('读取文件地址失败')); return resp.blob() })
      .then(blob => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      .catch(reject)
  })
}

function isAppRuntime() {
  return typeof plus !== 'undefined' && !!plus?.io
}

// 统一处理不同来源（File 对象 / uni 临时路径 / 已有 DataURL）转换为 DataURL
function normalizeSelectedMediaToFile(file) {
  if (file instanceof File || file instanceof Blob) return file
  const tempPath = file?.tempFilePath || file?.path || (typeof file === 'string' ? file : '')
  if (!tempPath) throw new Error(t('未识别的文件对象'))
  return tempPath
}

// 打开文件/媒体选择器（uni 环境用 chooseMedia，浏览器环境用隐藏 input）
const MAX_VIDEO_DURATION = 60
const MAX_VIDEO_SIZE_MB = 200
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024

function getVideoDuration(file) {
  return new Promise((resolve) => {
    if (!(file instanceof Blob) || !file.type?.startsWith('video/')) { resolve(0); return }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    const cleanup = () => {
      try { video.pause() } catch {}
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
      try { URL.revokeObjectURL(url) } catch {}
    }
    video.onloadedmetadata = () => { const d = video.duration; cleanup(); resolve(d) }
    video.onerror = () => { cleanup(); resolve(0) }
    video.src = url
  })
}

function pickLocalFiles(options = {}) {
  const { accept = 'image/*', multiple = false, capture } = options
  if (typeof uni !== 'undefined' && typeof uni.chooseMedia === 'function') {
    return new Promise((resolve, reject) => {
      uni.chooseMedia({
        count: multiple ? 9 : 1,
        mediaType: ['image', 'video'],
        sourceType: ['camera'],
        maxDuration: MAX_VIDEO_DURATION,
        success: res => {
          const files = Array.isArray(res?.tempFiles) ? res.tempFiles : []
          const filtered = []
          let hasOverDuration = false
          let hasOverSize = false
          for (const f of files) {
            const isVideo = f.fileType === 'video' || 
                            /\.(mp4|mov|webm|avi|m4v)$/i.test(f.tempFilePath || '') ||
                            (f.file && f.file.type && f.file.type.startsWith('video/'))
            if (isVideo && f.duration && f.duration > MAX_VIDEO_DURATION) {
              hasOverDuration = true
              continue
            }
            if (isVideo && f.size && f.size > MAX_VIDEO_SIZE_BYTES) {
              hasOverSize = true
              continue
            }
            filtered.push(f)
          }
          if (hasOverDuration) {
            uni.showToast({ title: `视频时长不能超过${MAX_VIDEO_DURATION}秒`, icon: 'none' })
          } else if (hasOverSize) {
            uni.showToast({ title: `视频大小不能超过${MAX_VIDEO_SIZE_MB}MB`, icon: 'none' })
          }
          resolve(filtered)
        },
        fail: error => {
          if (String(error?.errMsg || '').includes('cancel')) { resolve([]); return }
          reject(error)
        }
      })
    })
  }
  return new Promise((resolve, reject) => {
    if (!capture || typeof document === 'undefined') {
      resolve([])
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.multiple = false
    input.setAttribute('capture', capture)
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
    document.body.appendChild(input)
    const cleanup = () => { input.onchange = null; input.parentNode?.removeChild(input) }
    input.onchange = (e) => {
      cleanup()
      const files = e.target.files ? Array.from(e.target.files) : []
      resolve(files.slice(0, 1))
    }
    input.click()
  })
}

// 调起摄像头/相册单次拍照并返回图片来源（App 端优先本地路径，H5 强制返回 DataURL）
function chooseImageFromCamera() {
  return new Promise((resolve, reject) => {
    pickLocalFiles({ accept: 'image/*', capture: 'environment' })
      .then(files => {
        const file = files[0]
        if (!file) { reject(new Error('未选择图片')); return }
        if (file instanceof File || file instanceof Blob) {
          resolve(file)
          return
        }
        const appPath = String(file?.tempFilePath || file?.path || '').trim()
        if (appPath) {
          resolve(appPath)
          return
        }
        reject(new Error('未识别的文件对象'))
      })
      .catch(reject)
  })
}

// ─── 疵点快速录入 ─────────────────────────────────────────

// 生成带时间戳的疵点本地唯一 id
function createDefectId() {
  const uuid = globalThis?.crypto?.randomUUID?.()
  if (uuid) return `${uuid}`
  return `${Date.now()}${Math.random().toString(16).slice(2, 8)}`
}

// 将快速录入表单及相关状态重置为初始值
function resetQuickDefectForm() {
  editingDefectIndex.value = -1
  quickDefectReturnToChecklist.value = false
  quickDefectSourceItem.value = { id: '', name: '', itemResultId: '' }
  quickDefectForm.value = {
    type: 'MINOR', quantity: 1, customQuantity: '', commonFlag: 0,
    tier1Code: '', tier2Code: '', tier3Code: '', defectCode: '', defectDesc: '',
    description: '', photos: []
  }
}

// 加载疵点类别树（优先网络，失败时回退缓存；force=true 时强制重新拉取）
async function loadDefectTierTree(force = false) {
  if (defectTierLoading.value) return
  if (!force && defectTierLoaded.value) return
  if (force) { defectTierLoaded.value = false; defectTierTree.value = [] }
  defectTierLoading.value = true
  defectTierError.value = ''
  try {
    const fresh = await getDefectTierTree()
    defectTierTree.value = fresh
    defectTierLoaded.value = true
    saveDefectTierCache(fresh)
  } catch (error) {
    const cached = loadDefectTierCache()
    if (cached) {
      defectTierTree.value = cached
      defectTierLoaded.value = true
    } else {
      defectTierError.value = error.message || '加载疵点类别失败'
    }
  } finally {
    defectTierLoading.value = false
  }
}

// 疵点类别加载失败后，点击"重试"按钮触发强制重新加载
async function handleRetryTier() {
  if (defectTierLoading.value || defectTierRetrying.value) return
  defectTierRetrying.value = true
  defectTierError.value = ''
  await new Promise(r => setTimeout(r, 0))
  await loadDefectTierTree(true)
  defectTierRetrying.value = false
}

// 从疵点 Tab 浮动按钮新增疵点（不关联任何检查项）
function startQuickDefect() {
  startQuickDefectForChecklistItem(null)
}

// 从检查项打开快速录入：关联来源项信息，自动加载类别树并尝试静默拍照
async function startQuickDefectForChecklistItem(item, sonPlanId = '') {
  rememberChecklistPosition(item?.id, sonPlanId)
  // activeTab.value = 'defects'
  resetQuickDefectForm()
  const resolvedItemResultId = item
    ? (getItemResultIdForItem(item.standardItemId, sonPlanId) || item.id)
    : ''
  quickDefectSourceItem.value = {
    id: item?.id || '',
    name: item?.itemName || '',
    itemResultId: resolvedItemResultId
  }
  quickDefectReturnToChecklist.value = !!item?.id
  showQuickDefectModal.value = true
  await loadDefectTierTree()
}

function buildChecklistAnchorId(itemId, sonPlanId = '') {
  const id = String(itemId || '').trim()
  if (!id) return ''
  const son = String(sonPlanId || '').trim()
  return son ? `check-${id}__${son}` : `check-${id}`
}

function rememberChecklistPosition(itemId, sonPlanId = '') {
  checklistAnchorId.value = buildChecklistAnchorId(itemId, sonPlanId)
  checklistScrollTop.value = Number(bodyRef.value?.scrollTop || 0)
}

async function restoreChecklistPosition() {
  await nextTick()
  const bodyEl = bodyRef.value
  if (bodyEl) {
    bodyEl.scrollTop = checklistScrollTop.value || 0
  }
  if (checklistAnchorId.value && typeof document !== 'undefined') {
    const anchorEl = document.getElementById(checklistAnchorId.value)
    anchorEl?.scrollIntoView?.({ block: 'center', behavior: 'auto' })
  }
}

async function handleDefectAddMedia(mediaItems) {
  if (!Array.isArray(mediaItems) || !mediaItems.length) return
  const subGoodsNo = getSubGoodsNo()
  try {
    for (let i = 0; i < mediaItems.length; i++) {
      const mi = mediaItems[i]
      const source = normalizeSelectedMediaToFile(mi.source)
      const sortNo = quickDefectForm.value.photos.length + 1
      const params = { bizId: '', bizType: 'defect', subGoodsNo, sortNo }
      let record
      if (source instanceof File || source instanceof Blob) {
        record = await makePhotoRecordFromBlob(source, params)
      } else {
        record = await makePhotoRecord(source, params)
      }
      quickDefectForm.value.photos.push(record)
      reportStore.addPhotos()
    }
    triggerPendingUploads()
  } catch (error) {
    console.error('保存疵点拍摄文件失败:', error)
    uni.showToast({
      title: error?.message || t('本地文件保存失败，请重试'),
      icon: 'none',
      duration: 3000
    })
  }
}

async function handleDefectRemoveMedia(index) {
  const photo = quickDefectForm.value.photos?.[index]
  if (photo?.fileId) {
    const deleted = await deleteRemoteFileForUserAction(photo)
    if (!deleted) return
  }
  quickDefectForm.value.photos.splice(index, 1)
  if (photo?.blobKey) {
    import('../../utils/photoBlobStore.js').then(m => m.removeBlob(photo.blobKey)).catch(() => {})
  } else if (photo && isPhotoRecord(photo) && photo.uploadStatus !== 'done') {
    reportStore.removePhotos()
  }
}

async function handleDefectRetryUpload(index) {
  const photo = quickDefectForm.value.photos?.[index]
  if (!photo) return
  const sourceStatus = await getPhotoUploadSourceStatus(photo)
  if (sourceStatus.status === 'unavailable') {
    resetPhotoForRetry(photo)
    photo.uploadError = t('本地图片暂时无法读取，稍后自动重试')
    resumePhotoUploadQueue()
    return
  }
  if (sourceStatus.status === 'missing') {
    photo.uploadStatus = 'needs_attention'
    photo.uploadError = t('本地文件已失效，请重新拍照')
    photo._retryCount = Number.MAX_SAFE_INTEGER
    uni.showToast({ title: t('本地文件已失效，请重新拍照'), icon: 'none', duration: 3000 })
    resumePhotoUploadQueue()
    return
  }
  resetPhotoForRetry(photo)
  resumePhotoUploadQueue()
}

async function handleDefectEditSave({ index, dataUrl }) {
  const oldPhoto = quickDefectForm.value.photos?.[index]
  if (!dataUrl || index < 0) return
  const sortNo = oldPhoto?.sortNo || index + 1
  const subGoodsNo = getSubGoodsNo()
  const params = { bizId: oldPhoto?.bizId || '', bizType: 'defect', subGoodsNo, sortNo }
  if (oldPhoto?.fileId) {
    enqueueFileDeletion(oldPhoto.fileId)
  } else if (oldPhoto && isPhotoRecord(oldPhoto) && oldPhoto.uploadStatus !== 'done') {
    reportStore.removePhotos()
  }
  if (oldPhoto?.blobKey) {
    import('../../utils/photoBlobStore.js').then(m => m.removeBlob(oldPhoto.blobKey)).catch(() => {})
  }
  const newRecord = await makePhotoRecord(dataUrl, params)
  quickDefectForm.value.photos[index] = newRecord
  reportStore.addPhotos()
  triggerPendingUploads()
}

const defectPhotoEditing = ref(false)

// 关闭疵点快速录入弹窗；autoSave=true 时若为新增状态则尝试静默保存（仅有类别时）
async function closeQuickDefectModal(autoSave = true) {
  if (autoSave && editingDefectIndex.value < 0) {
    await saveQuickDefect({ silent: true, closeAfterSave: false, mode: 'requiredOnly' })
  }
  showQuickDefectModal.value = false
  resetQuickDefectForm()
}

// 从表单构建疵点数据对象；strict 模式下校验必填字段，requiredOnly 模式仅校验类别
function buildQuickDefectPayload({ silent = false, mode = 'strict', defectId = null } = {}) {
  const strictMode = mode === 'strict'
  if (!quickDefectForm.value.defectCode || !quickDefectForm.value.defectDesc) {
    if (!silent) {
      if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
        uni.showToast({ title: t('请选择完整疵点类别（三级）'), icon: 'none' })
      } else {
        alert(t('请选择完整疵点类别（三级）'))
      }
    }
    return null
  }
  if (strictMode && Number(quickDefectForm.value.commonFlag || 0) !== 1) {
    if (quickDefectForm.value.quantity === 'other') {
      const customQty = Number(quickDefectForm.value.customQuantity || 0)
      if (!customQty || customQty < 1) {
        if (!silent) alert(t('请输入有效的受影响数量'))
        return null
      }
    } else if (!quickDefectForm.value.quantity || Number(quickDefectForm.value.quantity) < 1) {
      if (!silent) alert(t('请选择受影响的产品数量'))
      return null
    }
  }
  const finalQuantity = Number(quickDefectForm.value.commonFlag || 0) === 1
    ? null
    : (quickDefectForm.value.quantity === 'other'
      ? Number(quickDefectForm.value.customQuantity || 0) || null
      : Number(quickDefectForm.value.quantity || 0) || null)

  const id = defectId || createDefectId()
  const subGoodsNo = getSubGoodsNo()
  const photos = quickDefectForm.value.photos.map((photo, idx) => {
    if (isPhotoRecord(photo) && !photo.bizId) {
      return { ...photo, bizId: id, bizType: 'defect', subGoodsNo, sortNo: idx + 1 }
    }
    return photo
  })

  return {
    id, type: quickDefectForm.value.type, quantity: finalQuantity,
    commonFlag: Number(quickDefectForm.value.commonFlag || 0) === 1 ? 1 : 0,
    defectCode: quickDefectForm.value.defectCode,
    defectDesc: quickDefectForm.value.defectDesc,
    checkItemId: quickDefectSourceItem.value.id || '',
    checkItemName: quickDefectSourceItem.value.name || '',
    checkItemResultId: quickDefectSourceItem.value.itemResultId || '',
    tier1Code: quickDefectForm.value.tier1Code,
    tier2Code: quickDefectForm.value.tier2Code,
    tier3Code: quickDefectForm.value.tier3Code,
    description: quickDefectForm.value.description,
    photos,
    createdAt: new Date().toISOString()
  }
}

// 保存疵点记录（新增或更新）到 defects 列表并持久化；完成后可选关闭弹窗并切回清单 Tab
async function saveQuickDefect(options = {}) {
  const { silent = false, closeAfterSave = true, mode = 'strict' } = options
  const existingId = editingDefectIndex.value > -1 ? (defects.value[editingDefectIndex.value]?.id || null) : null
  const newDefect = buildQuickDefectPayload({ silent, mode, defectId: existingId })
  if (!newDefect) return false
  const shouldReturn = quickDefectReturnToChecklist.value && !!quickDefectSourceItem.value.id

  if (editingDefectIndex.value > -1) {
    const old = defects.value[editingDefectIndex.value] || {}
    defects.value.splice(editingDefectIndex.value, 1, {
      ...old, ...newDefect,
      id: old.id || newDefect.id,
      createdAt: old.createdAt || newDefect.createdAt,
      updatedAt: new Date().toISOString()
    })
  } else {
    defects.value.unshift(newDefect)
  }

  await savePlanData()
  triggerPendingUploads()

  if (closeAfterSave) {
    await closeQuickDefectModal(false)
    if (shouldReturn) {
      activeTab.value = 'checklist'
      await restoreChecklistPosition()
    }
  }
  return true
}

// 删除当前编辑中的疵点记录（需二次确认）并保存
async function deleteQuickDefect() {
  if (editingDefectIndex.value > -1) {
    if (!confirm('确认删除这条疵点记录吗？')) return
    defects.value.splice(editingDefectIndex.value, 1)
    await savePlanData()
  }
  closeQuickDefectModal(false)
}

// 疵点 Tab 内"添加疵点"按钮的事件处理别名
function addDefect() { startQuickDefect() }

// ─── 总结提交 ──────────────────────────────────────────────

async function openFinishModal() {
  const p = finishPlan.value
  finishQuantityPlans.value = getQuantityPlans(planData.value)
  showStatusPicker.value = false
  failedCheckpointsExpanded.value = true
  showFinishModal.value = true
  finishQuantityLoading.value = true
  try {
    const localPlans = await getLocalPlans()
    if (isMergedQuantityPlan(planData.value)) {
      const parentId = String(p.parentPlanId || getQuantityPlanId(p))
      const siblings = localPlans.filter(item => {
        const plan = item.plan || item
        return isMergedQuantityPlan(item) && String(plan.parentPlanId || getQuantityPlanId(item)) === parentId
      })
      const combined = new Map(finishQuantityPlans.value.map(plan => [getQuantityPlanId(plan), plan]))
      for (const sibling of siblings) combined.set(getQuantityPlanId(sibling), sibling.plan || sibling)
      finishQuantityPlans.value = [...combined.values()]
    }
    finishQuantityPlans.value = await loadReadyQuantityPlans(planData.value, { getPlanDetail, searchPlans })
  } catch (error) {
    console.warn('读取备货数量失败，使用本地数量:', error)
  } finally {
    finishQuantityLoading.value = false
  }
}

function closeFinishModal() {
  showFinishModal.value = false
}

function openFinishStatusSheet() {
  showStatusPicker.value = true
}

function closeFinishStatusSheet() {
  showStatusPicker.value = false
}

function selectFinishStatus(value) {
  overallResult.value = value
  closeFinishStatusSheet()
}

function resetFinishStatus() {
  overallResult.value = ''
  closeFinishStatusSheet()
}

async function handleFinishInspection() {
  // 触发校验（computed 会自动根据 checklistData 实时计算）
  validationTriggered.value = true

  if (failedItemIds.value.length || failedPhotoItemIds.value.length) {
    showMissingDataDialog.value = true
    return
  }

  if (!overallResult.value) {
    openFinishStatusSheet()
    alert(t('请先设置状态（APPROVED / REJECTED / PENDING）'))
    return
  }
  showFinishConfirmDialog.value = true
}

function confirmForceMarkErrors() {
  showMissingDataDialog.value = false
  closeFinishModal()
  // validationTriggered 保持 true，computed 会持续响应 checklistData 变化
  activeTab.value = 'checklist'
}

function closeFinishConfirmDialog() {
  showFinishConfirmDialog.value = false
}

async function confirmFinishInspection() {
  if (isSubmittingFinish.value) return
  showFinishConfirmDialog.value = false
  await submitFinishInspection()
}

async function submitFinishInspection() {
  isSubmittingFinish.value = true
  try {
    if (isReportAlreadySubmitted()) {
      alert(t('该报告已提交，无需重复提交'))
      return
    }
    // 提交最终报告前，确保所有同步链路（尤其图片上传）都已完成
    await waitForSyncIdle()
    if (hasPendingPhotoUploads(checklistData.value, defects.value)) {
      const online = await isNetworkOnline()
      if (!online) {
        throw new Error(t('存在待上传图片，请联网后再提交'))
      }
      await triggerPendingUploads()
      await waitForSyncIdle()
      if (hasPendingPhotoUploads(checklistData.value, defects.value)) {
        throw new Error(t('仍有 {count} 张图片未上传完成，请稍后重试', { count: pendingUploadCount.value }))
      }
    }
    const base = buildGeneratePayload()
    await generateReport({
      ...base,
      overallResult: overallResult.value,
      overallRemarks: overallRemarks.value,
      finishFlag: 1
    })
    const reported = await isCurrentPlanReportedOnServer()
    if (!reported) {
      throw new Error(t('提交成功，但报告状态尚未更新为已报告，请稍后重试'))
    }
    await markCurrentAndMergedPlansReported()
    closeFinishModal()
    validationTriggered.value = false
    goBack()
  } catch (e) {
    alert(e.message || t('提交失败，请重试'))
  } finally {
    isSubmittingFinish.value = false
  }
}

// 打开已有疵点的编辑弹窗：定位 defects 索引，回填表单数据
async function openDefectDetail(defect, index = -1) {
  const defectIndex = index > -1
    ? index
    : defects.value.findIndex(item => (defect?.id ? item?.id === defect.id : item === defect))
  if (defectIndex < 0) return
  editingDefectIndex.value = defectIndex
  quickDefectReturnToChecklist.value = false
  quickDefectSourceItem.value = {
    id: defect?.checkItemId || '',
    name: defect?.checkItemName || '',
    itemResultId: defect?.checkItemResultId || ''
  }
  await loadDefectTierTree()
  const qtyValue = Number(defect?.quantity || 0)
  const defectCommonFlag = Number(defect?.commonFlag ?? (defect?.isCommon ? 1 : 0))
  const useCustomQty = defectCommonFlag !== 1 && qtyValue > 19
  quickDefectForm.value = {
    type: normalizeSeverityValue(defect?.type, defect?.typeLabel),
    quantity: defectCommonFlag === 1 ? null : (useCustomQty ? 'other' : (qtyValue > 0 ? qtyValue : 1)),
    customQuantity: useCustomQty ? String(qtyValue) : '',
    commonFlag: defectCommonFlag === 1 ? 1 : 0,
    tier1Code: defect?.tier1Code || '',
    tier2Code: defect?.tier2Code || '',
    tier3Code: defect?.tier3Code || '',
    defectCode: defect?.defectCode || '',
    defectDesc: defect?.defectDesc || '',
    description: defect?.description || '',
    photos: Array.isArray(defect?.photos) ? [...defect.photos] : []
  }
  showQuickDefectModal.value = true
}

// ─── 疵点类别选择器 ───────────────────────────────────────

// 打开类别选择抽屉：确保类别树已加载，重置到第一步并清空搜索
async function openCategoryPicker() {
  await loadDefectTierTree()
  categoryPickerStep.value = 1
  categorySearchKeyword.value = ''
  loadRecentCategoryHistory()
  showCategoryPicker.value = true
}

// 关闭类别选择抽屉并清空搜索关键词
function closeCategoryPicker() {
  showCategoryPicker.value = false
  categorySearchKeyword.value = ''
}

// 类别选择器返回：回到上一步，已在第一步时直接关闭
function handleCategoryBack() {
  if (categoryPickerStep.value > 1) { categoryPickerStep.value -= 1; return }
  closeCategoryPicker()
}

// 选中某个类别节点：前两步更新对应 tier code 并进入下一步，第三步确认选择并记录历史
function handleCategorySelect(node) {
  if (categoryPickerStep.value === 1) {
    quickDefectForm.value.tier1Code = node?.code || ''
    quickDefectForm.value.tier2Code = ''
    quickDefectForm.value.tier3Code = ''
    quickDefectForm.value.defectCode = ''
    quickDefectForm.value.defectDesc = ''
    categorySearchKeyword.value = ''
    categoryPickerStep.value = 2
    return
  }
  if (categoryPickerStep.value === 2) {
    quickDefectForm.value.tier2Code = node?.code || ''
    quickDefectForm.value.tier3Code = ''
    quickDefectForm.value.defectCode = ''
    quickDefectForm.value.defectDesc = ''
    categorySearchKeyword.value = ''
    categoryPickerStep.value = 3
    return
  }
  quickDefectForm.value.tier3Code = node?.code || ''
  quickDefectForm.value.defectCode = node?.code || ''
  quickDefectForm.value.defectDesc = node?.name || ''
  pushRecentCategoryHistory({
    tier1Code: quickDefectForm.value.tier1Code,
    tier2Code: quickDefectForm.value.tier2Code,
    tier3Code: quickDefectForm.value.tier3Code,
    defectCode: quickDefectForm.value.defectCode,
    defectDesc: quickDefectForm.value.defectDesc
  })
  closeCategoryPicker()
}

// 从本地存储读取最近使用的疵点类别历史列表
function loadRecentCategoryHistory() {
  try {
    const raw = uni.getStorageSync(DEFECT_CATEGORY_HISTORY_KEY)
    const normalized = (Array.isArray(raw) ? raw : [])
      .map((item) => {
        const defectCode = String(item?.defectCode || '').trim()
        const defectDesc = String(item?.defectDesc || '').trim()
        if (!defectCode || !defectDesc) return null
        return {
          tier1Code: item?.tier1Code || '',
          tier2Code: item?.tier2Code || '',
          tier3Code: item?.tier3Code || defectCode,
          defectCode,
          defectDesc
        }
      })
      .filter(Boolean)
    recentCategoryHistory.value = normalized
    try { uni.setStorageSync(DEFECT_CATEGORY_HISTORY_KEY, normalized) } catch {}
  } catch {
    recentCategoryHistory.value = []
  }
}

// 将新选中的类别加入历史列表头部（去重、最多保留 8 条），并写回本地存储
function pushRecentCategoryHistory(item) {
  if (!item?.defectCode) return
  const list = recentCategoryHistory.value.filter(x => x.defectCode !== item.defectCode)
  list.unshift(item)
  recentCategoryHistory.value = list.slice(0, 8)
  try { uni.setStorageSync(DEFECT_CATEGORY_HISTORY_KEY, recentCategoryHistory.value) } catch {}
}

// 直接应用历史记录中的类别到表单（跳过逐步选择），并关闭选择器
function applyRecentCategory(item) {
  if (!item) return
  quickDefectForm.value.tier1Code = item.tier1Code || ''
  quickDefectForm.value.tier2Code = item.tier2Code || ''
  quickDefectForm.value.tier3Code = item.tier3Code || ''
  quickDefectForm.value.defectCode = item.defectCode || ''
  quickDefectForm.value.defectDesc = item.defectDesc || ''
  closeCategoryPicker()
}

// ─── 复制检查点 ──────────────────────────────────────────────
const showCopyCheckItemsPopup = ref(false)
const copySourceItemId = ref('')

function handleCopyItems() {
  copySourceItemId.value = String(currentItem.value?.id || '')
  showCopyCheckItemsPopup.value = true
}

function closeCopyCheckItemsPopup() {
  showCopyCheckItemsPopup.value = false
}

function handlePhotosSorted(newPhotos) {
  if (!currentItem.value?.id) return
  const dataKey = getChecklistDataKey(currentItem.value.id, currentItemSonPlanId.value)
  const data = checklistData.value?.[dataKey]
  if (data) {
    data.photos = newPhotos
    savePlanData()
  }
  currentItemData.value.photos = newPhotos
}

function openBatchMovePopup() {
  if (!currentItem.value?.id) return
  const itemId = String(currentItem.value.id || '').trim()
  const sonPlanId = String(currentItemSonPlanId.value || '').trim()
  const dataKey = getChecklistDataKey(itemId, sonPlanId)
  const allMedia = getMediaPhotos((checklistData.value?.[dataKey]?.photos || currentItemData.value.photos || [])
    .filter(p => p && typeof p === 'object'))
  if (!allMedia.length) {
    globalThis.showToast(t('暂无照片/视频'))
    return
  }
  batchMoveMediaList.value = allMedia
  batchMoveSourceItemId.value = itemId
  batchMoveSourceSonPlanId.value = sonPlanId
  batchMoveSourceDataKey.value = dataKey
  showBatchMovePopup.value = true
}

function closeBatchMovePopup() {
  if (batchMoveSubmitting.value) return
  showBatchMovePopup.value = false
}

async function handleBatchMoveSubmit(payload) {
  const fileIds = Array.isArray(payload?.fileIds) ? payload.fileIds.map(x => String(x)).filter(Boolean) : []
  const targetBizIds = Array.isArray(payload?.targetBizIds) ? payload.targetBizIds.map(x => String(x)).filter(Boolean) : []
  if (!fileIds.length || !targetBizIds.length) return
  const sourceKey = String(batchMoveSourceDataKey.value || '').trim()
  if (!sourceKey) return
  const sourceData = checklistData.value?.[sourceKey] || {}
  const sourcePhotos = Array.isArray(sourceData.photos) ? sourceData.photos : []
  const fileIdSet = new Set(fileIds)
  const baseRecords = sourcePhotos
    .filter(p => p?.fileId && fileIdSet.has(String(p.fileId)))
    .map(p => ({ ...p, uploadStatus: 'done' }))
  if (!baseRecords.length) {
    globalThis.showToast(t('未找到可移动的照片/视频'))
    return
  }

  const uniqueTargets = []
  const seen = new Set()
  for (const id of targetBizIds) {
    if (!id || seen.has(id)) continue
    const t = batchMoveTargetItems.value.find(x => String(x?.bizId || '') === id)
    if (!t?.itemId) continue
    const targetKey = getChecklistDataKey(t.itemId, t.sonPlanId)
    if (!targetKey || targetKey === sourceKey) continue
    seen.add(id)
    uniqueTargets.push({ ...t, bizId: id, targetKey })
  }
  if (!uniqueTargets.length) {
    globalThis.showToast(t('请选择其他检查点'))
    return
  }

  batchMoveSubmitting.value = true
  try {
    const sourcePlanId = String(planId.value || '').trim()
    const sourceItemId = resolveChecklistPhotoBizId(currentItem.value, currentItemSonPlanId.value) || String(batchMoveSourceItemId.value || '').trim()
    if (!sourcePlanId || !sourceItemId) {
      throw new Error(t('源检查点信息缺失'))
    }
   const res = await copyPhotosToItems({
      sourcePlanId,
      sourceItemId,
      targetPlanIds: [sourcePlanId],
      targetItemIds: uniqueTargets.map(t => String(t.bizId)),
      fileIds
    })
   globalThis.showToast(res.message || t('移动成功'))
    try {
      const freshData = await getPlanDetail(sourcePlanId)
      if (freshData) {
        const plans = splitDownloadDataToLocalPlans(freshData)
        if (plans.length) {
          await savePlanToLocal(plans[0])
        }
      }
    } catch (e) {
      console.warn('刷新复制后的计划数据失败:', e)
    }
    await loadPlanDetail()
    if (currentItem.value?.id) {
      openChecklistItem(currentItem.value, currentItemSonPlanId.value)
    }
   
    showBatchMovePopup.value = false
  } catch (error) {
    console.error('批量移动失败:', error)
    globalThis.showToast(error.message || t('批量移动失败'))
  } finally {
    batchMoveSubmitting.value = false
  }
}

function onCheckItemsCopied(targetPlanIds) {
  if (Array.isArray(targetPlanIds) && targetPlanIds.length) {
    markPlansNeedRefresh(targetPlanIds)
  }
  showCopyCheckItemsPopup.value = false
}

function markPlansNeedRefresh(planIds) {
  try {
    const existing = JSON.parse(uni.getStorageSync('plansNeedRefresh') || '[]')
    const merged = [...new Set([...existing, ...planIds])]
    uni.setStorageSync('plansNeedRefresh', JSON.stringify(merged))
  } catch (e) {
    console.warn('标记刷新失败:', e)
  }
}

function checkAndClearRefreshMark(id) {
  try {
    const list = JSON.parse(uni.getStorageSync('plansNeedRefresh') || '[]')
    const idx = list.indexOf(String(id))
    if (idx < 0) return false
    list.splice(idx, 1)
    uni.setStorageSync('plansNeedRefresh', JSON.stringify(list))
    return true
  } catch (e) {
    return false
  }
}

// ─── 设置完工数量 ──────────────────────────────────────────────
const showFinishQuantityDialog = ref(false)

function openFinishQuantityDialog() {
  if (finishQuantityLoading.value) return
  showFinishQuantityDialog.value = true
}

function closeFinishQuantityDialog() {
  showFinishQuantityDialog.value = false
}

function handleFinishQuantitiesSaved(changes) {
  planData.value = patchReadyQuantities(planData.value, changes)
  finishQuantityPlans.value = finishQuantityPlans.value.map(plan => patchReadyQuantities(plan, changes))
}

</script>

<style scoped lang="scss">
@use './styles/detail.scss' as *;

.pc-blocked-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  background: #f5f7fa;
}

.pc-blocked-card {
  width: 100%;
  max-width: 720rpx;
  padding: 48rpx 40rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: 0 10rpx 28rpx rgba(26, 40, 74, 0.08);
  text-align: center;
}

.pc-blocked-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #1f2a44;
}

.pc-blocked-desc {
  margin-top: 18rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: #5a6a86;
}

.pc-blocked-btn {
  margin-top: 32rpx;
}
</style>
