<template>
  <section v-if="interactiveEnabled" class="panel report-upload-panel">
    <view class="report-upload-head">
      <view>
        <view class="panel-title">{{ t('新增图片') }}</view>
        <view class="upload-subtitle">{{ t('选择疵点项或检查点项后上传图片') }}</view>
      </view>
      <button class="upload-action-btn" :disabled="uploading" @click="openPicker">
        {{ uploading ? t('上传中...') : t('新增图片') }}
      </button>
    </view>

    <Popup
      :show="showPicker"
      position="bottom"
      round
      :z-index="3200"
      class="report-upload-popup"
      :style="{ height: '84vh', width: '100%' }"
      @click-overlay="closePicker"
    >
      <view class="report-upload-modal">
        <view class="report-upload-header">
          <view class="close-btn" @click.stop="closePicker">✕</view>
          <text class="report-upload-title">{{ currentStep === 1 ? t('选择上传类型') : pickerTitle }}</text>
          <view class="header-placeholder"></view>
        </view>

        <view class="report-upload-body">
          <view v-if="currentStep === 1" class="kind-list">
            <view class="kind-card" @click="selectKind('defect')">
              <text class="kind-title">{{ t('疵点项') }}</text>
              <text class="kind-desc">{{ t('给报告中的疵点继续新增图片') }}</text>
            </view>
            <view class="kind-card" @click="selectKind('checklist')">
              <text class="kind-title">{{ t('检查点项') }}</text>
              <text class="kind-desc">{{ t('给报告中的检查点继续新增图片') }}</text>
            </view>
          </view>

          <view v-else class="target-list-wrap">
            <view v-if="!currentTargets.length" class="state-wrap">
              <text class="state-text">{{ emptyText }}</text>
            </view>
            <scroll-view v-else scroll-y class="target-scroll">
              <view
                v-for="target in currentTargets"
                :key="target.key"
                class="target-row"
                @click="handleTargetSelect(target)"
              >
                <view class="target-main">
                  <text class="target-name">{{ target.label }}</text>
                  <text v-if="target.subLabel" class="target-sub">{{ target.subLabel }}</text>
                </view>
                <text class="target-arrow">›</text>
              </view>
            </scroll-view>
          </view>
        </view>

        <view class="report-upload-footer">
          <button v-if="currentStep === 2" class="footer-btn secondary" :disabled="uploading" @click="goBack">{{ t('上一步') }}</button>
          <button class="footer-btn" :disabled="uploading" @click="closePicker">{{ t('取消') }}</button>
        </view>
      </view>
    </Popup>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Popup } from 'vant'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'
import { makePhotoRecord, makePhotoRecordFromBlob, processPendingUploads } from '../../../utils/photoUpload.js'
import { canEnableInteractiveFooter, buildUploadTargets } from '../utils/detailPcInteractive.mjs'

const props = defineProps({
  pageQuery: { type: Object, default: () => ({}) },
  reportId: { type: String, default: '' },
  standardItems: { type: Array, default: () => [] },
  inspectionPlanRows: { type: Array, default: () => [] },
  itemResults: { type: Array, default: () => [] },
  checklistData: { type: Object, default: () => ({}) },
  defects: { type: Array, default: () => [] },
  hasMergedInspectionPlans: { type: Boolean, default: false }
})

const emit = defineEmits(['uploaded'])

const { t } = useI18n()

const showPicker = ref(false)
const currentStep = ref(1)
const selectedKind = ref('')
const uploading = ref(false)

const interactiveEnabled = computed(() => {
  return canEnableInteractiveFooter({ pageQuery: props.pageQuery, reportId: props.reportId })
})

const uploadTargets = computed(() => buildUploadTargets({
  standardItems: props.standardItems,
  inspectionPlanRows: props.inspectionPlanRows,
  itemResults: props.itemResults,
  defects: props.defects,
  hasMergedInspectionPlans: props.hasMergedInspectionPlans,
  t
}))

const currentTargets = computed(() => {
  return selectedKind.value === 'defect'
    ? uploadTargets.value.defectItems
    : uploadTargets.value.checklistItems
})

