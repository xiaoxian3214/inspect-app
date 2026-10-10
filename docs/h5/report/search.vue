<template>
  <view class="page">
    <view class="sticky-top-area">
      <view class="header">
        <text class="back-btn" @click="goBack">←</text>
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          confirm-type="search"
          :placeholder="t('请输入单号，货号或扫描条码')"
          placeholder-class="search-input-placeholder"
          @confirm="doSearch"
        />
        <text class="scan-icon" @click="scanBarcode">
          <text class="scan-frame">
            <text class="scan-corner tl"></text>
            <text class="scan-corner tr"></text>
            <text class="scan-corner bl"></text>
            <text class="scan-corner br"></text>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="2" height="16" fill="currentColor" />
              <rect x="7" y="4" width="1" height="16" fill="currentColor" />
              <rect x="10" y="4" width="2" height="16" fill="currentColor" />
              <rect x="14" y="4" width="1" height="16" fill="currentColor" />
              <rect x="17" y="4" width="2" height="16" fill="currentColor" />
              <rect x="21" y="4" width="1" height="16" fill="currentColor" />
            </svg>
          </text>
        </text>
      </view>

      <view class="search-button-container">
        <AppButton
          class="search-btn"
          @click="doSearch"
          :disabled="!keyword.trim() || searching"
        >
          {{ searching ? t("搜索中...") : t("搜索") }}
        </AppButton>
      </view>

      <view class="result-toolbar">
        <view class="result-toolbar-left">
          <text class="result-title">{{ t("搜索结果") }}</text>
          <view class="result-divider"></view>
        </view>
        <AppButton class="result-filter-btn" @click="openFilterModal">
          {{ t("筛选") }}
        </AppButton>
      </view>
    </view>

    <view class="content" :class="{ 'merge-mode-content': isMergeMode }">
      <view v-if="searching" class="loading">{{ t("搜索中...") }}</view>

      <view v-else-if="results.length === 0 && hasSearched" class="empty">
        <view class="empty-icon">🔍</view>
        <view class="empty-text">{{ t("未找到相关计划") }}</view>
      </view>

      <view v-else-if="results.length > 0" class="results">
        <view
          v-for="group in groupedResults"
          :key="group.groupKey"
          class="plan-group"
        >
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
            :key="
              item?.plan?.planId || item?.plan?.id || item.planId || item.id
            "
          >
            <PlanListItemCard
              :item="item"
              :current-user-id="getCurrentUserId()"
              :is-merged="isMergedReport(item)"
              :status-key="getStatusKey(item)"
              :show-merge-checkbox="isMergeMode"
              :merge-checked="isMergeChecked(item)"
              :merge-disabled="!isMergeSelectable(item)"
              :manage-actions-in-card="true"
              :use-internal-actions="true"
              :use-internal-card-click="true"
              :is-merge-mode="isMergeMode"
              :is-local-downloaded="isLocalDownloaded(item)"
              :show-action-split="isSplitAvailable(item)"
              :show-supplier-row="false"
              @request-refresh="handleCardDataChanged"
              @released="handleCardReleased"
              @merge-toggle="toggleMergeSelect"
              @action-split="handleSplitInspection"
            />
          </view>
        </view>
      </view>

      <view v-else class="hints">
        <view class="hint-title">{{ t("搜索提示") }}</view>
        <view class="hint-list">
          <view class="hint-item"
            >• {{ t("输入订单号、合同号、货号") }}</view
          >
          <view class="hint-item">• {{ t("支持模糊匹配") }}</view>
          <view class="hint-item">• {{ t("点击右侧扫码图标可扫描条码") }}</view>
        </view>
      </view>

      <!-- 分页底栏：只通过上一页/下一页切换页码 -->
      <view
        v-if="results.length > 0 && !searching && searchTotal > 0"
        class="search-pagination-bar"
      >
        <view class="pagination-info">
          {{ t("第") }} {{ searchPage }} / {{ totalSearchPages }}
          {{ t("页") }}，{{ t("共") }} {{ searchTotal }} {{ t("条") }}
        </view>
        <template v-if="searchTotal > searchPageSize">
          <view class="pagination-actions">
            <AppButton
              class="page-nav-btn"
              :disabled="loadingMoreResults || searchPage <= 1"
              @click="loadPrevResults"
            >
              {{ t("上一页") }}
            </AppButton>
            <AppButton
              class="page-nav-btn"
              :disabled="loadingMoreResults || searchPage >= totalSearchPages"
              @click="loadNextResults"
            >
              {{ loadingMoreResults ? t("加载中...") : t("下一页") }}
            </AppButton>
          </view>
        </template>
        <template v-else>
          <AppButton class="load-more-btn" :disabled="true">
            {{ t("已全部加载") }}
          </AppButton>
        </template>
      </view>
    </view>
    <view
      v-if="results.length > 0 && !searching && !isMergeMode"
      class="fab"
      @click="showActionMenu"
      >+</view
    >

    <!-- FAB 操作菜单 -->
    <view v-if="showMenu" class="menu-overlay" @click="hideActionMenu">
      <view class="action-menu" @click.stop>
        <view class="menu-item" @click="handleMergeInspection">
          <text class="menu-icon">→</text>
          <text class="menu-text">{{ t("合并验货") }}</text>
        </view>
        <view class="menu-cancel" @click="hideActionMenu">{{ t("取消") }}</view>
      </view>
    </view>

    <!-- 选择验货类型 -->
    <view
      v-if="showInspectTypeModal"
      class="menu-overlay"
      @click="closeInspectTypeSelector"
    >
      <view class="inspect-type-modal" @click.stop>
        <view class="inspect-type-title">{{
          t("选择一个验货类型进行合并")
        }}</view>
        <view v-if="inspectTypeLoading" class="inspect-type-loading">{{
          t("加载中...")
        }}</view>
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
          <view
            v-if="inspectTypeOptions.length === 0"
            class="inspect-type-empty"
            >{{ t("暂无可选验货类型") }}</view
          >
        </view>
        <view class="inspect-type-actions">
          <AppButton
            class="inspect-type-btn cancel"
            @click="closeInspectTypeSelector"
            >{{ t("取消") }}</AppButton
          >
          <AppButton
            class="inspect-type-btn next"
            :disabled="!selectedInspectType || inspectTypeLoading"
            @click="proceedMergeWithInspectType"
          >
            {{ t("下一步") }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 合并模式底部操作栏 -->
    <view v-if="isMergeMode" class="merge-action-bar">
      <view v-if="mergeSelectedIds.length > 0" class="merge-selected-hint">
        {{ t("已选") }} {{ mergeSelectedIds.length }} {{ t("项") }}
      </view>
      <view class="merge-action-btns">
        <AppButton class="merge-action-btn cancel" @click="exitMergeMode">{{
          t("取消")
        }}</AppButton>
        <AppButton
          class="merge-action-btn confirm"
          :disabled="mergeSelectedIds.length < 2 || mergeSubmitting"
          @click="openMergeConfirmModal"
        >
          {{
            mergeSubmitting
              ? t("合并中...")
              : `${t("合并验货")}（${mergeSelectedIds.length}）`
          }}
        </AppButton>
      </view>
    </view>

    <!-- 合并前确认弹窗 -->
    <view
      v-if="showMergeConfirmModal"
      class="menu-overlay"
      @click="closeMergeConfirmModal"
    >
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t("确认合并以下验货数据") }}</view>
        <view class="merge-confirm-table-wrap">
          <table class="merge-confirm-table">
            <thead>
              <tr>
                <th>{{ t("单号") }}</th>
                <th>{{ t("款号#批次") }}</th>
                <th>{{ t("产品名称") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in mergePreviewItems"
                :key="getPlanUniqueId(item)"
              >
                <td>{{ getItemClientOrderNo(item) }}</td>
                <td>{{ getItemSubGoodsBatch(item) }}</td>
                <td>{{ getItemGoodsName(item) }}</td>
              </tr>
            </tbody>
          </table>
        </view>
        <view v-if="mergeSubmitting" class="merge-confirm-loading">
          <text class="loading-dot"></text>
          <text>{{ t("处理中，请稍候...") }}</text>
        </view>
        <view
          v-if="mergeConfirmed && !mergeSubmitting"
          class="merge-confirm-tip"
        >
          {{ t("一个新的合并验货已生成，您现在可以下载了") }}
        </view>
        <view
          v-if="mergeConfirmed && !mergeSubmitting"
          class="merge-checklist-row"
          @click="openMergeChecklistPicker"
        >
          <text class="merge-checklist-label">{{ t('清单') }}</text>
          <text class="merge-checklist-value">
            {{ mergeDownloadTemplateName || t('请选择清单') }}
          </text>
        </view>
        <view class="merge-confirm-actions">
          <AppButton
            class="merge-confirm-btn close"
            @click="closeMergeConfirmModal"
            >{{ t("关闭") }}</AppButton
          >
          <AppButton
            class="merge-confirm-btn submit"
            :disabled="mergeSubmitting"
            @click="handleMergeConfirmPrimaryAction"
          >
            {{
              mergeSubmitting
                ? t("处理中...")
                : mergeConfirmed
                  ? t("下载验货")
                  : t("合并")
            }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 拆分确认弹窗 -->
    <view
      v-if="showSplitPreviewModal"
      class="menu-overlay"
      @click="closeSplitPreviewModal"
    >
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t("拆分验货") }}</view>
        <view class="split-sub-title">{{ t("此合并验货包含以下验货：") }}</view>
        <view class="merge-confirm-table-wrap">
          <table class="merge-confirm-table">
            <thead>
              <tr>
                <th>{{ t("单号") }}</th>
                <th>{{ t("款号#批次") }}</th>
                <th>{{ t("产品名称") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in splitPreviewItems"
                :key="getPlanUniqueId(item)"
              >
                <td>{{ getItemClientOrderNo(item) }}</td>
                <td>{{ getItemSubGoodsBatch(item) }}</td>
                <td>{{ getItemGoodsName(item) }}</td>
              </tr>
            </tbody>
          </table>
        </view>
        <view
          v-if="splitSubmitting || splitLoading"
          class="merge-confirm-loading"
        >
          <text class="loading-dot"></text>
          <text>{{ t("处理中，请稍候...") }}</text>
        </view>
        <view class="merge-confirm-actions">
          <AppButton
            class="merge-confirm-btn close"
            @click="closeSplitPreviewModal"
            >{{ t("取消") }}</AppButton
          >
          <AppButton
            class="merge-confirm-btn submit"
            :disabled="splitSubmitting || splitLoading"
            @click="confirmSplitInspection"
          >
            {{ splitSubmitting ? t("拆分中...") : t("拆分") }}
          </AppButton>
        </view>
      </view>
    </view>

    <!-- 拆分结果弹窗 -->
    <view
      v-if="showSplitResultModal"
      class="menu-overlay"
      @click="closeSplitResultModal"
    >
      <view class="merge-confirm-modal" @click.stop>
        <view class="merge-confirm-title">{{ t("拆分验货") }}</view>
        <view class="split-result-list">
          <view
            v-for="item in splitResultItems"
            :key="`${getPlanUniqueId(item)}-split`"
            class="split-result-item"
          >
            <view class="split-result-main">
              <view class="split-result-name">{{
                getItemGoodsName(item)
              }}</view>
              <view class="split-result-order">{{
                getItemClientOrderNo(item)
              }}</view>
              <view class="split-result-no">{{
                getItemSubGoodsBatch(item)
              }}</view>
              <view class="split-result-type">{{
                getItemInspectType(item) || "-"
              }}</view>
            </view>
            <AppButton
              class="split-download-btn"
              :disabled="splitDownloadLoadingMap[getPlanUniqueId(item)]"
              @click="downloadSplitItem(item)"
            >
              {{
                splitDownloadLoadingMap[getPlanUniqueId(item)]
                  ? t("下载中")
                  : t("下载")
              }}
            </AppButton>
          </view>
        </view>
        <view class="merge-confirm-actions">
          <AppButton
            class="merge-confirm-btn close full"
            @click="closeSplitResultModal"
            >{{ t("取消") }}</AppButton
          >
        </view>
      </view>
    </view>

    <Popup
      :show="showFilterModal"
      position="bottom"
      round
      :z-index="250"
      class="filter-popup"
      :style="{ width: '100%' }"
      @click-overlay="closeFilterModal"
    >
      <view class="filter-modal">
        <view class="filter-header">
          <view class="filter-title">{{ t("筛选") }}</view>
          <text class="filter-clear" @click.stop="handleClearFilters">{{ t("清空") }}</text>
        </view>

        <view class="filter-section">
          <text class="filter-section-title">{{ t("状态") }}</text>
          <view class="filter-chip-list">
            <AppButton
              v-for="option in filterStatusOptions"
              :key="option.value"
              class="filter-chip"
              :class="{ active: draftFilters.status === option.value }"
              @click="selectStatus(option.value)"
            >
              {{ option.label }}
            </AppButton>
          </view>
        </view>

        <view class="filter-section">
          <text class="filter-section-title">{{ t("检查类型") }}</text>
          <view class="filter-chip-list">
            <AppButton
              v-for="option in filterInspectTypeOptions"
              :key="option.value"
              class="filter-chip"
              :class="{ active: draftFilters.inspectType === option.value }"
              @click="selectInspectType(option.value)"
            >
              {{ option.label }}
            </AppButton>
          </view>
        </view>

        <!-- <view class="filter-section">
          <text class="filter-section-title">{{ t("验货日期") }}</text>
          <view class="filter-date-row">
            <text class="filter-date-label">{{ t("从") }}</text>
            <picker
              class="filter-date-picker"
              mode="date"
              :value="draftFilters.startDate"
              @change="handleDateStartChange"
            >
              <view class="filter-date-box">
                {{ draftFilters.startDate || t("开始日期") }}
              </view>
            </picker>
            <text class="filter-date-label">{{ t("至") }}</text>
            <picker
              class="filter-date-picker"
              mode="date"
              :value="draftFilters.endDate"
              @change="handleDateEndChange"
            >
              <view class="filter-date-box">
                {{ draftFilters.endDate || t("结束日期") }}
              </view>
            </picker>
          </view>
        </view> -->

        <view class="filter-actions">
          <AppButton class="filter-btn confirm" @click="applyFilters">
            {{ t("查看结果") }}
          </AppButton>
        </view>
      </view>
    </Popup>

    <H5ScannerModal
      :visible="showScanner && isH5Runtime"
      :element-id="scannerElementId"
      :title-text="t('扫描条码')"
      :hint-text="t('将条码对准扫描框')"
      :manual-text="t('手动输入')"
      :show-zoom="showZoomBtn"
      :current-zoom="currentZoom"
      @close="closeScanner"
      @manual-input="manualInput"
      @toggle-zoom="handleToggleZoom"
    />
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
import { computed, ref, onMounted, onUnmounted } from "vue";
import { Popup } from "vant";
import { onLoad } from "@dcloudio/uni-app";
import { safeBack } from "../../utils/navigation.js";
import {
  searchPlans,
  getLocalPlans,
  mergePlans,
  getInspectTypeDict,
  downloadPlan,
  splitDownloadDataToLocalPlans,
  savePlanToLocal,
  splitPlan
} from "../../api/plan.js";
import { useUserStore } from "../../store/user.js";
import { useAuthStore } from "../../store/auth.js";
import PlanListItemCard from "./components/PlanListItemCard.vue";
import ChecklistPickerPopup from "./components/ChecklistPickerPopup.vue";
import H5ScannerModal from "./components/H5ScannerModal.vue";
import { useScanner } from "./composables/useScanner.js";
import { useI18n } from "../../utils/i18n.js";
import "vant/lib/popup/style";

const userStore = useUserStore();
const authStore = useAuthStore();
const { t } = useI18n();
const pageQuery = ref({});

const keyword = ref("");
const searching = ref(false);
const loadingMoreResults = ref(false);
const hasSearched = ref(false);
const results = ref([]);
const searchPage = ref(1);
const searchTotal = ref(0);
const searchPageSize = 100;
const totalSearchPages = computed(() => {
  return Math.max(1, Math.ceil((searchTotal.value || 0) / searchPageSize));
});
const showMenu = ref(false);
const showInspectTypeModal = ref(false);
const inspectTypeLoading = ref(false);
const inspectTypeOptions = ref([]);
const selectedInspectType = ref("");
const mergeInspectType = ref("");
const isMergeMode = ref(false);
const mergeSelectedIds = ref([]);
const mergeSelectedItemsById = ref({});
const showMergeConfirmModal = ref(false);
const mergePreviewSnapshot = ref([]);
const mergeConfirmed = ref(false);
const mergedDownloadPlanId = ref("");
const mergeSubmitting = ref(false);
const mergeChecklistPickerVisible = ref(false)
const mergeDownloadTemplateId = ref('')
const mergeDownloadTemplateName = ref('')
const showScanner = ref(false);
const localPlans = ref([]);
const showSplitPreviewModal = ref(false);
const splitPreviewItems = ref([]);
const splitLoading = ref(false);
const splitSubmitting = ref(false);
const splitTargetPlanId = ref("");
const splitTargetParentPlanId = ref("");
const showSplitResultModal = ref(false);
const splitResultItems = ref([]);
const splitDownloadLoadingMap = ref({});
const showFilterModal = ref(false);
const filterInspectTypeLoading = ref(false);
const filterInspectTypeDictOptions = ref([]);

// 缩放相关状态
const showZoomBtn = ref(false);
const currentZoom = ref(1);
const zoomMin = ref(1);
const zoomMax = ref(1);
const zoomStep = ref(0.1);
const activeFilters = ref({
  status: "",
  inspectType: "",
  startDate: "",
  endDate: ""
});
const draftFilters = ref({
  status: "",
  inspectType: "",
  startDate: "",
  endDate: ""
});
const scannerElementId = "search-h5-scanner";
const {
  isH5Platform,
  scanByUni,
  startH5Scanner,
  stopH5Scanner,
  setZoom,
  getCameraCapabilities,
  getH5ScannerErrorMessage
} = useScanner({ t });
const isH5Runtime = isH5Platform();

const filterStatusOptions = computed(() => [
  { value: "planned", label: t("已定计划") },
  { value: "progress", label: t("进行中") },
  { value: "report", label: t("报告") }
]);

const filterInspectTypeOptions = computed(() => {
  if (filterInspectTypeDictOptions.value.length) {
    return filterInspectTypeDictOptions.value;
  }
  const values = Array.from(
    new Set((results.value || []).map((item) => getItemInspectType(item)).filter(Boolean))
  );
  return values.map((value) => ({ value, label: value }));
});

const groupedResults = computed(() => {
  const groups = [];
  const groupMap = new Map();

  for (const item of results.value) {
    const clientOrderNo = getItemClientOrderNo(item);
    if (!groupMap.has(clientOrderNo)) {
      const group = {
        groupKey: clientOrderNo,
        clientOrderNo,
        supplierName: getItemSupplierName(item),
        orderDate: getItemOrderDate(item),
        items: []
      };
      groupMap.set(clientOrderNo, group);
      groups.push(group);
    }
    groupMap.get(clientOrderNo).items.push(item);
  }

  return groups;
});

function getItemSupplierName(item) {
  return (
    item?.plan?.factoryName || item?.supplierName || item?.factoryName || "-"
  );
}

function formatGroupDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekDays = [t("周日"), t("周一"), t("周二"), t("周三"), t("周四"), t("周五"), t("周六")];
  const weekDay = weekDays[date.getDay()];
  return t("{year}年{month}月{day}日 {weekDay}", { year, month, day, weekDay });
}

function getItemOrderDate(item) {
  return formatGroupDate(
    item?.plan?.createDate || item?.createdAt || item?.createDate
  );
}

function buildSearchParams() {
  const params = {
    keyword: keyword.value.trim()
  };

  if (activeFilters.value.inspectType) {
    params.inspectType = activeFilters.value.inspectType;
  }

  if (activeFilters.value.status === "planned") {
    params.status = 0;
  } else if (activeFilters.value.status === "report") {
    params.status = 3;
  } else if (activeFilters.value.status === "progress") {
    params.status = 1;
  }

  if (activeFilters.value.startDate) {
    params.startDate = toFilterIsoDateTime(
      activeFilters.value.startDate,
      "start"
    );
  }
  if (activeFilters.value.endDate) {
    params.endDate = toFilterIsoDateTime(
      activeFilters.value.endDate,
      "end"
    );
  }

  return params;
}

function toFilterIsoDateTime(dateText, boundary = "start") {
  const dateValue = String(dateText || "").trim();
  if (!dateValue) return "";
  const normalized = boundary === "end"
    ? `${dateValue}T23:59:59.999`
    : `${dateValue}T00:00:00.000`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function goBack() {
  safeBack({ fallbackUrl: "/pages/report/list" });
}

async function doSearch() {
  if (!keyword.value.trim()) return;
  hideActionMenu();
  closeInspectTypeSelector();

  searching.value = true;
  hasSearched.value = true;
  searchPage.value = 1;
  searchTotal.value = 0;

  try {
    await loadSearchPage(1);
  } catch (error) {
    console.error("[search] request failed:", error);
    globalThis.showToast(error.message || t("搜索失败"));
  } finally {
    searching.value = false;
  }
}

async function loadSearchPage(page) {
  if (page < 1) return;
  if (loadingMoreResults.value) return;
  loadingMoreResults.value = true;

  try {
    const result = await searchPlans(buildSearchParams(), page, searchPageSize);

    searchTotal.value = result.total || 0;
    results.value = mergeWithLocalPlans(result.records || []);
    searchPage.value = page;
    syncSelectedItemSnapshotsFromCurrentPage();
  } catch (error) {
    console.error("[search] paging failed:", error);
    globalThis.showToast(error.message || t("分页加载失败"));
  } finally {
    loadingMoreResults.value = false;
  }
}

function loadPrevResults() {
  if (searchPage.value <= 1) return;
  loadSearchPage(searchPage.value - 1);
}

function loadNextResults() {
  if (searchPage.value >= totalSearchPages.value) return;
  loadSearchPage(searchPage.value + 1);
}

async function handleCardDataChanged() {
  await loadLocalPlans();
  syncSearchResultsWithLocal();
}

function handleCardReleased(payload = {}) {
  const actionType = payload?.actionType || "";
  if (actionType !== "unlock") return;

  const releasedIdSet = new Set(
    (payload?.ids || []).map((id) => String(id || "")).filter(Boolean)
  );
  if (!releasedIdSet.size) return;

  const unlockItem = (item) => {
    if (!item) return item;
    const matched = getItemCandidateIds(item).some((id) =>
      releasedIdSet.has(String(id || ""))
    );
    if (!matched) return item;
    return {
      ...item,
      lockFlag: 0,
      plan: {
        ...(item?.plan || {}),
        lockFlag: 0
      },
      raw: {
        ...(item?.raw || {}),
        lockFlag: 0
      }
    };
  };

  results.value = (results.value || []).map(unlockItem);
  localPlans.value = (localPlans.value || []).map(unlockItem);
}

function getItemClientOrderNo(item) {
  return (
    item?.plan?.clientOrderNo ||
    item?.clientOrderNo ||
    item?.plan?.domeNo ||
    item?.domeNo ||
    item?.planNo ||
    t("未分组")
  );
}

function getItemSubGoodsBatch(item) {
  const subGoodsNo = item?.plan?.subGoodsNo || item?.subGoodsNo || "-";
  const batchNo = item?.plan?.batchNo || item?.batchNo || "-";
  return `${subGoodsNo}#${batchNo}`;
}

function getItemGoodsName(item) {
  return item?.plan?.goodsName || item?.goodsName || item?.productName || "-";
}

// 返回验货计划 ID（用于本地数据匹配 / SQLite 查找）
function getPlanUniqueId(item) {
  return (
    item?.plan?.id ||
    item?.plan?.planId ||
    item?.planId ||
    item?.id ||
    item?.plan?.reportId ||
    item?.reportId
  );
}

function mergeWithLocalPlans(records = []) {
  const localById = new Map(
    localPlans.value.map((plan) => [getPlanUniqueId(plan), plan])
  );
  return records.map((record) => {
    const matchedLocal = localById.get(getPlanUniqueId(record));
    return matchedLocal || record;
  });
}

function syncSearchResultsWithLocal() {
  results.value = mergeWithLocalPlans(results.value || []);
  syncSelectedItemSnapshotsFromCurrentPage();
  syncMergeSelection();
}

const mergePreviewItems = computed(() => {
  if (mergePreviewSnapshot.value.length > 0) {
    return mergePreviewSnapshot.value;
  }
  const selectedIdSet = new Set(mergeSelectedIds.value);
  return (results.value || []).filter((item) =>
    selectedIdSet.has(getPlanUniqueId(item))
  );
});

async function loadLocalPlans() {
  try {
    localPlans.value = await getLocalPlans();
  } catch (error) {
    console.error("[search] load local plans failed:", error);
    localPlans.value = [];
  }
}

function isLocalDownloaded(item) {
  if (!item) return false;
  const itemId = getPlanUniqueId(item);
  if (!itemId) return false;
  return localPlans.value.some((plan) => getPlanUniqueId(plan) === itemId);
}

function showActionMenu() {
  showMenu.value = true;
}

function hideActionMenu() {
  showMenu.value = false;
}

function resolveTemplateFromPlanItem(item) {
  const source = item && typeof item === 'object' ? item : {}
  const plan = (source.plan && typeof source.plan === 'object') ? source.plan : source
  const id = String(plan?.templateId || source?.templateId || '').trim()
  const name = String(plan?.templateName || source?.templateName || '').trim()
  return { id, name: name || id }
}

function openMergeConfirmModal() {
  const payload = buildMergePayload();
  if (!payload) return;
  mergePreviewSnapshot.value = payload.selectedItems || [];
  mergeConfirmed.value = false;
  mergedDownloadPlanId.value = "";
  mergeChecklistPickerVisible.value = false
  mergeDownloadTemplateId.value = ''
  mergeDownloadTemplateName.value = ''
  const { id, name } = resolveTemplateFromPlanItem(mergePreviewSnapshot.value?.[0])
  if (id) {
    mergeDownloadTemplateId.value = id
    mergeDownloadTemplateName.value = name
  }
  showMergeConfirmModal.value = true;
}

function closeMergeConfirmModal() {
  showMergeConfirmModal.value = false;
  mergeChecklistPickerVisible.value = false
  exitMergeMode();
}

function resolveMergedPlanId(mergeResult) {
  if (typeof mergeResult === "string" || typeof mergeResult === "number") {
    return String(mergeResult);
  }
  return (
    mergeResult?.id ||
    mergeResult?.planId ||
    mergeResult?.reportId ||
    mergeResult?.data ||
    mergeResult?.data?.id ||
    mergeResult?.data?.planId ||
    mergeResult?.data?.reportId ||
    ""
  );
}

async function handleMergeInspection() {
  hideActionMenu();
  if (results.value.length === 0) return;
  await openInspectTypeSelector();
}

function isMergeChecked(item) {
  return mergeSelectedIds.value.includes(getPlanUniqueId(item));
}

function getItemMergeBasisKey(item) {
  return `${getItemFactoryNo(item)}||${getItemGoodsClass(item)}||${getItemInspectType(item)}`;
}

function getGroupTargetItems(group) {
  const items = Array.isArray(group?.items) ? group.items : [];
  if (!items.length) return [];
  if (!mergeSelectedIds.value.length) {
    const eligible = items.filter(isBaseMergeEligible);
    if (!eligible.length) return [];
    const bucket = new Map();
    for (const item of eligible) {
      const key = getItemMergeBasisKey(item);
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(item);
    }
    let best = [];
    for (const arr of bucket.values()) {
      if (arr.length > best.length) best = arr;
    }
    return best;
  }
  return items.filter(isMergeSelectable);
}

function canGroupSelectAll(group) {
  return getGroupTargetItems(group).length > 0;
}

function isGroupAllSelected(group) {
  const targetIds = getGroupTargetItems(group)
    .map(getPlanUniqueId)
    .filter(Boolean)
    .map((id) => String(id));
  if (!targetIds.length) return false;
  const selectedSet = new Set(mergeSelectedIds.value.map((id) => String(id)));
  return targetIds.every((id) => selectedSet.has(id));
}

function toggleGroupSelectAll(group) {
  if (!isMergeMode.value) return;
  const targetItems = getGroupTargetItems(group);
  if (!targetItems.length) {
    globalThis.showToast(t("该组暂无可选任务"));
    return;
  }
  const targetIdSet = new Set(
    targetItems
      .map(getPlanUniqueId)
      .filter(Boolean)
      .map((id) => String(id))
  );

  if (isGroupAllSelected(group)) {
    mergeSelectedIds.value = mergeSelectedIds.value.filter(
      (id) => !targetIdSet.has(String(id))
    );
    const next = { ...(mergeSelectedItemsById.value || {}) };
    targetIdSet.forEach((id) => {
      if (next[id]) delete next[id];
    });
    mergeSelectedItemsById.value = next;
    return;
  }

  const selectedSet = new Set(mergeSelectedIds.value.map((id) => String(id)));
  const append = [];
  const next = { ...(mergeSelectedItemsById.value || {}) };
  for (const item of targetItems) {
    const id = getPlanUniqueId(item);
    if (!id) continue;
    const key = String(id);
    if (selectedSet.has(key)) continue;
    append.push(id);
    selectedSet.add(key);
    next[key] = item;
  }
  mergeSelectedIds.value.push(...append);
  mergeSelectedItemsById.value = next;
  syncMergeSelection();
}

function handleGroupSelectAllChange(group) {
  toggleGroupSelectAll(group);
}

function syncSelectedItemSnapshotsFromCurrentPage() {
  if (!isMergeMode.value || !mergeSelectedIds.value.length) return;
  const selectedIdSet = new Set(mergeSelectedIds.value);
  const next = { ...(mergeSelectedItemsById.value || {}) };
  for (const item of results.value || []) {
    const id = getPlanUniqueId(item);
    if (!id || !selectedIdSet.has(id)) continue;
    next[id] = item;
  }
  mergeSelectedItemsById.value = next;
}

function getItemRawStatus(item) {
  return item?.status ?? item?.plan?.status;
}

function getItemInspectType(item) {
  return String(
    item?.plan?.inspectType ?? item?.inspectType ?? item?.raw?.inspectType ?? ""
  ).trim();
}

function getItemFactoryNo(item) {
  return String(
    item?.plan?.factoryNo ?? item?.factoryNo ?? item?.raw?.factoryNo ?? ""
  ).trim();
}

function getItemGoodsClass(item) {
  return String(
    item?.plan?.goodsClass ?? item?.goodsClass ?? item?.raw?.goodsClass ?? ""
  ).trim();
}

function getItemMergeType(item) {
  return Number(
    item?.plan?.mergeType ?? item?.mergeType ?? item?.raw?.mergeType ?? 0
  );
}

function getItemCandidateIds(item) {
  return [
    item?.id,
    item?.plan?.id,
    item?.planId,
    item?.plan?.planId,
    item?.reportId,
    item?.plan?.reportId
  ]
    .filter((id) => id !== undefined && id !== null && id !== "")
    .map((id) => String(id));
}

function isItemInSourceIds(item, sourceIdSet) {
  return getItemCandidateIds(item).some((id) => sourceIdSet.has(id));
}

function getItemParentPlanId(item) {
  if (getItemMergeType(item) !== 2) return "";
  return String(
    item?.plan?.parentPlanId ??
      item?.parentPlanId ??
      item?.raw?.parentPlanId ??
      ""
  ).trim();
}

function markMergedTypeForSourceItems(sourcePlanIds = [], mergedPlanId = "") {
  const sourceIdSet = new Set((sourcePlanIds || []).map((id) => String(id)));
  const normalizedMergedPlanId = mergedPlanId ? String(mergedPlanId) : "";
  const markItem = (item) => {
    if (!isItemInSourceIds(item, sourceIdSet)) return item;
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
    };
  };

  results.value = (results.value || []).map(markItem);
  localPlans.value = (localPlans.value || []).map(markItem);
}

function isBaseMergeEligible(item) {
  const lockFlag = Number(item?.plan?.lockFlag ?? item?.lockFlag ?? 0);
  const status = normalizeStatus(getItemRawStatus(item));
  const mergeType = getItemMergeType(item);
  const inspectType = getItemInspectType(item);
  return (
    lockFlag === 0 &&
    status === 0 &&
    mergeType !== 2 &&
    !!mergeInspectType.value &&
    inspectType === mergeInspectType.value
  );
}

function getMergeAnchorItem() {
  if (!mergeSelectedIds.value.length) return null;
  const anchorId = mergeSelectedIds.value[0];
  const fromSnapshot = mergeSelectedItemsById.value?.[anchorId];
  if (fromSnapshot) return fromSnapshot;
  return (
    (results.value || []).find((item) => getPlanUniqueId(item) === anchorId) ||
    null
  );
}

function isMergeSelectable(item) {
  const itemId = getPlanUniqueId(item);
  if (!itemId) return false;
  if (mergeSelectedIds.value.includes(itemId)) return true;
  if (!isBaseMergeEligible(item)) return false;

  const anchorItem = getMergeAnchorItem();
  if (!anchorItem) return true;

  return (
    getItemFactoryNo(item) === getItemFactoryNo(anchorItem) &&
    getItemGoodsClass(item) === getItemGoodsClass(anchorItem) &&
    getItemInspectType(item) === getItemInspectType(anchorItem)
  );
}

async function loadInspectTypeOptions() {
  inspectTypeLoading.value = true;
  try {
    const options = await getInspectTypeDict();
    inspectTypeOptions.value = Array.isArray(options) ? options : [];
  } catch (error) {
    console.warn(
      "[search] load inspect types failed, fallback to result-derived options:",
      error
    );
    const fallback = Array.from(
      new Set(
        (results.value || [])
          .map((item) => getItemInspectType(item))
          .filter(Boolean)
      )
    ).map((label, index) => ({ value: label, label, sortOrder: index + 1 }));
    inspectTypeOptions.value = fallback;
  } finally {
    inspectTypeLoading.value = false;
  }

  if (inspectTypeOptions.value.length > 0) {
    selectedInspectType.value =
      inspectTypeOptions.value[inspectTypeOptions.value.length - 1].value;
  } else {
    selectedInspectType.value = "";
  }
}

async function openInspectTypeSelector() {
  showInspectTypeModal.value = true;
  await loadInspectTypeOptions();
}

function closeInspectTypeSelector() {
  showInspectTypeModal.value = false;
}

function proceedMergeWithInspectType() {
  if (!selectedInspectType.value) {
    globalThis.showToast(t("请先选择验货类型"));
    return;
  }
  mergeInspectType.value = selectedInspectType.value;
  closeInspectTypeSelector();
  isMergeMode.value = true;
  mergeSelectedIds.value = [];
}

function toggleMergeSelect(item) {
  const itemId = getPlanUniqueId(item);
  if (!itemId) {
    globalThis.showToast(t("计划ID缺失，无法选择"));
    return;
  }
  const idx = mergeSelectedIds.value.indexOf(itemId);
  if (idx >= 0) {
    mergeSelectedIds.value.splice(idx, 1);
    if (mergeSelectedItemsById.value?.[itemId]) {
      const next = { ...(mergeSelectedItemsById.value || {}) };
      delete next[itemId];
      mergeSelectedItemsById.value = next;
    }
    return;
  }

  if (!isBaseMergeEligible(item)) {
    globalThis.showToast(
      t(
        "仅支持未下载(lockFlag=0)、已定计划(status=0)、且 mergeType!=2 的当前验货类型任务"
      )
    );
    return;
  }

  const anchorItem = getMergeAnchorItem();
  if (
    anchorItem &&
    (getItemFactoryNo(item) !== getItemFactoryNo(anchorItem) ||
      getItemGoodsClass(item) !== getItemGoodsClass(anchorItem) ||
      getItemInspectType(item) !== getItemInspectType(anchorItem))
  ) {
    globalThis.showToast(
      t(
        "仅支持与首选任务同供应商(factoryNo)、同品类(goodsClass)、同验货类型(inspectType)的任务合并"
      )
    );
    return;
  }

  mergeSelectedIds.value.push(itemId);
  mergeSelectedItemsById.value = {
    ...(mergeSelectedItemsById.value || {}),
    [itemId]: item
  };
}

function syncMergeSelection() {
  if (!isMergeMode.value) return;
  const map = new Map(
    (results.value || []).map((item) => [getPlanUniqueId(item), item])
  );
  mergeSelectedIds.value = mergeSelectedIds.value.filter((id) => {
    const item = map.get(id);
    if (!item) return true;
    return isBaseMergeEligible(item);
  });
  const anchorItem = getMergeAnchorItem();
  if (anchorItem) {
    mergeSelectedIds.value = mergeSelectedIds.value.filter((id) => {
      const item = map.get(id);
      if (!item) return true;
      return (
        getItemFactoryNo(item) === getItemFactoryNo(anchorItem) &&
        getItemGoodsClass(item) === getItemGoodsClass(anchorItem) &&
        getItemInspectType(item) === getItemInspectType(anchorItem)
      );
    });
  }
  const selectedIdSet = new Set(mergeSelectedIds.value);
  const next = { ...(mergeSelectedItemsById.value || {}) };
  Object.keys(next).forEach((id) => {
    if (!selectedIdSet.has(id)) delete next[id];
  });
  mergeSelectedItemsById.value = next;
}

function exitMergeMode() {
  isMergeMode.value = false;
  mergeSelectedIds.value = [];
  mergeSelectedItemsById.value = {};
  showMergeConfirmModal.value = false;
  mergePreviewSnapshot.value = [];
  mergeConfirmed.value = false;
  mergedDownloadPlanId.value = "";
  mergeInspectType.value = "";
}

function buildMergePayload() {
  if (mergeSelectedIds.value.length < 2) {
    globalThis.showToast(t("请至少选择两条验货任务进行合并"));
    return null;
  }

  const selectedItems = mergeSelectedIds.value
    .map((id) => {
      const fromSnapshot = mergeSelectedItemsById.value?.[id];
      if (fromSnapshot) return fromSnapshot;
      return (results.value || []).find((item) => getPlanUniqueId(item) === id) || null;
    })
    .filter(Boolean);
  if (selectedItems.length < 2) {
    globalThis.showToast(t("选中的任务不足两条，无法合并"));
    return null;
  }
  const allMergeAllowed = selectedItems.every((item) =>
    isBaseMergeEligible(item)
  );
  const anchorItem = selectedItems[0];
  const sameMergeBasis = selectedItems.every(
    (item) =>
      getItemFactoryNo(item) === getItemFactoryNo(anchorItem) &&
      getItemGoodsClass(item) === getItemGoodsClass(anchorItem) &&
      getItemInspectType(item) === getItemInspectType(anchorItem)
  );

  if (!allMergeAllowed) {
    globalThis.showToast(
      t(
        "存在不满足合并条件的任务（需 lockFlag=0、status=0、mergeType!=2 且验货类型一致）"
      )
    );
    return null;
  }
  if (!sameMergeBasis) {
    globalThis.showToast(
      t(
        "合并项必须与首选任务保持同供应商(factoryNo)、同品类(goodsClass)、同验货类型(inspectType)"
      )
    );
    return null;
  }

  const sourcePlanIds = Array.from(
    new Set(
      selectedItems
        .map((item) => item?.id)
        .filter((id) => id !== undefined && id !== null && id !== "")
    )
  );

  if (sourcePlanIds.length < 2) {
    globalThis.showToast(t("选中的任务计划ID无效，无法合并"));
    return null;
  }

  return { selectedItems, sourcePlanIds };
}

async function confirmMergeInspection() {
  const payload = buildMergePayload();
  if (!payload) return;
  const { sourcePlanIds } = payload;

  mergeSubmitting.value = true;
  try {
    const mergeResult = await mergePlans(sourcePlanIds);
    mergedDownloadPlanId.value = String(resolveMergedPlanId(mergeResult) || "");
    markMergedTypeForSourceItems(sourcePlanIds, mergedDownloadPlanId.value);
    mergeConfirmed.value = true;
    await loadLocalPlans();
    syncSearchResultsWithLocal();
    globalThis.showToast(t("合并验货成功，请点击“下载验货”"));
  } catch (error) {
    console.error("[search] merge failed:", error);
    globalThis.showToast(error.message || t("合并验货失败"));
  } finally {
    mergeSubmitting.value = false;
  }
}

async function downloadMergedInspection() {
  if (!mergedDownloadPlanId.value) {
    globalThis.showToast(t("缺少合并后计划ID，无法下载验货"));
    return;
  }
  if (!mergeDownloadTemplateId.value) {
    globalThis.showToast(t('请选择清单'))
    openMergeChecklistPicker()
    return
  }
  mergeSubmitting.value = true;
  try {
    const templateId = mergeDownloadTemplateId.value
    const templateName = mergeDownloadTemplateName.value
    const result = await downloadPlan(mergedDownloadPlanId.value, { templateId, templateName });
    const localRecords = splitDownloadDataToLocalPlans(result);
    if (!localRecords.length) {
      throw new Error(t("下载数据为空，无法保存到本地"));
    }

    for (const record of localRecords) {
      await savePlanToLocal(record);
    }

    await loadLocalPlans();
    syncSearchResultsWithLocal();
    globalThis.showToast(t("下载验货成功"));
    closeMergeConfirmModal();
  } catch (error) {
    console.error("[search] download merged inspection failed:", error);
    globalThis.showToast(error.message || t("下载验货失败"));
  } finally {
    mergeSubmitting.value = false;
  }
}

function handleMergeConfirmPrimaryAction() {
  if (mergeConfirmed.value) {
    downloadMergedInspection();
    return;
  }
  confirmMergeInspection();
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

function getStatusKey(item) {
  const status = normalizeStatus(getItemRawStatus(item));
  if (status === 0) return "planned";
  if (status === 1 || status === 2) return "progress";
  return "report";
}

function normalizeStatus(status) {
  if (typeof status === "number") return status;
  if (status === "0") return 0;
  if (status === "1") return 1;
  if (status === "2") return 2;
  if (status === "3") return 3;
  if (status === "DOWNLOADED" || status === "NEW") return 0;
  if (status === "DRAFT" || status === "IN_PROGRESS") return 1;
  if (status === "DONE" || status === "COMPLETED") return 3;
  return -1;
}

function getCurrentUserId() {
  if (authStore.user?.userId) return authStore.user.userId;
  if (userStore.userId) return userStore.userId;
  try {
    const session = uni.getStorageSync("userSession");
    if (session?.userId) return session.userId;
  } catch (error) {
    console.warn("[search] read userSession failed:", error);
  }
  return "";
}

async function loadFilterInspectTypeOptions() {
  if (filterInspectTypeLoading.value) return;
  filterInspectTypeLoading.value = true;
  try {
    const options = await getInspectTypeDict();
    filterInspectTypeDictOptions.value = Array.isArray(options)
      ? options.map((item) => ({
          value: String(item?.value || "").trim(),
          label: String(item?.label || "").trim()
        })).filter((item) => item.value && item.label)
      : [];
  } catch (error) {
    console.warn(
      "[search] load filter inspect types failed, fallback to result-derived options:",
      error
    );
    filterInspectTypeDictOptions.value = [];
  } finally {
    filterInspectTypeLoading.value = false;
  }
}

async function openFilterModal() {
  draftFilters.value = { ...activeFilters.value };
  await loadFilterInspectTypeOptions();
  showFilterModal.value = true;
}

function closeFilterModal() {
  showFilterModal.value = false;
}

function resetDraftFilters() {
  draftFilters.value = {
    status: "",
    inspectType: "",
    startDate: "",
    endDate: ""
  };
}

function handleClearFilters() {
  resetDraftFilters();
}

function applyFilters() {
  activeFilters.value = {
    status: draftFilters.value.status || "",
    inspectType: draftFilters.value.inspectType || "",
    startDate: draftFilters.value.startDate || "",
    endDate: draftFilters.value.endDate || ""
  };
  closeFilterModal();
  refreshSearchByFilters();
}

function selectStatus(value) {
  draftFilters.value.status = draftFilters.value.status === value ? "" : value;
}

function selectInspectType(value) {
  draftFilters.value.inspectType = draftFilters.value.inspectType === value ? "" : value;
}

async function refreshSearchByFilters() {
  if (!hasSearched.value || !keyword.value.trim()) return;
  searching.value = true;
  try {
    await loadSearchPage(1);
  } catch (error) {
    console.error("[search] filter request failed:", error);
    globalThis.showToast(error.message || t("筛选失败"));
  } finally {
    searching.value = false;
  }
}

function isMergedReport(item) {
  const mergeType =
    item?.plan?.mergeType ?? item?.mergeType ?? item?.raw?.mergeType;
  return Number(mergeType) === 2;
}

function isSplitAvailable(item) {
  const lockFlag = Number(item?.plan?.lockFlag ?? item?.lockFlag ?? 0);
  const status = normalizeStatus(getItemRawStatus(item));
  const mergeType = getItemMergeType(item);
  return mergeType === 2 && lockFlag === 0 && status === 0;
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
  };
}

function markSplitTypeForItems(items = []) {
  const targetIdSet = new Set(items.flatMap(getItemCandidateIds));
  if (!targetIdSet.size) return;

  const markItem = (item) => {
    const matched = getItemCandidateIds(item).some((id) => targetIdSet.has(id));
    return matched ? mapSplitTypeOne(item) : item;
  };

  results.value = (results.value || []).map(markItem);
  localPlans.value = (localPlans.value || []).map(markItem);
}

async function openSplitPreviewModal(item) {
  if (!isSplitAvailable(item)) {
    globalThis.showToast(
      t(
        "仅支持已合并(mergeType=2)、未锁定(lockFlag=0)、已定计划(status=0)的任务拆分"
      )
    );
    return;
  }

  const parentPlanId = getItemParentPlanId(item);
  const currentPlanId = String(getPlanUniqueId(item) || "");
  splitTargetParentPlanId.value = parentPlanId || currentPlanId;
  splitTargetPlanId.value = currentPlanId;
  if (!splitTargetPlanId.value) {
    globalThis.showToast(t("计划ID缺失，无法拆分"));
    return;
  }

  showSplitPreviewModal.value = true;
  splitLoading.value = true;
  try {
    const result = await searchPlans({
      parentPlanId: splitTargetParentPlanId.value
    });
    const rows = Array.isArray(result?.records) ? result.records : [];
    const localById = new Map(
      localPlans.value.map((plan) => [getPlanUniqueId(plan), plan])
    );
    const allCandidates = [
      ...rows,
      ...(results.value || []),
      ...(localPlans.value || [])
    ];
    const groupedRows = allCandidates.filter((candidate) => {
      const candidateParentPlanId = String(
        candidate?.plan?.parentPlanId ??
          candidate?.parentPlanId ??
          candidate?.raw?.parentPlanId ??
          ""
      ).trim();
      return candidateParentPlanId === splitTargetParentPlanId.value;
    });

    const uniqueRows = [];
    const seenIds = new Set();
    groupedRows.forEach((row) => {
      const rowKey = String(getPlanUniqueId(row) || "");
      if (!rowKey || seenIds.has(rowKey)) return;
      seenIds.add(rowKey);
      uniqueRows.push(localById.get(rowKey) || row);
    });

    splitPreviewItems.value = uniqueRows.length ? uniqueRows : [item];
  } catch (error) {
    console.error("[search] load split preview failed:", error);
    splitPreviewItems.value = [item];
    globalThis.showToast(error.message || t("加载拆分预览失败"));
  } finally {
    splitLoading.value = false;
  }
}

function closeSplitPreviewModal() {
  showSplitPreviewModal.value = false;
  splitPreviewItems.value = [];
  splitTargetPlanId.value = "";
  splitTargetParentPlanId.value = "";
}

async function confirmSplitInspection() {
  if (!splitTargetPlanId.value) {
    globalThis.showToast(t("计划ID缺失，无法拆分"));
    return;
  }

  splitSubmitting.value = true;
  try {
    await splitPlan(splitTargetPlanId.value);
    const resultFromPreview = (splitPreviewItems.value || []).map(
      mapSplitTypeOne
    );
    splitResultItems.value = resultFromPreview;
    markSplitTypeForItems(resultFromPreview);
    showSplitPreviewModal.value = false;
    showSplitResultModal.value = true;
    await loadLocalPlans();
    syncSearchResultsWithLocal();
    globalThis.showToast(t("拆分验货成功"));
  } catch (error) {
    console.error("[search] split failed:", error);
    globalThis.showToast(error.message || t("拆分验货失败"));
  } finally {
    splitSubmitting.value = false;
  }
}

function closeSplitResultModal() {
  showSplitResultModal.value = false;
  splitResultItems.value = [];
  splitDownloadLoadingMap.value = {};
}

async function downloadSplitItem(item) {
  const planId = getPlanUniqueId(item);
  if (!planId) {
    globalThis.showToast(t("计划ID缺失，无法下载"));
    return;
  }

  const key = String(planId);
  splitDownloadLoadingMap.value = {
    ...splitDownloadLoadingMap.value,
    [key]: true
  };
  try {
    const result = await downloadPlan(planId, {templateId: item.templateId});
    const localRecords = splitDownloadDataToLocalPlans(result);
    if (!localRecords.length) {
      throw new Error(t("下载数据为空，无法保存到本地"));
    }
    for (const record of localRecords) {
      await savePlanToLocal(record);
    }
    await loadLocalPlans();
    syncSearchResultsWithLocal();
    globalThis.showToast(t("下载验货成功"));
  } catch (error) {
    console.error("[search] download split item failed:", error);
    globalThis.showToast(error.message || t("下载验货失败"));
  } finally {
    splitDownloadLoadingMap.value = {
      ...splitDownloadLoadingMap.value,
      [key]: false
    };
  }
}

function handleSplitInspection(item) {
  openSplitPreviewModal(item);
}

// 打开扫码器
async function scanBarcode() {
  const uniResult = await scanByUni();
  if (uniResult.ok) {
    keyword.value = uniResult.value;
    return;
  }
  if (uniResult.canceled) {
    return;
  }

  // 钉钉没走通、或者 uni-app 报错说不支持原生扫码，就降级到我们写的 H5 扫码器
  if (isH5Platform()) {
    await openH5Scanner();
    return;
  }

  globalThis.showToast(t("当前环境不支持扫码，请手动输入"));
  manualInput();
}

async function openH5Scanner() {
  if (showScanner.value) return;

  showScanner.value = true;
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    let scanned = false;
    await startH5Scanner({
      elementId: scannerElementId,
      fps: 8,
      onDecoded: (decodedText) => {
        if (scanned) return;
        const scannedValue = String(decodedText || "").trim();
        if (!scannedValue) return;
        scanned = true;
        keyword.value = scannedValue;
        closeScanner();
      }
    });

    // 检查并设置缩放能力
    setTimeout(async () => {
      const caps = await getCameraCapabilities();
      if (caps && caps.zoom && caps.zoom.max > 1) {
        showZoomBtn.value = true;
        zoomMax.value = caps.zoom.max;
        zoomMin.value = caps.zoom.min || 1;
        zoomStep.value = caps.zoom.step || 0.1;
        currentZoom.value = zoomMin.value;
      } else {
        showZoomBtn.value = false;
      }
    }, 500);

  } catch (error) {
    console.error("[search] open h5 scanner failed:", error);
    globalThis.showToast(getH5ScannerErrorMessage(error));
    closeScanner();
  }
}

// 关闭扫码器
function closeScanner() {
  showScanner.value = false;
  showZoomBtn.value = false;
  currentZoom.value = 1;
  if (isH5Runtime) {
    stopH5Scanner();
  }
}

// 手动输入
function manualInput() {
  closeScanner();
  // 聚焦搜索框
  const input = document.querySelector(".search-input");
  if (input) {
    input.focus();
  }
}

async function handleToggleZoom() {
  if (!showZoomBtn.value) return;
  // 简单的 1x / 2x / 3x 切换逻辑，或者根据最大值切换
  let nextZoom = currentZoom.value + 1;
  if (nextZoom > Math.min(3, zoomMax.value)) {
    nextZoom = zoomMin.value;
  }
  const success = await setZoom(nextZoom);
  if (success) {
    currentZoom.value = nextZoom;
  }
}

// 组件挂载时检查是否自动扫码
onMounted(() => {
  loadLocalPlans();
  if (String(pageQuery.value?.autoScan || "") === "1") {
    // 延迟一下，确保页面渲染完成
    setTimeout(() => {
      scanBarcode();
    }, 300);
  }
});

onLoad((options = {}) => {
  pageQuery.value = options || {};
});

// 组件卸载时清理
onUnmounted(() => {
  closeScanner();
  hideActionMenu();
  closeInspectTypeSelector();
  closeSplitPreviewModal();
  closeSplitResultModal();
  showMergeConfirmModal.value = false;
  exitMergeMode();
});
</script>

<style scoped>
.page {
  min-height: 100vh;
  box-sizing: border-box;
  background: #f5f5f5;
}
.sticky-top-area {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
}
.header {
  background: #fff;
  padding: 24rpx 30rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.back-btn {
  width: 72rpx;
  height: 72rpx;
  font-size: 48rpx;
  color: #03ae4f;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin: -8rpx 0;
}
.search-input {
  flex: 1;
  height: 80rpx;
  border: none;
  outline: none;
  font-size: 32rpx;
  line-height: 80rpx;
  background: #f5f5f5;
  padding: 0 30rpx;
  border-radius: 40rpx;
}
.search-input-placeholder {
  color: #9ca3af;
}
.scan-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #333;
  flex-shrink: 0;
}

.scan-frame {
  position: relative;
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-corner {
  position: absolute;
  width: 14rpx;
  height: 14rpx;
  border-color: #1a1a1a;
  border-style: solid;

  &.tl {
    top: 0;
    left: 0;
    border-width: 3rpx 0 0 3rpx;
    border-radius: 2rpx 0 0 0;
  }
  &.tr {
    top: 0;
    right: 0;
    border-width: 3rpx 3rpx 0 0;
    border-radius: 0 2rpx 0 0;
  }
  &.bl {
    bottom: 0;
    left: 0;
    border-width: 0 0 3rpx 3rpx;
    border-radius: 0 0 0 2rpx;
  }
  &.br {
    bottom: 0;
    right: 0;
    border-width: 0 3rpx 3rpx 0;
    border-radius: 0 0 2rpx 0;
  }
}
.search-button-container {
  padding: 16rpx 30rpx;
  background: #fff;
}
.result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 10rpx 30rpx;
  background: #fff;
  border-top: 2rpx solid #f1f5f9;
}
.result-toolbar-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.result-title {
  flex-shrink: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e293b;
}
.result-divider {
  flex: 1;
  height: 0;
  border-top: 2rpx dashed #cbd5e1;
}
.result-filter-btn {
  min-width: 120rpx;
  height: 52rpx;
  border-radius: 12rpx;
  border: 2rpx solid #d1d5db;
  background: #fff;
  color: #0f172a;
  font-size: 24rpx;
  font-weight: 600;
}
.search-btn {
  width: 100%;
  height: 72rpx;
  margin: 0;
  padding: 0;
  line-height: 72rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  border: none;
  border-radius: 36rpx;
  font-size: 28rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}
.search-btn::after {
  border: none;
}
.search-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-2rpx);
}
.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.content {
  padding: 30rpx;
}
.merge-mode-content {
  padding-bottom: 192rpx;
}
.loading,
.empty {
  text-align: center;
  padding: 80rpx 40rpx;
  color: #666;
}
.empty-icon {
  font-size: 128rpx;
  margin-bottom: 30rpx;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

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
  padding: 30rpx 40rpx;
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
  background: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.2);
  z-index: 1;
}
.download-icon-wrapper svg {
  width: 32rpx;
  height: 32rpx;
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
  padding-right: 100rpx;
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
  top: 24rpx;
  right: 32rpx;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.merge-flag {
  width: 60rpx;
  height: 60rpx;
  border-radius: 16rpx;
  background: #ecfdf5;
  color: #059669;
  border: 2rpx solid #a7f3d0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2rpx 4rpx rgba(5, 150, 105, 0.12);
}
.merge-flag svg {
  width: 32rpx;
  height: 32rpx;
}
.card-more-btn {
  width: 64rpx;
  height: 64rpx;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 16rpx;
  transition: all 0.2s;
  box-shadow: 0 2rpx 4rpx rgba(15, 23, 42, 0.08);
}
.card-more-btn:active {
  background: #f1f5f9;
  transform: scale(0.96);
}
.hints {
  background: #fff;
  padding: 40rpx;
  border-radius: 20rpx;
  margin-top: 40rpx;
}
.hint-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 30rpx;
}
.hint-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.hint-item {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}

