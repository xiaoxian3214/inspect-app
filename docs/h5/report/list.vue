<template>
  <view class="page">
    <view class="header">
      <view class="top">
        <text class="icon" @click="showUserMenu">☰</text>
        <text class="title">{{ t('验货') }}</text>
        <SyncCloudIcon class="icon-cloud" :is-syncing="isSyncing" :pending-count="pendingSyncCount" @click="syncData" />
      </view>
      <view class="status-tabs">
        <view
          v-for="tab in statusTabs"
          :key="tab.key"
          class="status-tab"
          :class="{active: statusKey===tab.key}"
          @click="switchTab(tab.key)"
        >
          <text class="tab-icon">{{ tab.icon }}</text>
          <text>{{ tab.label }}</text>
          <text v-if="getTabCount(tab.key) > 0" class="tab-badge">{{ getTabCount(tab.key) }}</text>
        </view>
      </view>
    </view>

    <view class="content" :class="{ 'merge-mode-content': isMergeMode }">
      <!-- 加载中 -->
      <view v-if="loading" class="loading">
        <text class="loading-icon">⟳</text>
        <text>{{ t('加载中...') }}</text>
      </view>

      <!-- 空状态 -->
      <view v-else-if="filtered.length===0" class="tip-card">
        <view class="tip-title">{{ emptyTitle }}</view>
        <view class="tip-sub">{{ emptySubtitle }}</view>
      </view>

      <!-- 计划列表 -->
      <view v-else>
        <view
          v-for="group in groupedFiltered"
          :key="group.groupKey"
          class="plan-group"
        >
          <!-- 订单号标题（同 clientOrderNo 只展示一次） -->
          <view class="order-header">
            <text class="order-no">{{ group.clientOrderNo }}</text>
            <checkbox-group
              v-if="isMergeMode"
              class="group-select-all"
              @change="handleGroupSelectAllChange(group)"
              @click.stop
            >
              <label class="group-select-label">
                <checkbox
                  class="group-select-checkbox"
                  value="all"
                  :checked="isGroupAllSelected(group)"
                  :disabled="!canGroupSelectAll(group)"
                  color="#16a34a"
                />
              </label>
            </checkbox-group>
          </view>
          <view class="supplier-row">
            <text class="supplier-name">{{ group.supplierName }}</text>
            <text class="order-date">{{ group.orderDate }}</text>
          </view>

          <view
            v-for="item in group.items"
            :key="getPlanUniqueId(item)"
          >
            <PlanListItemCard
              :item="item"
              :current-user-id="authStore.user?.userId"
              :is-merged="isMergedReport(item)"
              :status-key="statusKey"
              :show-merge-checkbox="isMergeMode"
              :merge-checked="isMergeChecked(item)"
              :merge-disabled="!isMergeSelectable(item)"
              :use-internal-actions="true"
              :manage-actions-in-card="true"
              :use-internal-card-click="true"
              :is-merge-mode="isMergeMode"
              :is-local-downloaded="isLocalDownloaded(item)"
              :show-action-split="isSplitAvailable(item)"
              :show-supplier-row="false"
              @request-refresh="loadLocalPlans"
              @released="handleCardReleased"
              @merge-toggle="toggleMergeSelect"
              @action-split="openSplitPreviewModal"
            />
          </view>
        </view>
      </view>

      <!-- 分页底栏 -->
      <view v-if="!loading" class="pagination-bar">
        <AppButton
          class="load-more-btn"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? t('加载中...') : t('加载更多') }}
        </AppButton>
        <view v-if="shouldShowPagination" class="pagination-info">
          {{ t('第') }} {{ currentPage }} / {{ totalPages }} {{ t('页') }}，{{ t('共') }} {{ displayTotalCount }} {{ t('条') }}
        </view>
        <view v-if="shouldShowPagination" class="pagination-actions">
          <AppButton
            class="page-nav-btn"
            :disabled="loadingMore || currentPage <= 1"
            @click="loadPrevPage"
          >
            {{ t('上一页') }}
          </AppButton>
          <AppButton
            class="page-nav-btn"
            :disabled="loadingMore || currentPage >= totalPages"
            @click="loadNextPage"
          >
            {{ t('下一页') }}
          </AppButton>
        </view>
      </view>
    </view>

    <view v-if="(statusKey === 'planned' || statusKey === 'report') && !isMergeMode" class="fab" @click="showActionMenu">
      <text v-if="statusKey === 'planned'">+</text>
      <uni-icons v-else type="search" size="30" color="#fff" />
    </view>

    <!-- 用户侧边抽屉 -->
    <view v-if="showUserDrawer" class="user-drawer-overlay" @click="closeUserDrawer">
      <view class="user-drawer" @click.stop>
        <view class="user-drawer-header">
          <view class="user-drawer-title">{{ t('用户信息') }}</view>
        </view>
        <view class="user-info-list">
          <view class="user-info-row">
            <text class="user-info-label">{{ t('用户名称') }}</text>
            <text class="user-info-value">{{ userNameText }}</text>
          </view>
          <view class="user-info-row">
            <text class="user-info-label">{{ t('用户ID') }}</text>
            <text class="user-info-value">{{ userIdText }}</text>
          </view>
          <view class="user-info-row">
            <text class="user-info-label">{{ t('邮箱') }}</text>
            <text class="user-info-value">{{ userEmailText }}</text>
          </view>
        </view>
        <view class="user-drawer-footer">
          <view class="user-lang-row">
            <text class="user-lang-label">{{ t('切换语言') }}</text>
            <view class="user-lang-options">
              <view
                v-for="code in supportedLocales"
                :key="code"
                class="user-lang-option"
                :class="{ active: code === locale }"
                @click="setLocale(code)"
              >
                {{ code }}
              </view>
            </view>
          </view>
          <AppButton
            class="user-invite-btn"
            :disabled="inviteGenerating"
            @click="handleInviteVendor"
          >
            {{ inviteGenerating ? t('生成中...') : t('邀请供应商') }}
          </AppButton>
          <AppButton
            class="user-debug-btn"
            @click="handleViewLocalData"
          >
            {{ t('查看本地数据') }}
          </AppButton>
          <AppButton
            class="user-clear-cache-btn"
            :disabled="isClearingLocalCache"
            @click="handleClearLocalCache"
          >
            {{ isClearingLocalCache ? t('清理中...') : t('清除本地缓存') }}
          </AppButton>
          <AppButton class="user-logout-btn" @click="handleLogout">{{ t('退出登录') }}</AppButton>
        </view>
      </view>
    </view>

    <!-- FAB 操作菜单 -->
    <view v-if="showMenu" class="menu-overlay" @click="hideActionMenu">
      <view class="action-menu" @click.stop>
        <view v-if="statusKey === 'planned'" class="menu-item" @click="handleMergeInspection">
          <uni-icons class="menu-icon menu-icon-uni" type="redo" size="22" color="#333" />
          <text class="menu-text">{{ t('合并验货') }}</text>
        </view>
        <view class="menu-item" @click="handleScanSearch">
          <uni-icons class="menu-icon menu-icon-uni" type="scan" size="22" color="#333" />
          <text class="menu-text">{{ t('通过扫描条码来搜索验货') }}</text>
        </view>
        <view class="menu-item" @click="goSearch">
          <uni-icons class="menu-icon menu-icon-uni" type="search" size="22" color="#333" />
          <text class="menu-text">{{ t('开始验货') }}</text>
        </view>
        <view v-if="statusKey !== 'report'" class="menu-item" @click="handleQuickInspection">
          <uni-icons class="menu-icon menu-icon-uni" type="plus" size="22" color="#333" />
          <text class="menu-text">{{ t('创建快速验货') }}</text>
        </view>
        <view class="menu-cancel" @click="hideActionMenu">{{ t('取消') }}</view>
      </view>
    </view>

    <!-- 选择验货类型 -->
    <view v-if="showInspectTypeModal" class="menu-overlay" @click="closeInspectTypeSelector">
      <view class="inspect-type-modal" @click.stop>
        <view class="inspect-type-title">{{ t('选择一个验货类型进行合并') }}</view>
        <view v-if="inspectTypeLoading" class="inspect-type-loading">{{ t('加载中...') }}</view>
        <view v-else class="inspect-type-grid">
          <AppButton
            v-for="option in inspectTypeOptions"
            :key="option.value"
            class="inspect-type-chip"
            :class="{ active: selectedInspectType === option.value }"
            @click="selectedInspectType = option.value"
          >
            {{ option.label }}
          </AppButton>
          <view v-if="inspectTypeOptions.length === 0" class="inspect-type-empty">{{ t('暂无可选验货类型') }}</view>
        </view>
        <view class="inspect-type-actions">
          <AppButton class="inspect-type-btn cancel" @click="closeInspectTypeSelector">{{ t('取消') }}</AppButton>
          <AppButton
            class="inspect-type-btn next"
            :disabled="!selectedInspectType || inspectTypeLoading"
            @click="proceedMergeWithInspectType"
          >
            {{ t('下一步') }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 合并模式底部操作栏 -->
    <view v-if="isMergeMode" class="merge-action-bar">
      <AppButton class="merge-action-btn cancel" @click="exitMergeMode">{{ t('取消') }}</AppButton>
      <AppButton
        class="merge-action-btn confirm"
        :disabled="mergeSelectedIds.length < 2 || mergeSubmitting"
        @click="openMergeConfirmModal"
      >
        {{ mergeSubmitting ? t('合并中...') : `${t('合并验货')}（${mergeSelectedIds.length}）` }}
      </AppButton>
    </view>

    <!-- 合并前确认弹窗 -->
    <view v-if="showMergeConfirmModal" class="menu-overlay" @click="closeMergeConfirmModal">
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t('确认合并以下验货数据') }}</view>
        <view class="merge-confirm-table-wrap">
          <table class="merge-confirm-table">
            <thead>
              <tr>
                <th>{{ t('单号') }}</th>
                <th>{{ t('款号#批次') }}</th>
                <th>{{ t('产品名称') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in mergePreviewItems" :key="getPlanUniqueId(item)">
                <td>{{ getItemClientOrderNo(item) }}</td>
                <td>{{ getItemSubGoodsBatch(item) }}</td>
                <td>{{ getItemGoodsName(item) }}</td>
              </tr>
            </tbody>
          </table>
        </view>
        <view v-if="mergeSubmitting" class="merge-confirm-loading">
          <text class="loading-dot"></text>
          <text>{{ t('处理中，请稍候...') }}</text>
        </view>
        <view v-if="mergeConfirmed && !mergeSubmitting" class="merge-confirm-tip">
          {{ t('一个新的合并验货已生成，您现在可以下载了') }}
        </view>
        <view
          v-if="mergeConfirmed && !mergeSubmitting"
          class="merge-checklist-row"
          @click="openMergeChecklistPicker"
        >
          <text class="merge-checklist-label">{{ t('清单') }}</text>
          <text class="merge-checklist-value">{{ mergeDownloadTemplateName || t('请选择清单') }}</text>
        </view>
        <view class="merge-confirm-actions">
          <AppButton class="merge-confirm-btn close" @click="closeMergeConfirmModal">{{ t('关闭') }}</AppButton>
          <AppButton class="merge-confirm-btn submit" :disabled="mergeSubmitting" @click="handleMergeConfirmPrimaryAction">
            {{ mergeSubmitting ? t('处理中...') : (mergeConfirmed ? t('下载验货') : t('合并')) }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 拆分确认弹窗 -->
    <view v-if="showSplitPreviewModal" class="menu-overlay" @click="closeSplitPreviewModal">
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t('拆分验货') }}</view>
        <view class="split-sub-title">{{ t('此合并验货包含以下验货：') }}</view>
        <view class="merge-confirm-table-wrap">
          <table class="merge-confirm-table">
            <thead>
              <tr>
                <th>{{ t('单号') }}</th>
                <th>{{ t('款号#批次') }}</th>
                <th>{{ t('产品名称') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in splitPreviewItems" :key="getPlanUniqueId(item)">
                <td>{{ getItemClientOrderNo(item) }}</td>
                <td>{{ getItemSubGoodsBatch(item) }}</td>
                <td>{{ getItemGoodsName(item) }}</td>
              </tr>
            </tbody>
          </table>
        </view>
        <view v-if="splitSubmitting || splitLoading" class="merge-confirm-loading">
          <text class="loading-dot"></text>
          <text>{{ t('处理中，请稍候...') }}</text>
        </view>
        <view class="merge-confirm-actions">
          <AppButton class="merge-confirm-btn close" @click="closeSplitPreviewModal">{{ t('取消') }}</AppButton>
          <AppButton class="merge-confirm-btn submit" :disabled="splitSubmitting || splitLoading" @click="confirmSplitInspection">
            {{ splitSubmitting ? t('拆分中...') : t('拆分') }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 拆分结果弹窗 -->
    <view v-if="showSplitResultModal" class="menu-overlay" @click="closeSplitResultModal">
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t('拆分验货') }}</view>
        <view class="split-result-list">
          <view v-for="item in splitResultItems" :key="`${getPlanUniqueId(item)}-split`" class="split-result-item">
            <view class="split-result-main">
              <view class="split-result-name">{{ getItemGoodsName(item) }}</view>
              <view class="split-result-order">{{ getItemClientOrderNo(item) }}</view>
              <view class="split-result-no">{{ getItemSubGoodsBatch(item) }}</view>
              <view class="split-result-type">{{ getItemInspectType(item) || '-' }}</view>
            </view>
            <AppButton class="split-download-btn" :disabled="splitDownloadLoadingMap[getPlanUniqueId(item)]" @click="downloadSplitItem(item)">
              {{ splitDownloadLoadingMap[getPlanUniqueId(item)] ? t('下载中') : t('下载') }}
            </AppButton>
          </view>
        </view>
        <view class="merge-confirm-actions">
          <AppButton class="merge-confirm-btn close full" @click="closeSplitResultModal">{{ t('取消') }}</AppButton>
        </view>
      </view>
    </view>

    <view v-if="showInviteFallbackModal" class="invite-fallback-overlay" @click="closeInviteFallbackModal">
      <view class="invite-fallback-modal" @click.stop>
        <view class="invite-fallback-title">{{ t('复制邀请链接') }}</view>
        <view class="invite-fallback-desc">{{ t('请复制下方链接发送给供应商') }}</view>
        <view class="invite-fallback-link">{{ inviteFallbackLink }}</view>
        <view class="invite-fallback-actions">
          <AppButton class="invite-fallback-btn copy" :disabled="inviteCopying" @click="copyInviteLinkFromModal">
            {{ inviteCopying ? t('复制中...') : (inviteCopied ? t('已复制') : t('复制链接')) }}
          </AppButton>
          <AppButton class="invite-fallback-btn close" @click="closeInviteFallbackModal">{{ t('我知道了') }}</AppButton>
        </view>
      </view>
    </view>

    <ChecklistPickerPopup
      :visible="mergeChecklistPickerVisible"
      :value-id="mergeDownloadTemplateId"
      :value-name="mergeDownloadTemplateName"
      @close="mergeChecklistPickerVisible = false"
      @confirm="handleMergeChecklistConfirm"
    />
  </view>
</template>

<script setup>
import { computed, nextTick, onActivated, onMounted, ref } from 'vue'
import { useAuthStore } from '../../store/auth.js'
import { useReportStore } from '../../store/report.js'
import { searchPlans, getLocalPlans, getLocalPlanSummaries, mergePlans, savePlanToLocal, formatPlanData, getInspectTypeDict, downloadPlan, getReportDetail, splitDownloadDataToLocalPlans, splitPlan, removePlanFromLocal } from '../../api/plan.js'
import { generateReport } from '../../api/report.js'
import { generateVendorInviteLink } from '../../api/invite.js'
import PlanListItemCard from './components/PlanListItemCard.vue'
import ChecklistPickerPopup from './components/ChecklistPickerPopup.vue'
import SyncCloudIcon from './components/SyncCloudIcon.vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'
import { useI18n } from '../../utils/i18n.js'
import {
  buildDisplayTabCounts,
  buildLocalPlanIndex,
  buildTabCounts,
  getPlanUniqueId,
  groupPlans,
  isItemInTab,
  mergeVisiblePlans,
  normalizePlanStatus
} from './utils/reportListViewModel.js'

const authStore = useAuthStore()
const reportStore = useReportStore()
const { t, locale, supportedLocales, setLocale } = useI18n()

const statusTabs = computed(() => [
  { key: 'planned', label: t('已定计划'), icon: 'Ⅱ' },
  { key: 'progress', label: t('进行中'), icon: '▶' },
  { key: 'report', label: t('报告'), icon: '✓' }
])

const statusKey = ref('planned')
const loading = ref(false)
const loadingMore = ref(false)
const isSyncing = ref(false)
const showMenu = ref(false)
const showUserDrawer = ref(false)
const inviteGenerating = ref(false)
const inviteCopying = ref(false)
const inviteCopied = ref(false)
const showInviteFallbackModal = ref(false)
const inviteFallbackLink = ref('')
const isClearingLocalCache = ref(false)
const showInspectTypeModal = ref(false)
const inspectTypeLoading = ref(false)
const inspectTypeOptions = ref([])
const selectedInspectType = ref('')
const mergeInspectType = ref('')
const isMergeMode = ref(false)
const mergeSelectedIds = ref([])
const showMergeConfirmModal = ref(false)
const mergePreviewSnapshot = ref([])
const mergeConfirmed = ref(false)
const mergedDownloadPlanId = ref('')
const showMergeReadyNotice = ref(false)
const mergeSubmitting = ref(false)
const mergeChecklistPickerVisible = ref(false)
const mergeDownloadTemplateId = ref('')
const mergeDownloadTemplateName = ref('')
const showSplitPreviewModal = ref(false)
const splitPreviewItems = ref([])
const splitLoading = ref(false)
const splitSubmitting = ref(false)
const splitTargetPlanId = ref('')
const splitTargetParentPlanId = ref('')
const showSplitResultModal = ref(false)
const splitResultItems = ref([])
const splitDownloadLoadingMap = ref({})
const reportShowAll = ref(false)
let inviteCopiedResetTimer = null

// 远程计划列表映射
const remoteListMap = ref({
  planned: [],
  progress: [],
  report: []
})

// 分页映射（0 表示尚未从远程加载过，第一次点击加载第 1 页）
const pageMap = ref({
  planned: 0,
  progress: 0,
  report: 0
})

// 远程数据总条数映射
const totalMap = ref({
  planned: 0,
  progress: 0,
  report: 0
})

// 本地计划列表（已下载）
const localPlans = ref([])
const pendingSyncCount = computed(() => reportStore.pendingSyncCount)

const pageSize = 100
const currentPage = computed(() => {
  return pageMap.value[statusKey.value] || 1
})
const totalPages = computed(() => {
  const total = Math.max(totalMap.value[statusKey.value] || 0, localTabCounts.value[statusKey.value] || 0)
  return Math.max(1, Math.ceil(total / pageSize))
})
const shouldShowPagination = computed(() => {
  const total = Math.max(totalMap.value[statusKey.value] || 0, localTabCounts.value[statusKey.value] || 0)
  return total > pageSize
})
const localPlanIndex = computed(() => buildLocalPlanIndex(localPlans.value))
const localTabCounts = computed(() => buildTabCounts(localPlans.value, { planned: [], progress: [], report: [] }))
const tabCounts = computed(() => buildTabCounts(localPlans.value, remoteListMap.value))
const displayTabCounts = computed(() => buildDisplayTabCounts({
  tabCounts: tabCounts.value,
  totalMap: totalMap.value
}))
const displayTotalCount = computed(() => displayTabCounts.value[statusKey.value] || 0)

function getItemInspectorId(item) {
  return item?.plan?.inspectorId ?? item?.inspectorId ?? item?.raw?.inspectorId ?? ''
}

function isOwnedByCurrentUser(item) {
  const currentUserId = authStore.user?.userId
  if (currentUserId === undefined || currentUserId === null || currentUserId === '') return true
  const inspectorId = getItemInspectorId(item)
  return String(inspectorId || '') === String(currentUserId)
}

// 过滤后的列表
const filtered = computed(() => {
  const merged = mergeVisiblePlans({
    localPlans: localPlans.value,
    remotePlans: remoteListMap.value[statusKey.value] || [],
    statusKey: statusKey.value,
    page: currentPage.value,
    pageSize,
    localIndex: localPlanIndex.value
  })
  
  if (statusKey.value === 'report' && !reportShowAll.value) {
    return merged.filter(isWithinLastOneDay)
  }
  return merged
})

// 按 clientOrderNo 分组展示，同组只显示一个头部
const groupedFiltered = computed(() => {
  return groupPlans(filtered.value, t, getItemOrderDate)
})

function getItemSupplierName(item) {
  return item?.plan?.factoryName || item?.supplierName || item?.factoryName || '-'
}

function formatHeaderDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekDays = [t('周日'), t('周一'), t('周二'), t('周三'), t('周四'), t('周五'), t('周六')]
  const weekDay = weekDays[date.getDay()]
  return t('{year}年{month}月{day}日 {weekDay}', { year, month, day, weekDay })
}

function getItemOrderDate(item) {
  return formatHeaderDate(item?.plan?.createDate || item?.createdAt || item?.createDate) || ''
}

const mergePreviewItems = computed(() => {
  if (mergePreviewSnapshot.value.length > 0) {
    return mergePreviewSnapshot.value
  }
  const selectedIdSet = new Set(mergeSelectedIds.value)
  return filtered.value.filter(item => selectedIdSet.has(getPlanUniqueId(item)))
})

// 获取 tab 计数
function getTabCount(key) {
  return displayTabCounts.value[key] || 0
}

// 空状态标题
const emptyTitle = computed(() => {
  if (statusKey.value === 'planned') return t('暂无已下载的计划')
  if (statusKey.value === 'progress') return t('暂无进行中的验货任务')
  return t('暂无验货报告')
})

// 空状态副标题
const emptySubtitle = computed(() => {
  if (statusKey.value === 'planned') return t('点击「加载更多」拉取计划')
  if (statusKey.value === 'progress') return t('点击「已定计划」开始验货')
  return t('点击「加载更多」拉取报告')
})

// 判断是否已在本地下载
function isLocalDownloaded(item) {
  const id = getPlanUniqueId(item)
  return !!id && localPlanIndex.value.idSet.has(id)
}

// 切换 tab
function switchTab(key) {
  if (key !== 'planned' && isMergeMode.value) {
    exitMergeMode()
  }
  if (key !== 'planned') {
    closeInspectTypeSelector()
    closeSplitPreviewModal()
    closeSplitResultModal()
  }
  if (key === 'report') {
    reportShowAll.value = false
  }
  statusKey.value = key
}

function parsePlanTime(plan) {
  const candidates = [
    plan?.updatedAt,
    plan?.finishedAt,
    plan?.syncedAt,
    plan?.downloadedAt,
    plan?.plan?.updateDate,
    plan?.plan?.createDate,
    plan?.updateDate,
    plan?.createDate
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const ts = new Date(candidate).getTime()
    if (Number.isFinite(ts)) return ts
  }
  return 0
}

const LOCAL_REPORT_RETENTION_DAYS = 7

function isWithinLastOneDay(plan) {
  const ts = parsePlanTime(plan)
  if (!ts) return false
  return (Date.now() - ts) <= (LOCAL_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return ''

  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return t('今天')
  if (days === 1) return t('昨天')
  if (days < 7) return t('{days}天前', { days })

  const month = date.getMonth() + 1
  const day = date.getDate()
  return t('{month}月{day}日', { month, day })
}

// 获取状态文本
function getStatusText(item) {
  if (statusKey.value === 'planned') return t('待开始')
  if (statusKey.value === 'progress') {
    const progress = item.progress || 0
    return `${progress}%`
  }
  if (statusKey.value === 'report') return t('已完成')
  return t('未知')
}

// 显示用户菜单（退出登录）
function showUserMenu() {
  showUserDrawer.value = true
}

function closeUserDrawer() {
  showUserDrawer.value = false
}

function handleLogout() {
  authStore.logout()
  uni.reLaunch({
    url: '/pages/login/login'
  })
}

function showConfirmModal({ title, content, confirmText, cancelText, confirmColor = '#ef4444' }) {
  return new Promise((resolve) => {
    if (typeof uni !== 'undefined' && typeof uni.showModal === 'function') {
      uni.showModal({
        title,
        content,
        confirmText,
        cancelText,
        confirmColor,
        success: (res) => resolve(!!res?.confirm),
        fail: () => resolve(false)
      })
      return
    }
    const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${content}`) : false
    resolve(!!ok)
  })
}

async function handleViewLocalData() {
  closeUserDrawer()
  try {
    const plans = await getLocalPlans()
    const summary = (plans || []).map((p) => ({
      id: p.planId || p.id,
      orderNo: p.plan?.clientOrderNo || p.plan?.domeNo || '-',
      status: p.status,
      syncStatus: p.syncStatus || '-',
      hasPendingPayload: !!p.pendingSyncPayload,
      downloadedAt: p.downloadedAt || '-'
    }))
    console.table(summary)
    console.log('[本地数据] 完整数据:', plans)
    const pendingCount = summary.filter((s) => s.hasPendingPayload).length
    globalThis.showToast(
      t('本地共 {total} 条，待同步 {pending} 条', { total: summary.length, pending: pendingCount })
    )
  } catch (error) {
    console.error('读取本地数据失败:', error)
    globalThis.showToast(error.message || t('读取本地数据失败'))
  }
}

async function handleInviteVendor() {
  if (inviteGenerating.value) return
  closeUserDrawer()
  inviteGenerating.value = true
  try {
    const inviteData = await generateVendorInviteLink()
    const inviteLink = String(inviteData?.inviteLink || '').trim()
    if (!inviteLink) {
      throw new Error(t('邀请码生成成功，但注册链接为空'))
    }

    try {
      await copyTextToClipboard(inviteLink)
      showInviteCopySuccess()
    } catch (copyError) {
      console.warn('自动复制邀请链接失败:', copyError)
      uni.showToast({ title: t('自动复制失败，请手动复制'), icon: 'none' })
      openInviteFallbackModal(inviteLink)
    }
  } catch (error) {
    console.error('生成邀请链接失败:', error)
    globalThis.showToast(error.message || t('生成邀请链接失败'))
  } finally {
    inviteGenerating.value = false
  }
}

function openInviteFallbackModal(inviteLink) {
  inviteFallbackLink.value = inviteLink
  inviteCopying.value = false
  inviteCopied.value = false
  showInviteFallbackModal.value = true
}

function closeInviteFallbackModal() {
  showInviteFallbackModal.value = false
}

function copyTextToClipboard(text) {
  const value = String(text || '').trim()
  if (!value) return Promise.reject(new Error(t('复制内容为空')))

  const tryUniClipboard = () => new Promise((resolve, reject) => {
    if (typeof uni === 'undefined' || typeof uni.setClipboardData !== 'function') {
      reject(new Error('uni clipboard unavailable'))
      return
    }
    uni.setClipboardData({ data: value, success: resolve, fail: reject })
  })

  const tryNavigatorClipboard = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return Promise.reject(new Error('navigator clipboard unavailable'))
    }
    return navigator.clipboard.writeText(value)
  }

  const tryTextareaClipboard = () => new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
      reject(new Error('textarea clipboard unavailable'))
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const copied = document.execCommand('copy')
    textarea.parentNode?.removeChild(textarea)
    copied ? resolve() : reject(new Error('execCommand copy failed'))
  })

  return tryUniClipboard()
    .catch(() => tryNavigatorClipboard())
    .catch(() => tryTextareaClipboard())
}

function showInviteCopySuccess() {
  inviteCopied.value = true
  if (inviteCopiedResetTimer) clearTimeout(inviteCopiedResetTimer)
  inviteCopiedResetTimer = setTimeout(() => {
    inviteCopied.value = false
    inviteCopiedResetTimer = null
  }, 1800)
  uni.showToast({
    title: t('邀请链接已复制'),
    icon: 'success',
    duration: 1800
  })
}

async function copyInviteLinkFromModal() {
  const link = String(inviteFallbackLink.value || '').trim()
  if (!link || inviteCopying.value) return
  inviteCopying.value = true
  inviteCopied.value = false
  try {
    await copyTextToClipboard(link)
    showInviteCopySuccess()
  } catch (error) {
    console.warn('复制邀请链接失败:', error)
    uni.showToast({ title: t('请长按复制下方链接'), icon: 'none' })
  } finally {
    inviteCopying.value = false
  }
}

async function handleClearLocalCache() {
  if (isClearingLocalCache.value) return
  closeUserDrawer()
  hideActionMenu()
  await nextTick()

  const firstConfirm = await showConfirmModal({
    title: t('清除本地缓存'),
    content: t('该操作会删除当前设备上的全部离线验货数据（SQLite），且不可恢复，是否继续？'),
    confirmText: t('继续'),
    cancelText: t('取消')
  })
  if (!firstConfirm) return

  const secondConfirm = await showConfirmModal({
    title: t('再次确认'),
    content: t('请再次确认：确定清除全部本地缓存数据？'),
    confirmText: t('确认清除'),
    cancelText: t('返回')
  })
  if (!secondConfirm) return

  isClearingLocalCache.value = true
  try {
    const plans = await getLocalPlans()
    const planIds = Array.from(new Set(
      (plans || []).map(item => getPlanUniqueId(item)).filter(Boolean)
    ))
    for (const id of planIds) {
      await removePlanFromLocal(id)
    }
    // 清空页面内存态，避免远程缓存列表仍残留在界面
    localPlans.value = []
    remoteListMap.value = { planned: [], progress: [], report: [] }
    pageMap.value = { planned: 0, progress: 0, report: 0 }
    totalMap.value = { planned: 0, progress: 0, report: 0 }
    reportShowAll.value = false
    mergeSelectedIds.value = []

    await loadLocalPlans()
    globalThis.showToast(
      planIds.length
        ? t('本地缓存已清除，共 {count} 条', { count: planIds.length })
        : t('本地缓存为空，无需清除')
    )
  } catch (error) {
    console.error('清除本地缓存失败:', error)
    globalThis.showToast(error.message || t('清除本地缓存失败'))
  } finally {
    isClearingLocalCache.value = false
  }
}
  
function resolveGeneratedReportId(result) {
  if (typeof result === 'string' || typeof result === 'number') return String(result)
  const candidate = (
    result?.reportId ||
    result?.id ||
    result?.data ||
    result?.data?.reportId ||
    result?.data?.id ||
    ''
  )
  return String(candidate || '').trim()
}

function mergeRemoteDetailIntoPlan(localPlan, remoteDetail, reportId) {
  const base = localPlan && typeof localPlan === 'object' ? localPlan : {}
  const merged = {
    ...base,
    ...(remoteDetail && typeof remoteDetail === 'object' ? remoteDetail : {})
  }
  const normalizedReportId = String(reportId || '').trim()
  if (normalizedReportId) {
    const reportObj = (merged.report && typeof merged.report === 'object') ? { ...merged.report } : {}
    if (!reportObj.id) reportObj.id = normalizedReportId
    merged.report = reportObj
    if (!merged.reportId) merged.reportId = normalizedReportId
  }
  return merged
}

// 同步数据
async function syncData(options = {}) {
  const { silent = false } = options
  if (isSyncing.value) return
  isSyncing.value = true

  try {
    const fullLocalPlans = await getLocalPlans()
    const pendingPlans = fullLocalPlans.filter(isPlanPendingSync)
    if (!pendingPlans.length) {
      await loadLocalPlans()
      if (!silent) globalThis.showToast(t('本地数据已是最新，无需同步'))
      return
    }

    const online = await isNetworkOnline()
    if (!online) {
      if (!silent) globalThis.showToast(t('当前无网络，暂无法同步'))
      return
    }

    let syncedCount = 0
    let failedCount = 0
    for (const plan of pendingPlans) {
      // 二次兜底：即便进入队列，也禁止对已完成报告发起 generate
      if (!isPlanPendingSync(plan)) continue
      const payload = plan?.pendingSyncPayload
      if (!payload) {
        failedCount++
        continue
      }
      try {
        const generateResult = await generateReport(payload)
        const reportIdFromResp = resolveGeneratedReportId(generateResult)
        let remoteDetail = null
        if (reportIdFromResp) {
          try {
            remoteDetail = await getReportDetail(reportIdFromResp)
          } catch (e) {
            console.warn('拉取报告详情失败:', e)
          }
        }
        const syncedNow = new Date().toISOString()
        const mergedPlan = mergeRemoteDetailIntoPlan(plan, remoteDetail, reportIdFromResp)
        const syncedPlan = {
          ...mergedPlan,
          syncStatus: 'SYNCED',
          pendingSyncPayload: null,
          syncedAt: syncedNow,
          updatedAt: syncedNow
        }
        await savePlanToLocal(syncedPlan)
        await clearMergedSiblingSyncStatus(plan, syncedNow)
        syncedCount++
      } catch (error) {
        console.error('同步单条报告失败:', error)
        failedCount++
        showSyncErrorToast(error?.message || t('同步失败'))
      }
    }

    await loadLocalPlans()
    if (failedCount > 0) {
      if (!silent) globalThis.showToast(t('已同步 {ok} 条，失败 {fail} 条', { ok: syncedCount, fail: failedCount }))
      return
    }
    if (!silent) globalThis.showToast(t('同步成功，共 {count} 条', { count: syncedCount }))
  } catch (error) {
    console.error('同步失败:', error)
    showSyncErrorToast(error?.message || t('同步失败'))
  } finally {
    isSyncing.value = false
  }
}

function isPlanPendingSync(plan) {
  if (!plan || typeof plan !== 'object') return false
  // 已完成报告（status=3）禁止再次调用 generate 接口
  if (normalizePlanStatus(plan) === 3) return false
  // 合并验货子计划不独立同步，由主计划统一负责
  const mergeType = Number(plan?.plan?.mergeType ?? plan?.mergeType ?? 0)
  if (mergeType === 2) {
    const parentPlanId = String(plan?.plan?.parentPlanId ?? plan?.parentPlanId ?? '').trim()
    const ownId = String(plan?.id || plan?.planId || plan?.reportId || '').trim()
    if (parentPlanId && parentPlanId !== ownId) return false
  }
  // payload 内显式标记为完成态也禁止同步（防历史脏数据）
  const payloadStatus = String(
    plan?.pendingSyncPayload?.status
    || plan?.pendingSyncPayload?.plan?.status
    || ''
  ).toUpperCase()
  if (payloadStatus === '3' || payloadStatus === 'COMPLETED' || payloadStatus === 'DONE' || payloadStatus === 'SUBMITTED') {
    return false
  }
  if (plan.syncStatus === 'DIRTY' && plan.pendingSyncPayload) return true
  // 兼容旧数据：没有 syncStatus 但带待同步 payload 也视为待同步
  if (!plan.syncStatus && plan.pendingSyncPayload) return true
  return false
}

async function clearMergedSiblingSyncStatus(plan, syncedAt) {
  const mergeType = Number(plan?.plan?.mergeType ?? plan?.mergeType ?? 0)
  if (mergeType !== 2) return
  const parentPlanId = String(plan?.plan?.parentPlanId ?? plan?.parentPlanId ?? '').trim()
  const ownId = String(plan?.id || plan?.planId || plan?.reportId || '').trim()
  if (!parentPlanId) return
  try {
    const allPlans = await getLocalPlans()
    for (const sibling of allPlans) {
      const siblingKey = String(sibling?.id || sibling?.planId || sibling?.reportId || '')
      if (siblingKey === ownId) continue
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

function showSyncErrorToast(message) {
  const title = String(message || t('同步失败'))
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({ title, icon: 'none' })
    return
  }
  if (typeof globalThis.showToast === 'function') {
    globalThis.showToast(title)
    return
  }
  console.error(title)
}

async function isNetworkOnline() {
  return new Promise((resolve) => {
    if (typeof uni === 'undefined' || typeof uni.getNetworkType !== 'function') {
      resolve(true)
      return
    }
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType !== 'none'),
      fail: () => resolve(false)
    })
  })
}

// 加载本地计划列表
async function loadLocalPlans() {
  try {
    let allLocalPlans = await getLocalPlans()
    const staleReports = (allLocalPlans || []).filter((plan) => (
      normalizePlanStatus(plan) === 3 && !isWithinLastOneDay(plan)
    ))
    for (const plan of staleReports) {
      const planId = getPlanUniqueId(plan)
      if (!planId) continue
      await removePlanFromLocal(planId)
    }
    if (staleReports.length > 0) {
      allLocalPlans = await getLocalPlans()
    }
    // 修复历史脏数据：已完成报告不允许残留待同步 payload，否则会误触发 generate
    const completedWithPending = (allLocalPlans || []).filter((plan) => (
      normalizePlanStatus(plan) === 3 && !!plan?.pendingSyncPayload
    ))
    if (completedWithPending.length > 0) {
      const now = new Date().toISOString()
      for (const plan of completedWithPending) {
        await savePlanToLocal({
          ...plan,
          syncStatus: 'SYNCED',
          pendingSyncPayload: null,
          syncedAt: plan?.syncedAt || now,
          updatedAt: now
        })
      }
      allLocalPlans = await getLocalPlans()
    }
    const summaries = await getLocalPlanSummaries()
    localPlans.value = (summaries || []).filter(isOwnedByCurrentUser)
    console.log('[ReportList] 本地验货计划数量:', localPlans.value.length)
  } catch (error) {
    console.error('加载本地计划失败:', error)
    localPlans.value = []
  }
}

function resolveApiStatusByTab(key) {
  if (key === 'planned') return 0
  if (key === 'progress') return 1
  if (key === 'report') return 3
  return 0
}

// 按页加载（固定每页 100 条）
async function loadPage(page, key = statusKey.value) {
  if (page < 1) return
  loadingMore.value = true

  try {
    if (key === 'report') {
      reportShowAll.value = true
    }

    const apiStatus = resolveApiStatusByTab(key)
    const result = await searchPlans({
      status: apiStatus,
      inspectorId: authStore.user?.userId
    }, page, pageSize)

    const newPlans = result.records || []
    totalMap.value[key] = result.total || 0

    const nextRemoteList = []
    const exists = new Set()
    for (const rawPlan of newPlans) {
      const normalizedPlan = {
        ...rawPlan,
        ...formatPlanData(rawPlan?.plan || rawPlan)
      }
      const id = getPlanUniqueId(normalizedPlan)
      if (!id) {
        nextRemoteList.push(normalizedPlan)
        continue
      }
      if (!exists.has(id)) {
        nextRemoteList.push(normalizedPlan)
        exists.add(id)
      }
    }
    remoteListMap.value[key] = nextRemoteList
    pageMap.value[key] = page
  } catch (error) {
    console.error('分页加载失败:', error)
    globalThis.showToast(error.message || t('加载失败'))
  } finally {
    loadingMore.value = false
  }
}

function loadMore() {
  // 按需求：点击“加载更多”时，固定请求第 1 页
  loadPage(1)
}

function loadPrevPage() {
  if (currentPage.value <= 1) return
  loadPage(currentPage.value - 1)
}

function loadNextPage() {
  if (currentPage.value >= totalPages.value) return
  loadPage(currentPage.value + 1)
}

// 显示操作菜单
function showActionMenu() {
  showMenu.value = true
}

// 隐藏操作菜单
function hideActionMenu() {
  showMenu.value = false
}

function resolveTemplateFromPlanItem(item) {
  const source = item && typeof item === 'object' ? item : {}
  const plan = (source.plan && typeof source.plan === 'object') ? source.plan : source
  const id = String(plan?.templateId || source?.templateId || '').trim()
  const name = String(plan?.templateName || source?.templateName || '').trim()
  return { id, name: name || id }
}

function openMergeConfirmModal() {
  const payload = buildMergePayload()
  if (!payload) return
  mergePreviewSnapshot.value = payload.selectedItems || []
  mergeConfirmed.value = false
  mergedDownloadPlanId.value = ''
  mergeChecklistPickerVisible.value = false
  mergeDownloadTemplateId.value = ''
  mergeDownloadTemplateName.value = ''
  const { id, name } = resolveTemplateFromPlanItem(mergePreviewSnapshot.value?.[0])
  if (id) {
    mergeDownloadTemplateId.value = id
    mergeDownloadTemplateName.value = name
  }
  showMergeConfirmModal.value = true
}

function closeMergeConfirmModal() {
  showMergeConfirmModal.value = false
  mergeChecklistPickerVisible.value = false
  exitMergeMode()
}

async function openSplitPreviewModal(item) {
  if (!isSplitAvailable(item)) {
    globalThis.showToast(t('仅支持已合并(mergeType=2)、未锁定(lockFlag=0)、已定计划(status=0)的任务拆分'))
    return
  }

  const parentPlanId = getItemParentPlanId(item)
  const currentPlanId = String(getPlanUniqueId(item) || '')
  splitTargetParentPlanId.value = parentPlanId || currentPlanId
  splitTargetPlanId.value = currentPlanId
  if (!splitTargetPlanId.value) {
    globalThis.showToast(t('计划ID缺失，无法拆分'))
    return
  }

  showSplitPreviewModal.value = true
  splitLoading.value = true
  try {
    const result = await searchPlans({
      parentPlanId: splitTargetParentPlanId.value
    })
    const rows = Array.isArray(result?.records) ? result.records : []
    const localById = new Map(localPlans.value.map(plan => [getPlanUniqueId(plan), plan]))
    const remoteCandidates = Object.values(remoteListMap.value || {}).flatMap(list => Array.isArray(list) ? list : [])
    const allCandidates = [
      ...rows,
      ...localPlans.value,
      ...remoteCandidates
    ]
    const groupedRows = allCandidates.filter((candidate) => {
      const candidateParentPlanId = String(
        candidate?.plan?.parentPlanId ??
        candidate?.parentPlanId ??
        candidate?.raw?.parentPlanId ??
        ''
      ).trim()
      return candidateParentPlanId === splitTargetParentPlanId.value
    })

    const uniqueRows = []
    const seenIds = new Set()
    groupedRows.forEach((row) => {
      const rowKey = String(getPlanUniqueId(row) || '')
      if (!rowKey || seenIds.has(rowKey)) return
      seenIds.add(rowKey)
      uniqueRows.push(localById.get(rowKey) || row)
    })

    splitPreviewItems.value = uniqueRows.length ? uniqueRows : [item]
  } catch (error) {
    console.error('加载拆分预览失败:', error)
    splitPreviewItems.value = [item]
    globalThis.showToast(error.message || t('加载拆分预览失败'))
  } finally {
    splitLoading.value = false
  }
}

function closeSplitPreviewModal() {
  showSplitPreviewModal.value = false
  splitPreviewItems.value = []
  splitTargetPlanId.value = ''
  splitTargetParentPlanId.value = ''
}

function mapSplitTypeOne(item) {
  return {
    ...item,
    mergeType: 1,
    plan: {
      ...(item?.plan || {}),
      mergeType: 1
    },
    raw: {
      ...(item?.raw || {}),
      mergeType: 1
    }
  }
}

function markSplitTypeForItems(items = []) {
  const targetIdSet = new Set(items.flatMap(getItemCandidateIds))
  if (!targetIdSet.size) return

  const markItem = (item) => {
    const matched = getItemCandidateIds(item).some(id => targetIdSet.has(id))
    return matched ? mapSplitTypeOne(item) : item
  }

  localPlans.value = (localPlans.value || []).map(markItem)
  Object.keys(remoteListMap.value).forEach((key) => {
    remoteListMap.value[key] = (remoteListMap.value[key] || []).map(markItem)
  })
}

async function confirmSplitInspection() {
  if (!splitTargetPlanId.value) {
    globalThis.showToast(t('计划ID缺失，无法拆分'))
    return
  }

  splitSubmitting.value = true
  try {
    console.log(splitTargetPlanId.value,'fudeid')
    await splitPlan(splitTargetPlanId.value)
    const resultFromPreview = (splitPreviewItems.value || []).map(mapSplitTypeOne)
    splitResultItems.value = resultFromPreview
    markSplitTypeForItems(resultFromPreview)
    showSplitPreviewModal.value = false
    showSplitResultModal.value = true
    await loadLocalPlans()
    globalThis.showToast(t('拆分验货成功'))
  } catch (error) {
    console.error('拆分验货失败:', error)
    globalThis.showToast(error.message || t('拆分验货失败'))
  } finally {
    splitSubmitting.value = false
  }
}

function closeSplitResultModal() {
  showSplitResultModal.value = false
  splitResultItems.value = []
  splitDownloadLoadingMap.value = {}
}

async function downloadSplitItem(item) {
  const planId = getPlanUniqueId(item)
  if (!planId) {
    globalThis.showToast(t('计划ID缺失，无法下载'))
    return
  }

  const key = String(planId)
  splitDownloadLoadingMap.value = {
    ...splitDownloadLoadingMap.value,
    [key]: true
  }
  try {
    const result = await downloadPlan(planId,{templateId: item.templateId})
    const localRecords = splitDownloadDataToLocalPlans(result)
    if (!localRecords.length) {
      throw new Error(t('下载数据为空，无法保存到本地'))
    }
    for (const record of localRecords) {
      await savePlanToLocal(record)
    }
    await loadLocalPlans()
    globalThis.showToast(t('下载验货成功'))
  } catch (error) {
    console.error('下载验货失败:', error)
    globalThis.showToast(error.message || t('下载验货失败'))
  } finally {
    splitDownloadLoadingMap.value = {
      ...splitDownloadLoadingMap.value,
      [key]: false
    }
  }
}

function resolveMergedPlanId(mergeResult) {
  if (typeof mergeResult === 'string' || typeof mergeResult === 'number') {
    return String(mergeResult)
  }
  return (
    mergeResult?.id ||
    mergeResult?.planId ||
    mergeResult?.reportId ||
    mergeResult?.data ||
    mergeResult?.data?.id ||
    mergeResult?.data?.planId ||
    mergeResult?.data?.reportId ||
    ''
  )
}

function handleCardReleased(payload = []) {
  const ids = Array.isArray(payload) ? payload : (payload?.ids || [])
  const mergeType = Array.isArray(payload) ? 0 : Number(payload?.mergeType || 0)
  const parentPlanId = (!Array.isArray(payload) && mergeType === 2)
    ? String(payload?.parentPlanId || '').trim()
    : ''
  const removedIds = new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '')).filter(Boolean))

  if (mergeType === 2 && parentPlanId) {
    for (const item of localPlans.value) {
      const itemParentPlanId = String(item?.plan?.parentPlanId ?? item?.parentPlanId ?? item?.raw?.parentPlanId ?? '').trim()
      if (itemParentPlanId !== parentPlanId) continue
      getItemCandidateIds(item).forEach(id => removedIds.add(String(id || '')))
    }
    Object.keys(remoteListMap.value).forEach((key) => {
      ;(remoteListMap.value[key] || []).forEach((item) => {
        const itemParentPlanId = String(item?.plan?.parentPlanId ?? item?.parentPlanId ?? item?.raw?.parentPlanId ?? '').trim()
        if (itemParentPlanId !== parentPlanId) return
        getItemCandidateIds(item).forEach(id => removedIds.add(String(id || '')))
      })
    })
  }

  if (!removedIds.size) return

  localPlans.value = localPlans.value.filter(item => !removedIds.has(String(getPlanUniqueId(item) || '')))
  Object.keys(remoteListMap.value).forEach((key) => {
    remoteListMap.value[key] = (remoteListMap.value[key] || []).filter(
      item => !removedIds.has(String(getPlanUniqueId(item) || ''))
    )
  })

  mergeSelectedIds.value = mergeSelectedIds.value.filter(id => !removedIds.has(String(id || '')))
}

const userNameText = computed(() => {
  const user = authStore.user || {}
  return user.realName || user.userName || user.username || '-'
})

const userIdText = computed(() => {
  const user = authStore.user || {}
  return user.userId || user.id || '-'
})

const userEmailText = computed(() => {
  const user = authStore.user || {}
  return user.email || '-'
})

// 合并验货
async function handleMergeInspection() {
  hideActionMenu()
  if (statusKey.value !== 'planned') return
  await openInspectTypeSelector()
}

function isMergeChecked(item) {
  return mergeSelectedIds.value.includes(getPlanUniqueId(item))
}

function getItemMergeBasisKey(item) {
  return `${getItemFactoryNo(item)}||${getItemGoodsClass(item)}||${getItemInspectType(item)}`
}

function getGroupTargetItems(group) {
  const items = Array.isArray(group?.items) ? group.items : []
  if (!items.length) return []
  if (!mergeSelectedIds.value.length) {
    const eligible = items.filter(isBaseMergeEligible)
    if (!eligible.length) return []
    const bucket = new Map()
    for (const item of eligible) {
      const key = getItemMergeBasisKey(item)
      if (!bucket.has(key)) bucket.set(key, [])
      bucket.get(key).push(item)
    }
    let best = []
    for (const arr of bucket.values()) {
      if (arr.length > best.length) best = arr
    }
    return best
  }
  return items.filter(isMergeSelectable)
}

function canGroupSelectAll(group) {
  return getGroupTargetItems(group).length > 0
}

function isGroupAllSelected(group) {
  const targetIds = getGroupTargetItems(group)
    .map(getPlanUniqueId)
    .filter(Boolean)
    .map(id => String(id))
  if (!targetIds.length) return false
  const selectedSet = new Set(mergeSelectedIds.value.map(id => String(id)))
  return targetIds.every(id => selectedSet.has(id))
}

function toggleGroupSelectAll(group) {
  if (!isMergeMode.value) return
  const targetItems = getGroupTargetItems(group)
  if (!targetItems.length) {
    globalThis.showToast(t('该组暂无可选任务'))
    return
  }
  const targetIdSet = new Set(
    targetItems
      .map(getPlanUniqueId)
      .filter(Boolean)
      .map(id => String(id))
  )

  if (isGroupAllSelected(group)) {
    mergeSelectedIds.value = mergeSelectedIds.value.filter(id => !targetIdSet.has(String(id)))
    return
  }

  const selectedSet = new Set(mergeSelectedIds.value.map(id => String(id)))
  const append = []
  for (const item of targetItems) {
    const id = getPlanUniqueId(item)
    if (!id) continue
    const key = String(id)
    if (selectedSet.has(key)) continue
    append.push(id)
    selectedSet.add(key)
  }
  mergeSelectedIds.value.push(...append)
}

function handleGroupSelectAllChange(group) {
  toggleGroupSelectAll(group)
}

function getItemClientOrderNo(item) {
  return item?.plan?.clientOrderNo || item?.clientOrderNo || item?.plan?.domeNo || item?.domeNo || item?.planNo || '未分组'
}

function getItemSubGoodsBatch(item) {
  const subGoodsNo = item?.plan?.subGoodsNo || item?.subGoodsNo || '-'
  const batchNo = item?.plan?.batchNo || item?.batchNo || '-'
  return `${subGoodsNo}#${batchNo}`
}

function getItemGoodsName(item) {
  return item?.plan?.goodsName || item?.goodsName || item?.productName || '-'
}

function getItemInspectType(item) {
  return String(item?.plan?.inspectType ?? item?.inspectType ?? item?.raw?.inspectType ?? '').trim()
}

function getItemFactoryNo(item) {
  return String(item?.plan?.factoryNo ?? item?.factoryNo ?? item?.raw?.factoryNo ?? '').trim()
}

function getItemGoodsClass(item) {
  return String(item?.plan?.goodsClass ?? item?.goodsClass ?? item?.raw?.goodsClass ?? '').trim()
}

function getItemMergeType(item) {
  return Number(item?.plan?.mergeType ?? item?.mergeType ?? item?.raw?.mergeType ?? 0)
}

function getItemParentPlanId(item) {
  if (getItemMergeType(item) !== 2) return ''
  return String(item?.plan?.parentPlanId ?? item?.parentPlanId ?? item?.raw?.parentPlanId ?? '').trim()
}

function isSplitAvailable(item) {
  const lockFlag = Number(item?.plan?.lockFlag ?? item?.lockFlag ?? 0)
  const status = normalizePlanStatus(item)
  const mergeType = getItemMergeType(item)
  return mergeType === 2 && lockFlag === 0 && status === 0
}

function getItemCandidateIds(item) {
  return [
    item?.id,
    item?.plan?.id,
    item?.planId,
    item?.plan?.planId,
    item?.reportId,
    item?.plan?.reportId
  ].filter(id => id !== undefined && id !== null && id !== '')
    .map(id => String(id))
}

function isItemInSourceIds(item, sourceIdSet) {
  return getItemCandidateIds(item).some(id => sourceIdSet.has(id))
}

function markMergedTypeForSourceItems(sourcePlanIds = [], mergedPlanId = '') {
  const sourceIdSet = new Set((sourcePlanIds || []).map(id => String(id)))
  const normalizedMergedPlanId = mergedPlanId ? String(mergedPlanId) : ''
  const markItem = (item) => {
    if (!isItemInSourceIds(item, sourceIdSet)) return item
    return {
      ...item,
      mergeType: 2,
      parentPlanId: normalizedMergedPlanId || item?.parentPlanId,
      plan: {
        ...(item?.plan || {}),
        mergeType: 2,
        parentPlanId: normalizedMergedPlanId || item?.plan?.parentPlanId
      },
      raw: {
        ...(item?.raw || {}),
        mergeType: 2,
        parentPlanId: normalizedMergedPlanId || item?.raw?.parentPlanId
      }
    }
  }

  localPlans.value = (localPlans.value || []).map(markItem)
  Object.keys(remoteListMap.value).forEach((key) => {
    remoteListMap.value[key] = (remoteListMap.value[key] || []).map(markItem)
  })
}

function isBaseMergeEligible(item) {
  const lockFlag = Number(item?.plan?.lockFlag ?? item?.lockFlag ?? 0)
  const status = normalizePlanStatus(item)
  const mergeType = getItemMergeType(item)
  const inspectType = getItemInspectType(item)
  return (
    lockFlag === 0 &&
    status === 0 &&
    mergeType !== 2 &&
    !!mergeInspectType.value &&
    inspectType === mergeInspectType.value
  )
}

function getMergeAnchorItem() {
  if (!mergeSelectedIds.value.length) return null
  const anchorId = mergeSelectedIds.value[0]
  return filtered.value.find(item => getPlanUniqueId(item) === anchorId) || null
}

function isMergeSelectable(item) {
  const itemId = getPlanUniqueId(item)
  if (!itemId) return false
  if (mergeSelectedIds.value.includes(itemId)) return true
  if (!isBaseMergeEligible(item)) return false

  const anchorItem = getMergeAnchorItem()
  if (!anchorItem) return true

  return (
    getItemFactoryNo(item) === getItemFactoryNo(anchorItem) &&
    getItemGoodsClass(item) === getItemGoodsClass(anchorItem) &&
    getItemInspectType(item) === getItemInspectType(anchorItem)
  )
}

async function loadInspectTypeOptions() {
  inspectTypeLoading.value = true
  try {
    const options = await getInspectTypeDict()
    inspectTypeOptions.value = Array.isArray(options) ? options : []
  } catch (error) {
    console.warn('加载验货类型失败，尝试使用列表数据兜底:', error)
    const fallback = Array.from(new Set(filtered.value.map(item => getItemInspectType(item)).filter(Boolean)))
      .map((label, index) => ({ value: label, label, sortOrder: index + 1 }))
    inspectTypeOptions.value = fallback
  } finally {
    inspectTypeLoading.value = false
  }

  if (inspectTypeOptions.value.length > 0) {
    selectedInspectType.value = inspectTypeOptions.value[inspectTypeOptions.value.length - 1].value
  } else {
    selectedInspectType.value = ''
  }
}

async function openInspectTypeSelector() {
  showInspectTypeModal.value = true
  await loadInspectTypeOptions()
}

function closeInspectTypeSelector() {
  showInspectTypeModal.value = false
}

function proceedMergeWithInspectType() {
  if (!selectedInspectType.value) {
    globalThis.showToast(t('请先选择验货类型'))
    return
  }
  mergeInspectType.value = selectedInspectType.value
  closeInspectTypeSelector()
  isMergeMode.value = true
  mergeSelectedIds.value = []
}

function toggleMergeSelect(item) {
  const itemId = getPlanUniqueId(item)
  if (!itemId) {
    globalThis.showToast(t('计划ID缺失，无法选择'))
    return
  }

  const idx = mergeSelectedIds.value.indexOf(itemId)
  if (idx >= 0) {
    mergeSelectedIds.value.splice(idx, 1)
    return
  }

  if (!isBaseMergeEligible(item)) {
    globalThis.showToast(t('仅支持未下载(lockFlag=0)、已定计划(status=0)、且 mergeType!=2 的当前验货类型任务'))
    return
  }

  const anchorItem = getMergeAnchorItem()
  if (
    anchorItem &&
    (
      getItemFactoryNo(item) !== getItemFactoryNo(anchorItem) ||
      getItemGoodsClass(item) !== getItemGoodsClass(anchorItem) ||
      getItemInspectType(item) !== getItemInspectType(anchorItem)
    )
  ) {
    globalThis.showToast(t('仅支持与首选任务同供应商(factoryNo)、同品类(goodsClass)、同验货类型(inspectType)的任务合并'))
    return
  }

  mergeSelectedIds.value.push(itemId)
}

function exitMergeMode() {
  isMergeMode.value = false
  mergeSelectedIds.value = []
  showMergeConfirmModal.value = false
  mergePreviewSnapshot.value = []
  mergeConfirmed.value = false
  mergedDownloadPlanId.value = ''
  mergeInspectType.value = ''
}

function buildMergePayload() {
  if (mergeSelectedIds.value.length < 2) {
    globalThis.showToast(t('请至少选择两条验货任务进行合并'))
    return null
  }

  const selectedItems = filtered.value.filter(item => mergeSelectedIds.value.includes(getPlanUniqueId(item)))
  if (selectedItems.length < 2) {
    globalThis.showToast(t('选中的任务不足两条，无法合并'))
    return null
  }
  const allMergeAllowed = selectedItems.every(item => isBaseMergeEligible(item))
  const anchorItem = selectedItems[0]
  const sameMergeBasis = selectedItems.every(item => (
    getItemFactoryNo(item) === getItemFactoryNo(anchorItem) &&
    getItemGoodsClass(item) === getItemGoodsClass(anchorItem) &&
    getItemInspectType(item) === getItemInspectType(anchorItem)
  ))

  if (!allMergeAllowed) {
    globalThis.showToast(t('存在不满足合并条件的任务（需 lockFlag=0、status=0、mergeType!=2 且验货类型一致）'))
    return null
  }
  if (!sameMergeBasis) {
    globalThis.showToast(t('合并项必须与首选任务保持同供应商(factoryNo)、同品类(goodsClass)、同验货类型(inspectType)'))
    return null
  }

  const sourcePlanIds = Array.from(new Set(
    selectedItems
      .map(item => item?.id)
      .filter(id => id !== undefined && id !== null && id !== '')
  ))

  if (sourcePlanIds.length < 2) {
    globalThis.showToast(t('选中的任务计划ID无效，无法合并'))
    return null
  }

  return { selectedItems, sourcePlanIds }
}

async function confirmMergeInspection() {
  const payload = buildMergePayload()
  if (!payload) return
  const { sourcePlanIds } = payload

  mergeSubmitting.value = true
  try {
    const mergeResult = await mergePlans(sourcePlanIds)
    mergedDownloadPlanId.value = String(resolveMergedPlanId(mergeResult) || '')
    markMergedTypeForSourceItems(sourcePlanIds, mergedDownloadPlanId.value)
    mergeConfirmed.value = true
    showMergeReadyNotice.value = true
    await loadLocalPlans()
    globalThis.showToast(t('合并验货成功，请点击“下载验货”'))
  } catch (error) {
    console.error('合并验货失败:', error)
    globalThis.showToast(error.message || t('合并验货失败'))
  } finally {
    mergeSubmitting.value = false
  }
}

async function downloadMergedInspection() {
  if (!mergedDownloadPlanId.value) {
    globalThis.showToast(t('缺少合并后计划ID，无法下载验货'))
    return
  }
  if (!mergeDownloadTemplateId.value) {
    globalThis.showToast(t('请选择清单'))
    openMergeChecklistPicker()
    return
  }
  mergeSubmitting.value = true
  try {
    const templateId = mergeDownloadTemplateId.value
    const templateName = mergeDownloadTemplateName.value
    const result = await downloadPlan(mergedDownloadPlanId.value, { templateId, templateName })
    const localRecords = splitDownloadDataToLocalPlans(result)
    if (!localRecords.length) {
      throw new Error(t('下载数据为空，无法保存到本地'))
    }

    for (const record of localRecords) {
      await savePlanToLocal(record)
    }

    await loadLocalPlans()
    showMergeReadyNotice.value = false
    globalThis.showToast(t('下载验货成功'))
    closeMergeConfirmModal()
  } catch (error) {
    console.error('下载验货失败:', error)
    globalThis.showToast(error.message || t('下载验货失败'))
  } finally {
    mergeSubmitting.value = false
  }
}

function handleMergeConfirmPrimaryAction() {
  if (mergeConfirmed.value) {
    downloadMergedInspection()
    return
  }
  confirmMergeInspection()
}

function openMergeChecklistPicker() {
  if (!mergeConfirmed.value) return
  if (mergeSubmitting.value) return
  mergeChecklistPickerVisible.value = true
}

function handleMergeChecklistConfirm(option) {
  mergeDownloadTemplateId.value = String(option?.id || '').trim()
  mergeDownloadTemplateName.value = String(option?.name || '').trim()
}

// 扫码搜索
function handleScanSearch() {
  hideActionMenu()
  // 跳转到搜索页面并自动打开扫码
  uni.navigateTo({
    url: '/pages/report/search?autoScan=1'
  })
}

// 跳转搜索（开始验货）
function goSearch() {
  hideActionMenu()
  uni.navigateTo({
    url: '/pages/report/search'
  })
}

// 创建快速验货
function handleQuickInspection() {
  hideActionMenu()
  globalThis.showToast(t('创建快速验货功能待实现'))
}

function isMergedReport(item) {
  const mergeType = item?.plan?.mergeType ?? item?.mergeType ?? item?.raw?.mergeType
  return Number(mergeType) === 2
}

// 初始化
onMounted(async () => {
  await loadLocalPlans()
  const pendingPlans = (await getLocalPlans()).filter(isPlanPendingSync)
  if (pendingPlans.length > 0) {
    await syncData({ silent: true })
  }
})

onActivated(async () => {
  closeUserDrawer()
  await loadLocalPlans()
  if (statusKey.value !== 'planned') {
    closeInspectTypeSelector()
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  background: #f4f6f8;
  padding-bottom: 160rpx;
}

.header {
  background: #03ae4f;
  color: #fff;
  padding: 20rpx 36rpx 0;
  position: sticky;
  top: 0;
  z-index: 20;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 96rpx;
}

.title {
  font-size: 40rpx;
  font-weight: 600;
}

.icon {
  font-size: 48rpx;
  width: 80rpx;
  text-align: center;
  cursor: pointer;
  transition: transform 0.3s;
}

.icon-cloud {
  color: #fff;
}

.icon:hover {
  transform: scale(1.1);
}

.icon.syncing {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-tabs {
  display: flex;
  margin-top: 16rpx;
}

.merge-ready-notice {
  margin-top: 16rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 26rpx;
  line-height: 1.4;
}

.status-tab {
  flex: 1;
  text-align: center;
  padding: 20rpx 0 16rpx;
  opacity: 0.9;
  border-bottom: 6rpx solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  font-size: 26rpx;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.status-tab.active {
  border-bottom-color: #fff;
  opacity: 1;
}

.tab-icon {
  font-size: 36rpx;
}

.tab-badge {
  position: absolute;
  top: 8rpx;
  right: 20rpx;
  min-width: 36rpx;
  height: 36rpx;
  line-height: 36rpx;
  background: #ff4444;
  color: white;
  font-size: 22rpx;
  border-radius: 18rpx;
  padding: 0 10rpx;
}

.content {
  padding: 30rpx;
}

.merge-mode-content {
  padding-bottom: 192rpx;
}

.loading {
  text-align: center;
  padding: 80rpx 40rpx;
  color: #666;
  font-size: 28rpx;
}

.loading-icon {
  display: block;
  font-size: 64rpx;
  margin-bottom: 20rpx;
  animation: spin 1s linear infinite;
}

.tip-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 60rpx 40rpx;
  text-align: center;
  border: 2rpx solid #efefef;
  margin-top: 24rpx;
}

.tip-title {
  font-size: 36rpx;
  color: #222;
  display: block;
  font-weight: 600;
  margin-bottom: 16rpx;
}

.tip-sub {
  font-size: 28rpx;
  color: #8c9199;
  display: block;
}

/* 新的列表项样式 */
.plan-group {
  margin-bottom: 24rpx;
  border: 2rpx solid #f5f5f5;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.order-header {
  padding: 12rpx 12rpx 12rpx 24rpx;
  background: #f5f5f5;
  border-radius: 16rpx 16rpx 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.order-no {
  font-size: 36rpx;
  font-weight: 600;
  color: #0f172a;
}

.group-select-all {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.group-select-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.supplier-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding:12rpx 24rpx;
  /* padding: 24rpx 40rpx; */
  /* background: #fff; */
}

.supplier-name {
  font-size: 24rpx;
  color: #64748b;
}

.order-date {
  font-size: 24rpx;
  color: #94a3b8;
}

.inspection-card {
  background: #fff;
  border-radius: 0 0 24rpx 24rpx;
  padding: 24rpx;
  display: flex;
  gap: 24rpx;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  position: relative;
  min-height: 160rpx;
}

.merge-check-wrapper {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
}

.merge-checkbox {
  appearance: none;
  width: 36rpx;
  height: 36rpx;
  border: 4rpx solid #94a3b8;
  border-radius: 8rpx;
  background: #fff;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}

.merge-checkbox:checked {
  background: #16a34a;
  border-color: #16a34a;
}

.merge-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 8rpx;
  top: 0;
  width: 10rpx;
  height: 20rpx;
  border: solid #fff;
  border-width: 0 4rpx 4rpx 0;
  transform: rotate(45deg);
}

.merge-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  background: #f1f5f9;
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
  background: #94a3b8; /* 默认未下载为灰色 */
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.2);
  z-index: 1;
}

.download-icon-wrapper.is-downloaded {
  background: #10b455; /* 已下载为绿色 */
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
  gap: 16rpx;
  padding-right: 16rpx;
}

.product-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding-right: 172rpx;
  min-height: 84rpx;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex-wrap: wrap;
}

.status-badge {
  background: #dbeafe;
  color: #1e40af;
  font-size: 22rpx;
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
  font-weight: 600;
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
  top: 30rpx;
  right: 40rpx;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.card-more-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 16rpx;
  transition: background 0.2s;
}

.card-more-btn:active {
  background: #f1f5f9;
}

.merge-flag {
  min-width: 44rpx;
  height: 44rpx;
  border-radius: 1998rpx;
  background: #dcfce7;
  color: #15803d;
  font-size: 24rpx;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #bbf7d0;
}

.pagination-bar {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.pagination-info {
  font-size: 26rpx;
  color: #64748b;
  text-align: center;
}

.pagination-actions {
  width: 100%;
  display: flex;
  gap: 16rpx;
}

.no-more-text {
  font-size: 26rpx;
  color: #94a3b8;
  text-align: center;
  padding: 16rpx 0;
}

.load-more-btn {
  width: 100%;
  background: #fff;
  border: 2rpx solid #e5e7eb;
  color: #14a44d;
  border-radius: 20rpx;
  height: 96rpx;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.page-nav-btn {
  flex: 1;
  background: #fff;
  border: 2rpx solid #e5e7eb;
  color: #14a44d;
  border-radius: 20rpx;
  height: 96rpx;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.page-nav-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #14a44d;
}

.page-nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.load-more-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #14a44d;
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fab {
  position: fixed;
  right: 40rpx;
  bottom: 80rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #05b552;
  color: #fff;
  font-size: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 32rpx rgba(5, 181, 82, 0.32);
  cursor: pointer;
  transition: all 0.3s;
  z-index: 1200;
}

.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 24rpx 48rpx rgba(5, 181, 82, 0.4);
}

.user-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  justify-content: flex-start;
}

.user-drawer {
  width: min(82vw, 640rpx);
  height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: 12rpx 0 48rpx rgba(15, 23, 42, 0.16);
  animation: slideInLeft 0.22s ease-out;
}

@keyframes slideInLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.user-drawer-header {
  padding: 40rpx 32rpx 28rpx;
  border-bottom: 2rpx solid #e5e7eb;
}

.user-drawer-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #111827;
}

.user-info-list {
  padding: 20rpx 32rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.user-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 2rpx solid #f1f5f9;
}

.user-info-label {
  font-size: 26rpx;
  color: #64748b;
}

.user-info-value {
  font-size: 28rpx;
  color: #111827;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.user-drawer-footer {
  margin-top: auto;
  padding: 28rpx 32rpx calc(28rpx + env(safe-area-inset-bottom, 0));
  border-top: 2rpx solid #e5e7eb;
}

.user-lang-row {
  margin-bottom: 20rpx;
}

.user-lang-label {
  display: block;
  font-size: 26rpx;
  color: #64748b;
  margin-bottom: 14rpx;
}

.user-lang-options {
  display: flex;
  gap: 12rpx;
}

.user-lang-option {
  flex: 1;
  height: 64rpx;
  border-radius: 16rpx;
  border: 2rpx solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 700;
  color: #334155;
  text-transform: lowercase;
}

.user-lang-option.active {
  border-color: #22c55e;
  background: #ecfdf5;
  color: #16a34a;
}

.user-invite-btn {
  width: 100%;
  height: 84rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #22c55e;
  border-radius: 20rpx;
  background: #f0fdf4;
  color: #16a34a;
  font-size: 28rpx;
  font-weight: 600;
  cursor: pointer;
}

.user-debug-btn {
  width: 100%;
  height: 84rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #6366f1;
  border-radius: 20rpx;
  background: #eef2ff;
  color: #4338ca;
  font-size: 28rpx;
  font-weight: 600;
  cursor: pointer;
}

.user-clear-cache-btn {
  width: 100%;
  height: 84rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #f59e0b;
  border-radius: 20rpx;
  background: #fffbeb;
  color: #b45309;
  font-size: 28rpx;
  font-weight: 600;
  cursor: pointer;
}

.user-clear-cache-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.user-logout-btn {
  width: 100%;
  height: 88rpx;
  border: none;
  border-radius: 20rpx;
  background: #ef4444;
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
}

.user-logout-btn:active {
  opacity: 0.9;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1400;
  display: flex;
  align-items: flex-end;
  animation: fadeIn 0.2s;
}

.invite-fallback-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 32rpx;
}

.invite-fallback-modal {
  width: 100%;
  background: #fff;
  border-radius: 24rpx;
  padding: 32rpx 28rpx 28rpx;
}

.invite-fallback-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #111827;
}

.invite-fallback-desc {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #64748b;
}

.invite-fallback-link {
  margin-top: 20rpx;
  padding: 18rpx;
  border-radius: 16rpx;
  border: 2rpx solid #dbe4f0;
  background: #f8fbff;
  font-size: 24rpx;
  color: #334155;
  line-height: 1.5;
  word-break: break-all;
}

.invite-fallback-actions {
  margin-top: 24rpx;
  display: flex;
  gap: 18rpx;
}

.invite-fallback-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 18rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.invite-fallback-btn.copy {
  border: none;
  background: #03ae4f;
  color: #fff;
}

.invite-fallback-btn.close {
  border: 2rpx solid #d1d5db;
  background: #fff;
  color: #334155;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.action-menu {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 16rpx 0;
  animation: slideUp 0.3s;
}

.inspect-type-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 36rpx 32rpx 32rpx;
  animation: slideUp 0.3s;
}

.inspect-type-title {
  font-size: 48rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 28rpx;
}

.inspect-type-loading {
  text-align: center;
  color: #64748b;
  font-size: 28rpx;
  padding: 64rpx 0;
}

.inspect-type-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20rpx;
  margin-bottom: 36rpx;
}