const defaultSubGoodsNo = computed(() => {
  return String(props.inspectionPlanRows?.[0]?.subGoodsNo || '').trim()
})

const pickerTitle = computed(() => selectedKind.value === 'defect' ? t('选择疵点项') : t('选择检查点项'))

const emptyText = computed(() => selectedKind.value === 'defect' ? t('暂无疵点记录') : t('暂无检查点'))

function openPicker() {
  if (!interactiveEnabled.value || uploading.value) return
  currentStep.value = 1
  selectedKind.value = ''
  showPicker.value = true
}

function closePicker() {
  if (uploading.value) return
  showPicker.value = false
  currentStep.value = 1
  selectedKind.value = ''
}

function selectKind(kind) {
  selectedKind.value = kind
  currentStep.value = 2
}

function goBack() {
  if (uploading.value) return
  currentStep.value = 1
}

function notify(message) {
  const text = String(message || '').trim()
  if (!text) return
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({ title: text, icon: 'none', duration: 2400 })
    return
  }
  if (typeof globalThis.showToast === 'function') {
    globalThis.showToast(text)
    return
  }
  console.log(text)
}

function normalizeSelectedMediaToFile(file) {
  if (file instanceof File || file instanceof Blob) return file
  const tempPath = file?.tempFilePath || file?.path || (typeof file === 'string' ? file : '')
  if (!tempPath) throw new Error(t('未识别的文件对象'))
  return tempPath
}

const MAX_VIDEO_DURATION = 60
const MAX_VIDEO_SIZE_MB = 200
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024

function pickLocalFiles() {
  if (typeof uni !== 'undefined' && typeof uni.chooseMedia === 'function') {
    return new Promise((resolve, reject) => {
      uni.chooseMedia({
        count: 9,
        mediaType: ['image', 'video'],
        sourceType: ['camera'],
        maxDuration: MAX_VIDEO_DURATION,
        success: (res) => {
          const files = Array.isArray(res?.tempFiles) ? res.tempFiles : []
          const filtered = []
          let hasOverDuration = false
          let hasOverSize = false
          for (const file of files) {
            const isVideo = file.fileType === 'video'
              || /\.(mp4|mov|webm|avi|m4v)$/i.test(file.tempFilePath || '')
              || (file.file && file.file.type && file.file.type.startsWith('video/'))
            if (isVideo && file.duration && file.duration > MAX_VIDEO_DURATION) {
              hasOverDuration = true
              continue
            }
            if (isVideo && file.size && file.size > MAX_VIDEO_SIZE_BYTES) {
              hasOverSize = true
              continue
            }
            filtered.push(file)
          }
          if (hasOverDuration) notify(`视频时长不能超过${MAX_VIDEO_DURATION}秒`)
          else if (hasOverSize) notify(`视频大小不能超过${MAX_VIDEO_SIZE_MB}MB`)
          resolve(filtered)
        },
        fail: (error) => {
          if (String(error?.errMsg || '').includes('cancel')) { resolve([]); return }
          reject(error)
        }
      })
    })
  }

  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve([])
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.multiple = true
    input.setAttribute('capture', 'environment')
    input.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
    document.body.appendChild(input)
    const cleanup = () => { input.onchange = null; input.parentNode?.removeChild(input) }
    input.onchange = (event) => {
      cleanup()
      const files = event.target.files ? Array.from(event.target.files) : []
      resolve(files)
    }
    input.click()
  })
}

function ensureChecklistBucket(target) {
  const key = String(target?.dataKey || '').trim()
  if (!key) return null
  if (!props.checklistData[key] || typeof props.checklistData[key] !== 'object') {
    props.checklistData[key] = {
      result: '',
      comment: '',
      barcodeList: [],
      barcodeItems: [],
      measurements: [],
      textGroups: [],
      photos: []
    }
  }
  if (!Array.isArray(props.checklistData[key].photos)) props.checklistData[key].photos = []
  return props.checklistData[key]
}

function findDefect(target) {
  return props.defects.find(defect => String(defect?.id || '').trim() === String(target?.id || '').trim()) || null
}

