<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="250"
    class="check-item-popup"
    :style="{ height: '95vh', width: '100%' }"
    @click-overlay="$emit('close')"
  >
    <view class="modal-container">
      <view class="modal-header">
        <view
          class="close-btn"
          @click.stop="$emit('close')"
          >✕</view
        >
        <text class="modal-title">{{ modalTitle }}</text>
        <view
          class="header-camera-btn"
          @click.stop="handleHeaderCamera"
        >
          <Icon name="photograph" size="28" color="#1a5f3f" />
        </view>
      </view>

      <view ref="modalBodyRef" class="modal-body">
        <!-- 当前结果提示条 -->
        <view
          v-if="itemData.result"
          class="current-result-banner"
          :class="`banner-${itemData.result}`"
        >
          <view class="banner-left">
            <text class="result-status-dot"></text>
            <text class="result-status-label">{{
              resultMeta[itemData.result]?.label
            }}</text>
          </view>
          <view class="banner-right">{{ t('检查 - {label}', { label: resultMeta[itemData.result]?.label }) }}</view>
        </view>

        <!-- 项目描述 -->
        <view v-if="item?.itemDescription" class="item-description">
          {{ item.itemDescription }}
        </view>

        <!-- 条码扫描 -->
        <view v-if="item?.itemType === 'Barcodes'" class="barcode-section">
          <view class="section-title">{{ t('条码扫描') }}</view>
          <view v-if="itemData.barcodeItems?.length" class="barcode-card-list">
            <view
              v-for="(barcodeItem, index) in itemData.barcodeItems"
              :key="index"
              class="barcode-card"
            >
              <view class="barcode-card-header">
                <text class="barcode-card-title">{{ barcodeItem.name }}</text>
                <AppButton
                  class="barcode-edit-btn"
                  @click="openBarcodeNamePopup(index)"
                >{{ t('编辑') }}</AppButton>
              </view>
              <view class="barcode-card-body">
                <view class="barcode-row">
                  <text class="barcode-row-label">{{ t('条码信息') }}</text>
                  <view class="barcode-row-main">
                    <text class="barcode-row-value barcode-row-value-inline">{{
                      barcodeItem.code || "-"
                    }}</text>
                    <AppButton
                      class="scan-inline-btn"
                      @click="scanBarcodeItem(index)"
                    >{{ t('扫描条码') }}</AppButton>
                  </view>
                </view>
                <view class="barcode-row">
                  <text class="barcode-row-label">{{ t('扫码格式') }}</text>
                  <text class="barcode-row-value">{{
                    barcodeItem.format || "-"
                  }}</text>
                </view>
              </view>
            </view>
          </view>
          <AppButton class="barcode-empty-btn" @click="openBarcodeNamePopup"
          >{{ t('+ 增加条码') }}</AppButton>
        </view>

        <!-- 规格测量 -->
        <view
          v-if="item?.itemType === 'Measurements'"
          class="measurements-section"
        >
          <view class="section-title">{{ t('规格测量') }}</view>
          <view class="measurement-actions">
            <AppButton class="add-spec-card-btn" @click="addMeasurementCard"
            >{{ t('+ 新增一组规格') }}</AppButton>
          </view>
          <view class="measurement-cards">
            <view class="measurement-card">
              <view class="measurement-card-header">
                <AppButton
                  class="measurement-nav-btn"
                  :disabled="measurementIndex === 0"
                  @click="measurementIndex--"
                >
                  {{ t('上一组') }}</AppButton>
                <text class="measurement-index-indicator"
                  >{{ measurementIndex + 1 }}/{{
                    itemData.measurements.length || 1
                  }}</text
                >
                <AppButton
                  class="measurement-nav-btn"
                  :disabled="
                    measurementIndex >= itemData.measurements.length - 1
                  "
                  @click="measurementIndex++"
                >{{ t('下一组') }}</AppButton>
              </view>
              <view
                v-if="itemData.measurements.length > 1"
                class="measurement-delete-row"
              >
                <AppButton
                  class="remove-spec-card-btn"
                  @click="removeMeasurementCard(measurementIndex)"
                >{{ t('删除当前组') }}</AppButton>
              </view>
              <CellGroup inset>
                <Field
                  v-for="attr in item.specAttributes"
                  :key="`${measurementIndex}_${attr.attrId}`"
                  v-model="currentMeasurementRow[attr.attrId]"
                  :label="attr.attrName"
                  :placeholder="t('请输入{field}', { field: attr.attrName })"
                  @update:model-value="$emit('auto-save')"
                />
              </CellGroup>
            </view>
          </view>
          <view
            v-if="itemData.measurements.length > 1"
            class="measurement-summary-wrap"
          >
            <table class="measurement-summary-table">
              <thead>
                <tr>
                  <th>{{ t('规格') }}</th>
                  <th
                    v-for="(_, idx) in itemData.measurements"
                    :key="`h${idx}`"
                  >
                    {{ idx + 1 }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="attr in item.specAttributes"
                  :key="`r${attr.attrId}`"
                >
                  <td>{{ attr.attrName }}</td>
                  <td
                    v-for="(row, idx) in itemData.measurements"
                    :key="`c${attr.attrId}_${idx}`"
                    :class="{ active: idx === measurementIndex }"
                  >
                    {{ row[attr.attrId] || "-" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </view>
        </view>

        <!-- 文本输入 -->
        <view v-if="item?.itemType === 'Text'" class="text-section">
          <view class="section-title">{{ t('检查结果') }}</view>
          <view class="measurement-actions">
            <AppButton class="add-spec-card-btn" @click="addTextCard"
            >{{ t('+ 新增一组文本') }}</AppButton>
          </view>
          <view class="measurement-cards">
            <view class="measurement-card">
              <view class="measurement-card-header">
                <AppButton
                  class="measurement-nav-btn"
                  :disabled="textGroupIndex === 0"
                  @click="textGroupIndex--"
                >{{ t('上一组') }}</AppButton>
                <text class="measurement-index-indicator"
                  >{{ textGroupIndex + 1 }}/{{
                    itemData.textGroups.length || 1
                  }}</text
                >
                <AppButton
                  class="measurement-nav-btn"
                  :disabled="textGroupIndex >= itemData.textGroups.length - 1"
                  @click="textGroupIndex++"
                >{{ t('下一组') }}</AppButton>
              </view>
              <view
                v-if="itemData.textGroups.length > 1"
                class="measurement-delete-row"
              >
                <AppButton
                  class="remove-spec-card-btn"
                  @click="removeTextCard(textGroupIndex)"
                >{{ t('删除当前组') }}</AppButton>
              </view>
              <view class="text-fields">
                <view
                  v-for="attr in item.specAttributes"
                  :key="`${textGroupIndex}_${attr.attrId}`"
                  class="text-field"
                >
                  <text class="field-label">{{ attr.attrName }}</text>
                  <input
                    v-model="currentTextRow[attr.attrId]"
                    class="field-select"
                    type="text"
                    :placeholder="t('请输入{field}', { field: attr.attrName })"
                    @input="$emit('auto-save')"
                    @blur="
                      $emit('text-result-change', attr.attrId, textGroupIndex)
                    "
                  />
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 备注 -->
        <view class="notes-section">
          <view class="section-title">{{ t('备注') }}</view>
          <textarea
            ref="notesTextareaRef"
            v-model="itemData.comment"
            @input="onNotesInput"
            @touchstart="onNotesTouchStart"
            @touchmove="onNotesTouchMove"
            :placeholder="t('写评论')"
            class="notes-textarea"
            rows="3"
          ></textarea>
        </view>
        <!-- 媒体库 -->
        <view ref="mediaSectionRef" class="media-section">
          <view class="section-title">
            {{ t('媒体库') }}
            <text v-if="item?.isPhotoRequired" class="required-mark"
            >{{ t('*必填') }}</text>
          </view>
          <MediaGrid
            ref="mediaGridRef"
            :photos="mediaPhotos"
            @add="(files) => $emit('add-media', files)"
            @add-check-point="(files) => $emit('add-check-point-media', files)"
            @remove="(idx) => emitPhotoAction('remove-media', mediaPhotos, idx)"
            @retry="(idx) => emitPhotoAction('retry-upload', mediaPhotos, idx)"
            @edit-save="({ index, dataUrl }) => emitPhotoAction('edit-save', mediaPhotos, index, dataUrl)"
            @capture-start="$emit('capture-start')"
            @capture-end="$emit('capture-end')"
          />
        </view>

        <!-- 关联疵点 -->
        <view v-if="defects.length" class="defects-section">
          <view class="section-title">{{ t('关联疵点（{count}）', { count: defects.length }) }}</view>
          <view
            v-for="(defect, i) in defects"
            :key="defect.id || i"
            class="defect-item"
            @click="$emit('open-defect', defect)"
          >
            <text
              class="defect-severity-tag"
              :class="`severity-${normalizeSeverity(defect.type)}`"
            >
              {{ getSeverityLabel(defect.type) }}
            </text>
            <text class="defect-category">{{ defect.defectCode || "-" }}</text>
            <text
              v-if="
                Number(defect.commonFlag ?? (defect.isCommon ? 1 : 0)) === 1
              "
              class="defect-qty"
            >{{ t('普遍性') }}</text>
            <text v-else-if="defect.quantity" class="defect-qty"
            >{{ t('{count}个', { count: defect.quantity }) }}</text>
            <text v-if="defect.defectDesc" class="defect-desc"
              >· {{ defect.defectDesc }}</text
            >
          </view>
        </view>
        <AppButton class="copy-items-btn" @click="$emit('copy-items')">
          {{ t('复制到其他验货') }}
        </AppButton>
        <AppButton
          v-if="mediaPhotos.length > 1"
          class="copy-items-btn"
          @click="showPhotoSort = true"
        >
          {{ t('照片重新排序') }}
        </AppButton>
        <AppButton
          v-if="mediaPhotos.length > 0"
          class="copy-items-btn"
          @click="$emit('batch-move')"
        >
          {{ t('批量移动照片/视频') }}
        </AppButton>

        <!-- 重置按钮：有结果或有内容时才显示 -->
        <AppButton
          v-if="hasContent"
          class="reset-item-btn"
          @click="$emit('reset-item')"
        >
          {{ t('重置检查点') }}
        </AppButton>
        <AppButton
          v-if="showCheckPointUpload"
          class="copy-items-btn"
          @click="chooseCheckPointImage"
        >
          {{ t('上传检查点图片') }}
        </AppButton>
        <view v-if="showCheckPointUpload && checkPointPhotos.length" class="media-section">
          <view class="section-title">{{ t('检查点图片') }}</view>
          <MediaGrid
            :photos="checkPointPhotos"
            :hide-add="true"
            @remove="(idx) => emitPhotoAction('remove-media', checkPointPhotos, idx)"
            @retry="(idx) => emitPhotoAction('retry-upload', checkPointPhotos, idx)"
            @edit-save="({ index, dataUrl }) => emitPhotoAction('edit-save', checkPointPhotos, index, dataUrl)"
          />
        </view>
      </view>

      <!-- 底部检查结果按钮 -->
      <view class="modal-footer-fixed">
        <view class="result-circles-row">
          <view
            class="result-circle pass"
            :class="{ active: itemData.result === 'pass' }"
            @click="$emit('select-result', 'pass')"
          >
            <view class="circle-icon">
              <Icon name="checked" size="32" color="#22c55e" />
            </view>
            <view class="circle-text">{{ t('检查 - 合格') }}</view>
          </view>
          <view
            class="result-circle fail"
            :class="{ active: itemData.result === 'fail' }"
            @click="$emit('select-result', 'fail')"
          >
            <view class="circle-icon">
              <Icon name="warning" size="32" color="#ef4444" />
            </view>
            <view class="circle-text">{{ t('检查 - 不合格') }}</view>
          </view>
          <view
            class="result-circle pending"
            :class="{ active: itemData.result === 'pending' }"
            @click="$emit('select-result', 'pending')"
          >
            <view class="circle-icon">
              <Icon name="question-o" size="32" color="#f59e0b" />
            </view>
            <view class="circle-text">{{ t('检查 - 待定') }}</view>
          </view>
          <view
            class="result-circle na"
            :class="{ active: itemData.result === 'na' }"
            @click="$emit('select-result', 'na')"
          >
            <view class="circle-icon">
              <Icon name="clear" size="32" color="#64748b" />
            </view>
            <view class="circle-text">{{ t('检查 - 不适用') }}</view>
          </view>
        </view>
      </view>
    </view>

    <Popup
      :show="showBarcodeNamePopup"
      position="bottom"
      round
      :z-index="260"
      class="barcode-name-popup"
      @click-overlay="closeBarcodeNamePopup"
    >
      <view class="barcode-popup">
        <view class="barcode-popup-header">
          <view class="barcode-popup-title">{{
            isEditingBarcode ? t("编辑条形码") : t("新增条码测试项")
          }}</view>
          <view
            v-if="isEditingBarcode"
            class="barcode-popup-delete"
            @click="deleteBarcodeItemInPopup"
          >
            <Icon name="delete-o" size="20" color="#ef4444" />
          </view>
        </view>
        <input
          v-model="newBarcodeName"
          type="text"
          :placeholder="t('请输入条码名称')"
          class="barcode-popup-input"
        />
        <view class="barcode-popup-actions">
          <AppButton class="popup-cancel-btn" @click="closeBarcodeNamePopup"
          >{{ t('取消') }}</AppButton>
          <AppButton class="popup-confirm-btn" @click="confirmBarcodeItem">{{
            isEditingBarcode ? t("保存") : t("确认")
          }}</AppButton>
        </view>
      </view>
    </Popup>
    <PhotoSortPopup
      :visible="showPhotoSort"
      :photos="mediaPhotos"
      @close="showPhotoSort = false"
      @sorted="onPhotosSorted"
    />
    <H5ScannerModal
      :visible="showH5Scanner"
      :element-id="scannerElementId"
      :title-text="t('扫描条码')"
      :hint-text="t('将条码对准扫描框')"
      :manual-text="t('手动输入')"
      :show-zoom="showZoomBtn"
      :current-zoom="currentZoom"
      @close="closeH5Scanner"
      @manual-input="closeH5Scanner"
      @toggle-zoom="handleToggleZoom"
    />
  </Popup>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { Icon, CellGroup, Field, Popup } from "vant";
import { useI18n } from "../../../utils/i18n.js";
import MediaGrid from "./MediaGrid.vue";
import H5ScannerModal from "./H5ScannerModal.vue";
import PhotoSortPopup from "./PhotoSortPopup.vue";
import { useScanner } from "../composables/useScanner.js";
import { getMediaPhotos, getCheckPointPhotos, getOriginalPhotoIndex, mergeSortedMediaPhotos } from "../utils/checkPointMedia.js";
import "vant/lib/icon/style";
import "vant/lib/cell-group/style";
import "vant/lib/field/style";
import "vant/lib/popup/style";

const props = defineProps({
  visible: { type: Boolean, default: false },
  item: { type: Object, default: null },
  itemData: { type: Object, required: true },
  sonPlanId: { type: String, default: "" },
  showCheckPointUpload: { type: Boolean, default: false },
  defects: { type: Array, default: () => [] },
  autoCapture: { type: Boolean, default: false }
});

const emit = defineEmits([
  "close",
  "select-result",
  "add-media",
  "add-check-point-media",
  "remove-media",
  "retry-upload",
  "edit-save",
  "auto-save",
  "text-result-change",
  "reset-item",
  "open-defect",
  "copy-items",
  "photos-sorted",
  "batch-move",
  "capture-start",
  "capture-end"
]);

const mediaGridRef = ref(null);
const mediaSectionRef = ref(null);
const mediaPhotos = computed(() => getMediaPhotos(props.itemData.photos));
const checkPointPhotos = computed(() => getCheckPointPhotos(props.itemData.photos));
let _headerCameraLock = false

function emitPhotoAction(eventName, displayedPhotos, index, dataUrl) {
  const originalIndex = getOriginalPhotoIndex(props.itemData.photos, displayedPhotos, index);
  if (originalIndex < 0) return;
  emit(eventName, eventName === 'edit-save' ? { index: originalIndex, dataUrl } : originalIndex);
}

function chooseCheckPointImage() {
  uni.showActionSheet({
    itemList: [t('拍照'), t('从相册选择')],
    success: ({ tapIndex }) => {
      if (tapIndex === 0 || tapIndex === 1) {
        mediaGridRef.value?.pickCheckPointImage(tapIndex === 0 ? 'camera' : 'album');
      }
    }
  });
}

function handleHeaderCamera() {
  if (_headerCameraLock) return
  _headerCameraLock = true
  setTimeout(() => { _headerCameraLock = false }, 400)
  const grid = mediaGridRef.value
  if (grid?.captureFromCamera) {
    grid.captureFromCamera()
    return
  }
  if (grid?.handleAdd) {
    grid.handleAdd()
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.autoCapture) {
      nextTick(() => {
        setTimeout(() => {
          const el = mediaSectionRef.value?.$el || mediaSectionRef.value;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          mediaGridRef.value?.handleAdd();
        }, 300);
      });
    }
  }
);

const { t } = useI18n();

const resultMeta = computed(() => ({
  pass: { label: t("合格") },
  fail: { label: t("不合格") },
  pending: { label: t("待定") },
  na: { label: t("不适用") }
}));

function normalizeSeverity(raw) {
  const t = String(raw || "").toUpperCase();
  if (t.includes("CRITICAL") || t.includes("致命")) return "CRITICAL";
  if (t.includes("MAJOR") || t.includes("主要") || t.includes("严重"))
    return "MAJOR";
  return "MINOR";
}

function getSeverityLabel(raw) {
  const key = normalizeSeverity(raw);
  return { CRITICAL: t("致命"), MAJOR: t("主要"), MINOR: t("次要") }[key];
}

// 是否有已填写内容（有结果 / 有备注 / 有照片）
const hasContent = computed(() => {
  if (props.itemData.result) return true;
  if (props.itemData.comment?.trim()) return true;
  if (props.itemData.photos?.length) return true;
  return false;
});

const showPhotoSort = ref(false);
const measurementIndex = ref(0);
const textGroupIndex = ref(0);
const showBarcodeNamePopup = ref(false);
const newBarcodeName = ref("");
const editingBarcodeIndex = ref(-1);
const isEditingBarcode = computed(() => editingBarcodeIndex.value >= 0);
const showH5Scanner = ref(false);
const scannerElementId = "check-item-h5-scanner";
const {
  isH5Platform,
  scanByUni: scanByUniOrDingTalk,
  startH5Scanner,
  stopH5Scanner,
  setZoom,
  getCameraCapabilities,
  extractScanFormat,
  getH5ScannerErrorMessage
} = useScanner({ t });

const modalBodyRef = ref(null);
const notesTextareaRef = ref(null);
let notesTouchStartY = 0;
let notesTouchLastY = 0;

// 缩放相关状态
const showZoomBtn = ref(false);
const currentZoom = ref(1);
const zoomMin = ref(1);
const zoomMax = ref(1);
const zoomStep = ref(0.1);

watch(
  () => props.visible,
  (val) => {
    if (val) {
      measurementIndex.value = 0;
      textGroupIndex.value = 0;
      if (props.item?.itemType === "Barcodes") ensureBarcodeItems();
      // nextTick(() => adjustNotesTextareaHeight());
    } else {
      closeH5Scanner();
    }
  }
);

onUnmounted(() => {
  closeH5Scanner();
});

const modalTitle = computed(() => {
  const name = String(props.item?.itemName || "").trim();
  if (!name) return "";
  const typeMap = { Measurements: t("规格"), Barcodes: t("条码"), Text: t("文本") };
  const typeLabel = typeMap[props.item?.itemType] || t("标准");
  return t("{name} ({type})", { name, type: typeLabel });
});

const currentMeasurementRow = computed(() => {
  const rows = Array.isArray(props.itemData.measurements)
    ? props.itemData.measurements
    : [];
  if (!rows.length) return {};
  const idx = Math.min(Math.max(measurementIndex.value, 0), rows.length - 1);
  return rows[idx] || {};
});

const currentTextRow = computed(() => {
  const rows = Array.isArray(props.itemData.textGroups)
    ? props.itemData.textGroups
    : [];
  if (!rows.length) return {};
  const idx = Math.min(Math.max(textGroupIndex.value, 0), rows.length - 1);
  return rows[idx] || {};
});

function normalizeRows(rawRows, attrs = []) {
  const attrIds = attrs.map((a) => a.attrId);
  const empty = () => Object.fromEntries(attrIds.map((id) => [id, ""]));
  if (Array.isArray(rawRows) && rawRows.length) {
    return rawRows.map((row) => {
      const r = empty();
      attrIds.forEach((id) => {
        r[id] = row?.[id] ?? "";
      });
      return r;
    });
  }
  if (rawRows && typeof rawRows === "object" && !Array.isArray(rawRows)) {
    const r = empty();
    attrIds.forEach((id) => {
      r[id] = rawRows[id] ?? "";
    });
    return [r];
  }
  return [empty()];
}

function addMeasurementCard() {
  if (!props.item || props.item.itemType !== "Measurements") return;
  const rows = normalizeRows(
    props.itemData.measurements,
    props.item.specAttributes || []
  );
  const emptyRow = normalizeRows(null, props.item.specAttributes || [])[0];
  rows.push(emptyRow);
  props.itemData.measurements = rows;
  measurementIndex.value = rows.length - 1;
}

function removeMeasurementCard(index) {
  if (!props.item || props.item.itemType !== "Measurements") return;
  const rows = [...(props.itemData.measurements || [])];
  if (rows.length <= 1) return;
  rows.splice(index, 1);
  props.itemData.measurements = rows;
  measurementIndex.value = Math.min(measurementIndex.value, rows.length - 1);
}

function addTextCard() {
  if (!props.item || props.item.itemType !== "Text") return;
  const rows = normalizeRows(
    props.itemData.textGroups,
    props.item.specAttributes || []
  );
  const emptyRow = normalizeRows(null, props.item.specAttributes || [])[0];
  rows.push(emptyRow);
  props.itemData.textGroups = rows;
  textGroupIndex.value = rows.length - 1;
}

function removeTextCard(index) {
  if (!props.item || props.item.itemType !== "Text") return;
  const rows = [...(props.itemData.textGroups || [])];
  if (rows.length <= 1) return;
  rows.splice(index, 1);
  props.itemData.textGroups = rows;
  textGroupIndex.value = Math.min(textGroupIndex.value, rows.length - 1);
}

function ensureBarcodeItems() {
  if (
    Array.isArray(props.itemData.barcodeItems) &&
    props.itemData.barcodeItems.length > 0
  )
    return;
  const sourceList = Array.isArray(props.itemData.barcodeList)
    ? props.itemData.barcodeList
    : [];
  const items = sourceList.map((code, index) => ({
    name: `条码项${index + 1}`,
    code: String(code || ""),
    format: ""
  }));
  props.itemData.barcodeItems = items.length
    ? items
    : [{ name: "", code: "", format: "" }];
}

function syncBarcodeList() {
  const items = Array.isArray(props.itemData.barcodeItems)
    ? props.itemData.barcodeItems
    : [];
  const list = items
    .map((item) => String(item?.code || "").trim())
    .filter(Boolean);
  props.itemData.barcodeList = list;
  props.itemData.barcode = list[0] || "";
  emit("auto-save");
}

function openBarcodeNamePopup(index = -1) {
  ensureBarcodeItems();
  editingBarcodeIndex.value = index;
  showBarcodeNamePopup.value = true;
  newBarcodeName.value =
    index >= 0 ? String(props.itemData.barcodeItems[index]?.name || "") : "";
}

function closeBarcodeNamePopup() {
  showBarcodeNamePopup.value = false;
  newBarcodeName.value = "";
  editingBarcodeIndex.value = -1;
}

function onNotesTouchStart(e) {
  const touch = e.touches?.[0];
  if (!touch) return;
  notesTouchStartY = touch.clientY;
  notesTouchLastY = touch.clientY;
}

function onNotesTouchMove(e) {
  const touch = e.touches?.[0];
  if (!touch) return;
  const dy = touch.clientY - notesTouchLastY;
  notesTouchLastY = touch.clientY;
  if (Math.abs(touch.clientY - notesTouchStartY) < 4) return;
  const el = modalBodyRef.value?.$el || modalBodyRef.value;
  if (!el || typeof el.scrollTop !== "number") return;
  el.scrollTop -= dy;
  try {
    e.preventDefault();
  } catch {}
}

function onNotesInput() {
  emit("auto-save");
  // adjustNotesTextareaHeight();
}

function adjustNotesTextareaHeight() {
  // const el = notesTextareaRef.value;
  // if (!el) return;
  // const textarea = el.$el || el;
  // if (!textarea || !textarea.style) return;
  // textarea.style.height = "auto";
  // const maxHeight = 220;
  // const nextHeight = Math.max(textarea.scrollHeight || 0, 0);
  // const finalHeight = Math.min(nextHeight, maxHeight);
  // textarea.style.height = finalHeight + "px";
  // textarea.style.overflowY = nextHeight > maxHeight ? "auto" : "hidden";
}

function confirmBarcodeItem() {
  const name = newBarcodeName.value.trim();
  if (!name) {
    uni.showToast({ title: t("请输入条码名称"), icon: "none" });
    return;
  }
  ensureBarcodeItems();
  if (isEditingBarcode.value) {
    const idx = editingBarcodeIndex.value;
    if (!props.itemData.barcodeItems[idx]) return;
    props.itemData.barcodeItems[idx] = {
      ...props.itemData.barcodeItems[idx],
      name
    };
  } else {
    props.itemData.barcodeItems.push({ name, code: "", format: "" });
  }
  closeBarcodeNamePopup();
  syncBarcodeList();
}

function deleteBarcodeItemInPopup() {
  if (!isEditingBarcode.value) return;
  const idx = editingBarcodeIndex.value;
  ensureBarcodeItems();
  if (!props.itemData.barcodeItems[idx]) return;
  props.itemData.barcodeItems.splice(idx, 1);
  closeBarcodeNamePopup();
  syncBarcodeList();
}

function applyBarcodeScanResult(index, code, format) {
  props.itemData.barcodeItems[index] = {
    ...props.itemData.barcodeItems[index],
    code: String(code || "").trim(),
    format: String(format || "").trim()
  };
  syncBarcodeList();
}

function onPhotosSorted(newPhotos) {
  emit("photos-sorted", mergeSortedMediaPhotos(props.itemData.photos || [], newPhotos));
}

async function openH5Scanner(index) {
  if (showH5Scanner.value) return false;

  showH5Scanner.value = true;
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    let scanned = false;
    await startH5Scanner({
      elementId: scannerElementId,
      fps: 8,
      onDecoded: (decodedText, decodedResult) => {
        if (scanned) return;
        const scannedValue = String(decodedText || "").trim();
        if (!scannedValue) return;
        scanned = true;
        applyBarcodeScanResult(index, scannedValue, extractScanFormat(decodedResult));
        closeH5Scanner();
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

    return true;
  } catch (error) {
    console.error("[check-item] open h5 scanner failed:", error);
    uni.showToast({ title: getH5ScannerErrorMessage(error), icon: "none" });
    closeH5Scanner();
    return false;
  }
}

function closeH5Scanner() {
  showH5Scanner.value = false;
  showZoomBtn.value = false;
  currentZoom.value = 1;
  if (isH5Platform()) {
    stopH5Scanner();
  }
}

async function handleToggleZoom() {
  if (!showZoomBtn.value) return;
  let nextZoom = currentZoom.value + 1;
  if (nextZoom > Math.min(3, zoomMax.value)) {
    nextZoom = zoomMin.value;
  }
  const success = await setZoom(nextZoom);
  if (success) {
    currentZoom.value = nextZoom;
  }
}

async function scanBarcodeItem(index) {
  ensureBarcodeItems();
  if (!props.itemData.barcodeItems[index]) return;

  const uniResult = await scanByUniOrDingTalk();
  if (uniResult.ok) {
    applyBarcodeScanResult(index, uniResult.value, uniResult.format);
    return;
  }
  if (uniResult.canceled) {
    return;
  }

  if (isH5Platform()) {
    await openH5Scanner(index);
    return;
  }

  uni.showModal({
    title: t("扫码提示"),
    content: t("未能调起扫一扫或扫码失败"),
    showCancel: false
  });
}
</script>

<style scoped lang="scss">
@use "../styles/check-item-modal.scss" as *;
</style>