.inspect-type-chip {
  height: 112rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 20rpx;
  background: #f8fafc;
  color: #9ca3af;
  font-size: 28rpx;
  font-weight: 700;
  cursor: pointer;
}

.inspect-type-chip.active {
  background: #eaf4ff;
  border-color: #bfdbfe;
  color: #3b82f6;
}

.inspect-type-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: #94a3b8;
  font-size: 28rpx;
  padding: 40rpx 0;
}

.inspect-type-actions {
  display: flex;
  gap: 24rpx;
}

.inspect-type-btn {
  height: 88rpx;
  border-radius: 20rpx;
  font-size: 32rpx;
  font-weight: 700;
  cursor: pointer;
}

.inspect-type-btn.cancel {
  width: 200rpx;
  border: 2rpx solid #e5e7eb;
  background: #fff;
  color: #111827;
}

.inspect-type-btn.next {
  flex: 1;
  border: none;
  background: #03ae4f;
  color: #fff;
}

.inspect-type-btn.next:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
.merge-confirm-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx;
  animation: slideUp 0.3s;
  max-height: 80vh;
  overflow-y: auto;
}

.merge-confirm-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 24rpx;
}

.split-sub-title {
  font-size: 28rpx;
  color: #334155;
  margin-bottom: 20rpx;
}

