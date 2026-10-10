<template>
  <view class="tab-content">
    <view v-if="standardItems.length === 0" class="empty-state">
      <view class="empty-icon">📋</view>
      <view class="empty-text">{{ t('暂无检查项') }}</view>
    </view>

    <view v-else class="checklist">
      <view
        v-for="item in standardItems"
        :key="item.id"
        class="checklist-section"
      >
        <view class="section-header" :class="{ 'section-error': isSectionFailed(item) }" @click="toggleSection(item.id)">
          <text class="expand-icon">
            <Icon :name="expandedSections[item.id] ? 'arrow-down' : 'arrow'" size="14" color="#03ae4f" />
          </text>
          <text class="section-title">{{ item.itemName }} ({{ item.children?.length || 0 }})</text>
          <view class="section-progress">
            <view class="section-progress-bar">
              <text v-if="getSectionStats(item).pass > 0" class="section-progress-fill pass" :style="{ width: getSectionStats(item).pass + '%' }"></text>
              <text v-if="getSectionStats(item).pending > 0" class="section-progress-fill pending" :style="{ width: getSectionStats(item).pending + '%' }"></text>
              <text v-if="getSectionStats(item).fail > 0" class="section-progress-fill fail" :style="{ width: getSectionStats(item).fail + '%' }"></text>
              <text v-if="getSectionStats(item).na > 0" class="section-progress-fill na" :style="{ width: getSectionStats(item).na + '%' }"></text>
            </view>
          </view>
        </view>

        <view v-if="expandedSections[item.id]" class="section-children">
          <view v-for="child in item.children" :key="child.id" class="checklist-row-wrap">
            <SwipeCell
              class="checklist-swipe-cell"
              :ref="el => { if (el) swipeCellRefs[cellKey(child.id)] = el }"
              @open="evt => onSwipeCellOpen(evt, child.id)"
            >
              <template #left>
                <view class="swipe-left-action" :class="swipeLeftClass(child.id)">
                  <Icon :name="swipeLeftIcon(child.id)" size="24" color="#fff" />
                  <text>{{ swipeLeftLabel(child.id) }}</text>
                </view>
              </template>

              <view class="check-item-block" :class="checkItemBlockClass(child.id, '')">
                <view
                  class="checklist-item"
                  :id="anchorId(child.id)"
                  :class="[checklistItemClass(child.id), { 'item-required-error': isItemFailed(child.id) }]"
                  @click="$emit('open-item', child)"
                >
                  <view
                    v-if="getItemResult(child.id) && !getItemDefects(child.id).length"
                    class="status-indicator"
                    :class="'indicator-' + getItemResult(child.id)"
                  ></view>
                  <view class="item-left">
                    <view class="item-header-row">
                      <AppButton
                        v-if="hasMergedInspectionPlans"
                        class="sub-expand-btn"
                        @click.stop="toggleItemExpand(child.id)"
                      >
                        <Icon :name="expandedItems[child.id] ? 'arrow-down' : 'arrow'" size="14" color="#111827" />
                      </AppButton>
                      <text v-if="child.itemType === 'Measurements'" class="type-badge">{{ t('规格') }}</text>
                      <text v-else-if="child.itemType === 'Barcodes'" class="type-badge barcode">{{ t('条码') }}</text>
                      <text v-else-if="child.itemType === 'Text'" class="type-badge text">{{ t('文本') }}</text>
                      <view class="item-name">{{ child.itemName }}</view>
                    </view>
                    <!-- <view v-if="child.remarks" class="item-desc">{{ child.remarks }}</view> -->
                  </view>
                  <view class="item-right">
                    <view v-if="hasMergedInspectionPlans && getMergedProgress(child.id).hasResult" class="item-sub-progress">
                      <view class="section-progress-bar">
                        <text v-if="getMergedProgress(child.id).pass > 0" class="section-progress-fill pass" :style="{ width: getMergedProgress(child.id).pass + '%' }"></text>
                        <text v-if="getMergedProgress(child.id).pending > 0" class="section-progress-fill pending" :style="{ width: getMergedProgress(child.id).pending + '%' }"></text>
                        <text v-if="getMergedProgress(child.id).fail > 0" class="section-progress-fill fail" :style="{ width: getMergedProgress(child.id).fail + '%' }"></text>
                        <text v-if="getMergedProgress(child.id).na > 0" class="section-progress-fill na" :style="{ width: getMergedProgress(child.id).na + '%' }"></text>
                      </view>
                    </view>
                    <view
                      class="upload-photo-icon"
                      :class="{ 'has-photo': getItemFirstPhoto(child.id), 'has-pending': getItemHasPendingPhotos(child.id), 'photo-required-error': isPhotoFailed(child.id) }"
                      @click.stop="getItemFirstPhoto(child.id) ? $emit('open-item', child) : $emit('photo-capture', child)"
                    >
                      <img v-if="getItemFirstPhoto(child.id)" :src="getItemFirstPhoto(child.id)" class="photo-thumbnail" loading="lazy" />
                      <Icon v-else name="photograph" size="18" :color="isPhotoFailed(child.id) ? '#ef4444' : '#000'" />
                      <text v-if="child.isPhotoRequired && !getItemFirstPhoto(child.id)" class="required-star">
                        <Icon name="star" size="10" color="#000" />
                      </text>
                      <text v-if="getItemPhotoCount(child.id)" class="photo-count">{{ getItemPhotoCount(child.id) }}</text>
                    </view>
                  </view>
                  <view v-if="getItemComment(child.id)" class="item-comment">{{ getItemComment(child.id) }}</view>
                  <view v-if="getItemDefects(child.id).length" class="item-defect-list">
                  <view
                    v-for="(defect, di) in getItemDefects(child.id)"
                    :key="defect.id || `${child.id}_d${di}`"
                    class="item-defect-row"
                    @click.stop="$emit('open-defect', defect)"
                  >
                    <view class="item-defect-text">{{ getDefectSummary(defect) }}</view>
                      <view v-if="getDefectPhotoCount(defect)" class="item-defect-thumb-wrap">
                        <img :src="getDefectThumb(defect)" class="item-defect-thumb" loading="lazy" />
                        <text class="item-defect-thumb-count">{{ getDefectPhotoCount(defect) }}</text>
                      </view>
                  </view>
                </view>
                </view>

               
              </view>

              <template #right>
                <view class="swipe-right-actions">
                  <view class="swipe-action pass" @click="onSetResult(child, 'pass')"><Icon name="checked" size="32" color="#22c55e" /><text>{{ t('合格') }}</text></view>
                  <view class="swipe-action fail" @click="onSetResult(child, 'fail')"><Icon name="warning" size="32" color="#ef4444" /><text>{{ t('不合格') }}</text></view>
                  <view class="swipe-action pending" @click="onSetResult(child, 'pending')"><Icon name="question-o" size="32" color="#f59e0b" /><text>{{ t('待定') }}</text></view>
                  <view class="swipe-action na" @click="onSetResult(child, 'na')"><Icon name="clear" size="32" color="#64748b" /><text>{{ t('不适用') }}</text></view>
                </view>
              </template>
            </SwipeCell>

            <!-- 合并验货计划子行 -->
            <view v-if="hasMergedInspectionPlans && expandedItems[child.id]" class="inspection-plan-list">
              <SwipeCell
                v-for="(plan, pi) in inspectionPlanRows"
                :key="`${child.id}::${planId(plan) || pi}`"
                class="checklist-swipe-cell inspection-plan-swipe-cell"
                :ref="el => { if (el) swipeCellRefs[cellKey(child.id, planId(plan))] = el }"
                @open="evt => onSwipeCellOpen(evt, child.id, planId(plan))"
              >
                <template #left>
                  <view class="swipe-left-action" :class="swipeLeftClass(child.id, planId(plan))">
                    <Icon :name="swipeLeftIcon(child.id, planId(plan))" size="24" color="#fff" />
                    <text>{{ swipeLeftLabel(child.id, planId(plan)) }}</text>
                  </view>
                </template>

                <view class="check-item-block" :class="checkItemBlockClass(child.id, planId(plan))">
                  <view
                    class="inspection-plan-row checklist-item"
                    :id="anchorId(child.id, planId(plan))"
                    :class="checklistItemClass(child.id, planId(plan))"
                    @click="$emit('open-item', child, planId(plan))"
                  >
                    <view class="item-left">
                      <view class="inspection-plan-meta">
                        <text v-if="child.itemType === 'Measurements'" class="type-badge">{{ t('规格') }}</text>
                        <text v-else-if="child.itemType === 'Barcodes'" class="type-badge barcode">{{ t('条码') }}</text>
                        <text v-else-if="child.itemType === 'Text'" class="type-badge text">{{ t('文本') }}</text>
                      </view>
                      
                      <view class="inspection-plan-order">{{ plan.clientOrderNo || '-' }} :</view>
                      <view class="inspection-plan-goods">{{ plan.subGoodsNo || '-' }}#{{ plan.batchNo || '-' }}</view>
                    </view>
                    <view class="item-right">
                      <view
                        class="upload-photo-icon"
                        :class="{ 'has-photo': getItemFirstPhoto(child.id, planId(plan)), 'has-pending': getItemHasPendingPhotos(child.id, planId(plan)) }"
                        @click.stop="getItemFirstPhoto(child.id, planId(plan)) ? $emit('open-item', child, planId(plan)) : $emit('photo-capture', child, planId(plan))"
                      >
                        <img v-if="getItemFirstPhoto(child.id, planId(plan))" :src="getItemFirstPhoto(child.id, planId(plan))" class="photo-thumbnail" loading="lazy" />
                        <Icon v-else name="photograph" size="18" color="#000" />
                        <text v-if="child.isPhotoRequired && !getItemFirstPhoto(child.id, planId(plan))" class="required-star">
                          <Icon name="star" size="10" color="#000" />
                        </text>
                        <text v-if="getItemPhotoCount(child.id, planId(plan))" class="photo-count">{{ getItemPhotoCount(child.id, planId(plan)) }}</text>
                      </view>
                    </view>
                    <view v-if="getItemComment(child.id, planId(plan))" class="item-comment">{{ getItemComment(child.id, planId(plan)) }}</view>
                  </view>

                  <view v-if="getItemDefects(child.id, planId(plan)).length" class="item-defect-list">
                    <view
                      v-for="(defect, di) in getItemDefects(child.id, planId(plan))"
                      :key="defect.id || `${child.id}_${planId(plan)}_d${di}`"
                      class="item-defect-row item-defect-row-child"
                      @click.stop="$emit('open-defect', defect)"
                    >
                      <view class="item-defect-text">{{ getDefectSummary(defect) }}</view>
                      <view v-if="getDefectPhotoCount(defect)" class="item-defect-thumb-wrap">
                        <img :src="getDefectThumb(defect)" class="item-defect-thumb" loading="lazy" />
                        <text class="item-defect-thumb-count">{{ getDefectPhotoCount(defect) }}</text>
                      </view>
                    </view>
                  </view>
                </view>

                <template #right>
                  <view class="swipe-right-actions">
                    <view class="swipe-action pass" @click="onSetResult(child, 'pass', planId(plan))"><Icon name="checked" size="32" color="#22c55e" /><text>{{ t('合格') }}</text></view>
                    <view class="swipe-action fail" @click="onSetResult(child, 'fail', planId(plan))"><Icon name="warning" size="32" color="#ef4444" /><text>{{ t('不合格') }}</text></view>
                    <view class="swipe-action pending" @click="onSetResult(child, 'pending', planId(plan))"><Icon name="question-o" size="32" color="#f59e0b" /><text>{{ t('待定') }}</text></view>
                    <view class="swipe-action na" @click="onSetResult(child, 'na', planId(plan))"><Icon name="clear" size="32" color="#64748b" /><text>{{ t('不适用') }}</text></view>
                  </view>
                </template>
              </SwipeCell>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="checklist-footer">
      <AppButton class="btn-finish-inspection" @click="$emit('finish')">{{ t('总结并提交') }}</AppButton>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Icon, SwipeCell } from 'vant'