.search-pagination-bar {
  margin-top: 32rpx;
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

.load-more-btn {
  width: 100%;
  background: #fff;
  border: 2rpx solid #e5e7eb;
  color: #14a44d;
  border-radius: 20rpx;
  height: 96rpx;
  font-size: 30rpx;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.load-more-btn:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #14a44d;
}

.load-more-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-nav-btn {
  flex: 1;
  background: #fff;
  border: 2rpx solid #e5e7eb;
  color: #14a44d;
  border-radius: 20rpx;
  height: 96rpx;
  font-size: 30rpx;
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

.fab {
  position: fixed;
  right: 40rpx;
  bottom: 80rpx;
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: #05b552;
  color: #fff;
  font-size: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 24rpx rgba(5, 181, 82, 0.3);
  cursor: pointer;
  transition: all 0.3s;
  z-index: 1200;
}
.fab:hover {
  transform: scale(1.1);
  box-shadow: 0 24rpx 48rpx rgba(5, 181, 82, 0.4);
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
.filter-modal {
  width: 100%;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 40rpx 32rpx 48rpx;
  animation: slideUp 0.3s;
}
.filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40rpx;
}
.filter-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #111827;
}
.filter-clear {
  color: #0f766e;
  font-size: 28rpx;
  font-weight: 600;
}
.filter-section {
  margin-bottom: 40rpx;
}
.filter-section-title {
  display: block;
  font-size: 30rpx;
  color: #0f172a;
  font-weight: 700;
  margin-bottom: 24rpx;
}
.filter-chip-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20rpx;
}
.filter-chip {
  height: 88rpx;
  border-radius: 16rpx;
  border: 2rpx solid #e2e8f0;
  background: #f8fafc;
  color: #9ca3af;
  font-size: 30rpx;
  font-weight: 600;
  padding: 0 12rpx;
}
.filter-chip.active {
  background: #e8f7ef;
  border-color: #34d399;
  color: #047857;
}
.filter-date-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.filter-date-label {
  font-size: 34rpx;
  color: #0f172a;
  font-weight: 600;
}
.filter-date-picker {
  flex: 1;
  min-width: 0;
}
.filter-date-box {
  min-height: 74rpx;
  border: 2rpx solid #e2e8f0;
  border-radius: 12rpx;
  background: #f8fafc;
  display: flex;
  align-items: center;
  padding: 0 16rpx;
  font-size: 26rpx;
  color: #334155;
}
.filter-actions {
  margin-top: 36rpx;
}
.filter-btn {
  width: 100%;
  height: 96rpx;
  border-radius: 16rpx;
  font-size: 34rpx;
  font-weight: 700;
}
.filter-btn.confirm {
  border: none;
  background: #0b4a6f;
  color: #fff;
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
.menu-icon {
  font-size: 40rpx;
  width: 56rpx;
  text-align: center;
  color: #333;
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

.merge-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  border-top: 2rpx solid #e5e7eb;
  padding: 16rpx 28rpx calc(16rpx + env(safe-area-inset-bottom, 0));
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  z-index: 1300;
}
.merge-selected-hint {
  font-size: 24rpx;
  color: #6b7280;
  text-align: center;
}
.merge-action-btns {
  display: flex;
  gap: 20rpx;
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