.merge-confirm-table-wrap {
  border: 2rpx solid #e5e7eb;
  border-radius: 20rpx;
  overflow: hidden;
}

.merge-confirm-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.merge-confirm-table th,
.merge-confirm-table td {
  border-bottom: 2rpx solid #f1f5f9;
  padding: 20rpx 16rpx;
  font-size: 26rpx;
  color: #334155;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}

.merge-confirm-table th {
  background: #f8fafc;
  font-weight: 700;
  color: #0f172a;
}

.merge-confirm-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 28rpx;
}

.merge-confirm-loading {
  margin-top: 20rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  color: #64748b;
  font-size: 26rpx;
}
.merge-confirm-tip {
  margin-top: 20rpx;
  color: #0f766e;
  background: #ecfeff;
  border: 2rpx solid #99f6e4;
  border-radius: 16rpx;
  font-size: 26rpx;
  padding: 16rpx 20rpx;
}

.merge-checklist-row {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  cursor: pointer;
  background: #fff;
}

.merge-checklist-label {
  color: #0f172a;
  font-size: 26rpx;
  font-weight: 600;
}

.merge-checklist-value {
  color: #64748b;
  font-size: 26rpx;
  max-width: 60%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-dot {
  width: 28rpx;
  height: 28rpx;
  border-radius: 1998rpx;
  border: 4rpx solid #cbd5e1;
  border-top-color: #03ae4f;
  animation: spin 0.8s linear infinite;
}

.merge-confirm-btn {
  height: 88rpx;
  border-radius: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
}

.merge-confirm-btn.close {
  width: 200rpx;
  border: 2rpx solid #e5e7eb;
  background: #fff;
  color: #334155;
}

.merge-confirm-btn.close.full {
  width: 100%;
}

.merge-confirm-btn.submit {
  flex: 1;
  border: none;
  background: #03ae4f;
  color: #fff;
}

.merge-confirm-btn.submit:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.split-result-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.split-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 24rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 20rpx;
  background: #fff;
}