import { getPhotoDisplayUrl, isPhotoRecord } from '../../../utils/photoUpload.js'
import { useI18n } from '../../../utils/i18n.js'
import 'vant/lib/icon/style'
import 'vant/lib/swipe-cell/style'

const { t } = useI18n()

const props = defineProps({
  standardItems: { type: Array, default: () => [] },
  hasMergedInspectionPlans: { type: Boolean, default: false },
  inspectionPlanRows: { type: Array, default: () => [] },
  checklistData: { type: Object, default: () => ({}) },
  defects: { type: Array, default: () => [] },
  severityOptions: { type: Array, default: () => [] },
  failedItemIds: { type: Array, default: () => [] },
  failedPhotoItemIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['open-item', 'open-defect', 'set-result', 'swipe-open', 'photo-input', 'photo-capture', 'finish'])

const expandedSections = ref({})
const expandedItems = ref({})
const swipeCellRefs = {}

watch(() => props.standardItems, (items) => {
  if (items.length > 0 && !Object.keys(expandedSections.value).length) {
    expandedSections.value[items[0].id] = true
  }
}, { immediate: true })

function toggleSection(id) {
  expandedSections.value[id] = !expandedSections.value[id]
}

function toggleItemExpand(id) {
  expandedItems.value[id] = !expandedItems.value[id]
}

function planId(plan) {
  return String(plan?.id || '').trim()
}

function cellKey(itemId, sonPlanId = '') {
  const base = String(itemId || '')
  const son = String(sonPlanId || '').trim()
  return son ? `${base}__${son}` : base
}

function anchorId(itemId, sonPlanId = '') {
  const key = cellKey(itemId, sonPlanId)
  return key ? `check-${key}` : ''
}

function getItemResult(itemId, sonPlanId = '') {
  return props.checklistData[cellKey(itemId, sonPlanId)]?.result || null
}

function getItemPhotoCount(itemId, sonPlanId = '') {
  return props.checklistData[cellKey(itemId, sonPlanId)]?.photos?.length || 0
}

function getItemFirstPhoto(itemId, sonPlanId = '') {
  const photos = props.checklistData[cellKey(itemId, sonPlanId)]?.photos
  if (!photos?.length) return null
  return getPhotoDisplayUrl(photos[0])
}

function getItemComment(itemId, sonPlanId = '') {
  return props.checklistData[cellKey(itemId, sonPlanId)]?.comment || ''
}

function getItemHasPendingPhotos(itemId, sonPlanId = '') {
  const photos = props.checklistData[cellKey(itemId, sonPlanId)]?.photos
  if (!Array.isArray(photos)) return false
  return photos.some(p => isPhotoRecord(p) && p.uploadStatus !== 'done' && p.uploadStatus !== 'uploading' && p.bizId)
}

function getDefectPhotoCount(defect) {
  return Array.isArray(defect?.photos) ? defect.photos.length : 0
}

function getDefectThumb(defect) {
  const photos = Array.isArray(defect?.photos) ? defect.photos : []
  if (!photos.length) return ''
  return getPhotoDisplayUrl(photos[0])
}

const itemDefectMap = computed(() => {
  const map = {}
  props.defects.forEach(d => {
    if (!d?.checkItemId) return
    const checkId = String(d.checkItemId || '')
    // checkItemResultId 是疵点关联的具体 itemResult 行 id（子行为 `${checkItemId}_${sonPlanId}`）
    const rid = String(d?.checkItemResultId || '').trim()
    // 有 checkItemResultId 且与 checkItemId 不同时，说明疵点挂在特定子行上
    const key = (rid && rid !== checkId) ? rid : checkId
    if (!map[key]) map[key] = []
    map[key].push(d)
  })
  return map
})

// sonPlanId 非空时查子行疵点（key = `${itemId}_${sonPlanId}`），否则查主行疵点
function getItemDefects(itemId, sonPlanId = '') {
  const key = sonPlanId ? `${itemId}_${sonPlanId}` : String(itemId)
  return itemDefectMap.value[key] || []
}

function normalizeSeverity(rawValue, rawLabel) {
  const text = `${String(rawValue || '').toLowerCase()} ${String(rawLabel || '').toLowerCase()}`
  if (text.includes('critical') || text.includes('致命') || text.includes('极严重')) return 'CRITICAL'
  if (text.includes('major') || text.includes('主要') || text.includes('严重') || text.includes('大')) return 'MAJOR'
  if (text.includes('minor') || text.includes('次要') || text.includes('轻微') || text.includes('小')) return 'MINOR'
  return String(rawValue || 'MINOR').toUpperCase()
}

function getSeverityLabel(type) {
  const key = normalizeSeverity(type, type)
  const opt = props.severityOptions.find(o => o.value === key)
  if (opt?.label) return opt.label
  return t({ CRITICAL: '致命缺陷', MAJOR: '主要缺陷', MINOR: '次要缺陷' }[key] || key)
}

function getDefectSummary(defect) {
  const severity = getSeverityLabel(defect?.type)
  const category = `${defect?.defectCode || '-'}${defect?.defectDesc ? `:${defect.defectDesc}` : ''}`
  const qty = Number(defect?.quantity || 0)
  const commonFlag = Number(defect?.commonFlag ?? (defect?.isCommon ? 1 : 0))
  const qtyText = commonFlag === 1 ? t('普遍性疵点') : (qty ? t('{count}个受影响数量', { count: qty }) : '')
  const comment = defect?.description || '-'
  return [severity, category, qtyText, comment].filter(p => String(p || '').trim()).join('-')
}

function getSectionStats(section) {
  const children = section.children || []
  if (!children.length) return { pass: 0, fail: 0, pending: 0, na: 0 }
  const total = children.length
  let pass = 0, fail = 0, pending = 0, na = 0
  children.forEach(c => {
    const r = getItemResult(c.id)
    if (r === 'pass') pass++
    else if (r === 'fail') fail++
    else if (r === 'pending') pending++
    else if (r === 'na') na++
  })
  return {
    pass: Math.round((pass / total) * 100),
    fail: Math.round((fail / total) * 100),
    pending: Math.round((pending / total) * 100),
    na: Math.round((na / total) * 100)
  }
}

function getMergedProgress(itemId) {
  const ids = props.inspectionPlanRows.map(p => planId(p)).filter(Boolean)
  if (!ids.length) return { pass: 0, fail: 0, pending: 0, na: 0, hasResult: false }
  let pass = 0, fail = 0, pending = 0, na = 0
  ids.forEach(spid => {
    const r = getItemResult(itemId, spid)
    if (r === 'pass') pass++
    else if (r === 'fail') fail++
    else if (r === 'pending') pending++
    else if (r === 'na') na++
  })
  const total = ids.length
  const hasResult = pass + fail + pending + na > 0
  return {
    pass: Math.round((pass / total) * 100),
    fail: Math.round((fail / total) * 100),
    pending: Math.round((pending / total) * 100),
    na: Math.round((na / total) * 100),
    hasResult
  }
}

function swipeLeftClass(itemId, sonPlanId = '') {
  const r = getItemResult(itemId, sonPlanId)
  return { 'action-pass': !r || r === 'pass', 'action-fail': r === 'fail', 'action-pending': r === 'pending', 'action-na': r === 'na' }
}

function swipeLeftIcon(itemId, sonPlanId = '') {
  const r = getItemResult(itemId, sonPlanId)
  if (!r || r === 'pass') return 'success'
  if (r === 'fail') return 'warning'
  if (r === 'pending') return 'question-o'
  return 'clear'
}

function swipeLeftLabel(itemId, sonPlanId = '') {
  const r = getItemResult(itemId, sonPlanId)
  if (!r || r === 'pass') return t('合格')
  if (r === 'fail') return t('不合格')
  if (r === 'pending') return t('待定')
  return t('不适用')
}

function checkItemBlockClass(itemId, sonPlanId = '') {
  const defects = getItemDefects(itemId, sonPlanId)
  const r = getItemResult(itemId, sonPlanId)
  return { 'has-defects': defects.length > 0, [`defect-${r}`]: !!r && defects.length > 0 }
}

function checklistItemClass(itemId, sonPlanId = '') {
  const r = getItemResult(itemId, sonPlanId)
  const hasDefects = getItemDefects(itemId, sonPlanId).length > 0
  return { [`item-${r}`]: !!r, 'with-defects': hasDefects }
}

async function onSwipeCellOpen(event, itemId, sonPlanId = '') {
  const position = event.position || event
  if (position === 'left') {
    emit('swipe-open', itemId, sonPlanId)
    await nextTick()
    setTimeout(() => {
      swipeCellRefs[cellKey(itemId, sonPlanId)]?.close?.()
    }, 400)
  }
}

async function onSetResult(child, result, sonPlanId = '') {
  await nextTick()
  swipeCellRefs[cellKey(child.id, sonPlanId)]?.close?.()
  emit('set-result', child.id, result, sonPlanId, child)
}


function isItemFailed(itemId) {
  return props.failedItemIds.includes(itemId)
}

function isPhotoFailed(itemId) {
  return props.failedPhotoItemIds.includes(itemId)
}

function isSectionFailed(section) {
  const children = section.children || []
  return children.some(c => isItemFailed(c.id) || isPhotoFailed(c.id))
}
</script>

<style scoped lang="scss">
@use '../styles/checklist.scss' as *;
</style>