async function createRecord(source, params) {
  if (source instanceof File || source instanceof Blob) {
    return makePhotoRecordFromBlob(source, params)
  }
  return makePhotoRecord(source, params)
}

async function handleTargetSelect(target) {
  if (uploading.value) return
  try {
    const files = await pickLocalFiles()
    if (!files.length) return
    uploading.value = true
    if (selectedKind.value === 'defect') {
      await appendDefectFiles(target, files)
    } else {
      await appendChecklistFiles(target, files)
    }
    await processPendingUploads(props.checklistData, props.defects, () => Promise.resolve())
    notify(t('上传成功'))
    emit('uploaded', { kind: selectedKind.value, target })
    closePicker()
  } catch (error) {
    console.error('报告页上传图片失败:', error)
    notify(error?.message || t('上传图片失败，请重试'))
  } finally {
    uploading.value = false
  }
}

async function appendChecklistFiles(target, files) {
  const bucket = ensureChecklistBucket(target)
  if (!bucket) throw new Error(t('未找到检查点'))
  const subGoodsNo = resolveTargetSubGoodsNo(target)
  for (const file of files) {
    const source = normalizeSelectedMediaToFile(file)
    const sortNo = bucket.photos.length + 1
    const record = await createRecord(source, {
      bizId: target.bizId,
      bizType: 'checkResult',
      subGoodsNo,
      sortNo
    })
    bucket.photos.push(record)
  }
}

async function appendDefectFiles(target, files) {
  const defect = findDefect(target)
  if (!defect) throw new Error(t('未找到疵点'))
  if (!Array.isArray(defect.photos)) defect.photos = []
  const subGoodsNo = resolveTargetSubGoodsNo(target, defect?.subGoodsNo)
  for (const file of files) {
    const source = normalizeSelectedMediaToFile(file)
    const sortNo = defect.photos.length + 1
    const record = await createRecord(source, {
      bizId: target.bizId,
      bizType: 'defect',
      subGoodsNo,
      sortNo
    })
    defect.photos.push(record)
  }
}

function resolveTargetSubGoodsNo(target, fallback = '') {
  const direct = String(target?.subGoodsNo || fallback || '').trim()
  if (direct) return direct
  const sonPlanId = String(target?.sonPlanId || '').trim()
  if (sonPlanId) {
    const matchedPlan = (props.inspectionPlanRows || []).find(
      plan => String(plan?.id || plan?.planId || '').trim() === sonPlanId
    )
    const matchedSubGoodsNo = String(matchedPlan?.subGoodsNo || '').trim()
    if (matchedSubGoodsNo) return matchedSubGoodsNo
  }
  return defaultSubGoodsNo.value
}
</script>

<style scoped lang="scss">
.report-upload-panel {
  margin-top: 18px;
}

.report-upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.upload-subtitle {
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
}

.upload-action-btn,
.footer-btn {
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
}

.upload-action-btn:disabled,
.footer-btn:disabled {
  opacity: .55;
}

.report-upload-modal {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.report-upload-header,
.report-upload-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #eef2f7;
}

.report-upload-footer {
  border-bottom: none;
  border-top: 1px solid #eef2f7;
  justify-content: flex-end;
  gap: 10px;
}

.close-btn,
.header-placeholder {
  width: 44px;
  text-align: center;
  color: #94a3b8;
}

.report-upload-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.report-upload-body {
  flex: 1;
  min-height: 0;
  padding: 18px 20px;
}

.kind-list {
  display: grid;
  gap: 14px;
}

.kind-card,
.target-row {
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  cursor: pointer;
}

.kind-card:hover,
.target-row:hover {
  background: #f8fbff;
  border-color: #bfdbfe;
}

.kind-title,
.target-name {
  display: block;
  color: #0f172a;
  font-size: 15px;
  font-weight: 700;
}

.kind-desc,
.target-sub,
.state-text {
  display: block;
  margin-top: 6px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.target-scroll {
  height: 100%;
}

.target-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.target-main {
  min-width: 0;
  flex: 1;
}

.target-arrow {
  color: #94a3b8;
  font-size: 22px;
}

.state-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
}

.secondary {
  background: #e2e8f0;
  color: #334155;
}
</style>