.split-result-main {
  flex: 1;
  min-width: 0;
}

.split-result-name {
  font-size: 32rpx;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 8rpx;
}

.split-result-order,
.split-result-no,
.split-result-type {
  font-size: 26rpx;
  color: #64748b;
  line-height: 1.5;
  word-break: break-word;
}

.split-download-btn {
  width: 144rpx;
  height: 80rpx;
  border: none;
  border-radius: 16rpx;
  background: #0b4a6f;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  cursor: pointer;
}

.split-download-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 32rpx 40rpx;
  cursor: pointer;
  transition: background 0.2s;
  gap: 30rpx;
}

.menu-item:hover {
  background: #f5f5f5;
}

.menu-item:active {
  background: #e5e5e5;
}

.menu-header {
  padding: 32rpx 40rpx;
  text-align: center;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  border-bottom: 2rpx solid #f0f0f0;
}

.menu-icon {
  font-size: 40rpx;
  width: 56rpx;
  text-align: center;
  color: #333;
}

.menu-icon-uni {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.menu-text {
  font-size: 32rpx;
  color: #333;
  flex: 1;
}

.menu-cancel {
  margin-top: 16rpx;
  padding: 32rpx;
  text-align: center;
  font-size: 32rpx;
  color: #666;
  background: #f9f9f9;
  cursor: pointer;
  border-top: 2rpx solid #e5e5e5;
}

.menu-cancel:hover {
  background: #f0f0f0;
}

.confirm-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  animation: slideUp 0.3s;
  overflow: hidden;
}

.confirm-title {
  padding: 40rpx;
  font-size: 80rpx;
  font-weight: 700;
  color: #111827;
  border-bottom: 2rpx solid #f1f5f9;
}

.confirm-content {
  padding: 56rpx 40rpx 68rpx;
  font-size: 44rpx;
  line-height: 1.5;
  color: #111827;
}

.confirm-actions {
  display: flex;
  gap: 24rpx;
  padding: 0 40rpx 40rpx;
}

.confirm-btn {
  height: 104rpx;
  border-radius: 24rpx;
  border: none;
  font-size: 40rpx;
  font-weight: 700;
  cursor: pointer;
}

.confirm-btn.cancel {
  width: 320rpx;
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
  padding: 32rpx;
  animation: slideUp 0.3s;
  max-height: 85vh;
  overflow-y: auto;
}

.copy-modal-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
  margin-bottom: 24rpx;
}

.copy-info-card {
  background: #fff;
  border: 2rpx solid #e5e7eb;
  border-radius: 24rpx;
  padding: 16rpx 24rpx;
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

.merge-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-top: 2rpx solid #e5e7eb;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom, 0));
  display: flex;
  gap: 20rpx;
  z-index: 1100;
}

.merge-action-btn {
  height: 88rpx;
  border-radius: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
}

.merge-action-btn.cancel {
  width: 200rpx;
  border: 2rpx solid #e5e7eb;
  background: #fff;
  color: #334155;
}

.merge-action-btn.confirm {
  flex: 1;
  border: none;
  background: #03ae4f;
  color: #fff;
}

.merge-action-btn.confirm:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
</style>
