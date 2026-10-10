<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="260"
    class="quick-defect-popup"
    :style="{ height: '94vh', width: '100%' }"
    @click-overlay="$emit('close')"
  >
    <view class="quick-defect-modal">
      <view class="quick-defect-header">
        <view class="close-btn"  @click.stop="$emit('close')">✕</view>
        <text class="quick-defect-title">{{ editingIndex > -1 ? t('编辑疵点') : t('新增疵点') }}</text>
        <view class="header-camera-btn"  @click.stop="handleHeaderCamera">
          <Icon name="photograph" size="28" color="#1a5f3f" />
        </view>
      </view>

      <view class="quick-defect-body">
        <!-- 媒体库 -->
        <view class="media-section">
          <view class="section-title">
            {{ t('媒体库') }}
          </view>
          <MediaGrid
            ref="mediaGridRef"
            :photos="form.photos || []"
            hide-pending-overlay
            @add="(files) => $emit('add-media', files)"
            @remove="(idx) => $emit('remove-media', idx)"
            @retry="(idx) => $emit('retry-upload', idx)"
            @edit-save="(payload) => $emit('edit-save', payload)"
          />
        </view>

        <!-- 严重性 -->
        <view class="quick-section">
          <view class="quick-label">{{ t('严重性') }}</view>
          <view class="severity-pills">
            <AppButton
              v-for="opt in severityOptions"
              :key="opt.value"
              class="severity-pill"
              :class="{ active: form.type === opt.value }"
              @click.stop="form.type = opt.value"
            >
              {{ opt.label }}
            </AppButton>
          </view>
        </view>

        <!-- 受影响数量 -->
        <view class="quick-section">
          <view class="quick-label">{{ t('受影响的产品数量') }}</view>
          <view class="qty-selector" :class="{ disabled: Number(form.commonFlag || 0) === 1 }">
            <AppButton
              v-for="n in 19"
              :key="n"
              class="qty-item"
              :class="{ active: form.quantity === n }"
              @click.stop="selectQuantity(n)"
            >
              {{ n }}
            </AppButton>
            <AppButton
              class="qty-item qty-other"
              :class="{ active: form.quantity === 'other' }"
              @click.stop="selectQuantity('other')"
            >
              {{ t('其他') }}
            </AppButton>
          </view>
          <input
            v-if="form.quantity === 'other' && Number(form.commonFlag || 0) !== 1"
            v-model="form.customQuantity"
            class="other-qty-input"
            type="number"
            min="1"
            :placeholder="t('请输入数量')"
          />
        </view>

        <!-- 普遍性疵点 -->
        <view class="quick-section">
          <label class="common-toggle-row">
            <text>{{ t('普遍性疵点') }}</text>
            <VanSwitch
              :model-value="Number(form.commonFlag || 0) === 1"
              size="44rpx"
              active-color="#16a34a"
              @update:model-value="onCommonChange"
            />
          </label>
        </view>

        <!-- 疵点类别 -->
        <view class="quick-section">
          <view class="quick-label">
            {{ t('疵点类别') }} <text class="required-mark">{{ t('必选') }}</text>
          </view>
          <view v-if="tierLoading" class="tier-loading">{{ t('正在加载疵点类别...') }}</view>
          <view v-else-if="tierError" class="tier-error">
            <text>{{ tierError }}</text>
            <AppButton class="tier-retry" :disabled="tierRetrying"  @click.stop.prevent="$emit('retry-tier')">
              {{ tierRetrying ? t('重试中...') : t('重试') }}
            </AppButton>
          </view>
          <view v-else class="tier-select-group">
            <AppButton class="category-picker-trigger"  @click.stop="$emit('open-category-picker')">
              <text v-if="form.defectCode || form.defectDesc">{{ form.defectCode }}: {{ form.defectDesc }}</text>
              <text v-else class="placeholder">{{ t('点击以选择疵点类别') }}</text>
              <text>›</text>
            </AppButton>
          </view>
        </view>

        <!-- 写评论 -->
        <view class="quick-section">
          <view class="quick-label">{{ t('写评论') }}</view>
          <textarea
            v-model="form.description"
            class="quick-textarea"
            :placeholder="t('写评论')"
            rows="3"
          ></textarea>
        </view>

        <!-- 关联检查点 -->
        <view v-if="sourceItem.name" class="quick-section">
          <view class="quick-label">{{ t('检查点') }}</view>
          <view class="quick-checkpoint">{{ sourceItem.name }}</view>
        </view>
      </view>

      <view class="quick-defect-footer">
        <AppButton class="quick-btn cancel"  @click.stop="$emit('delete')">
          {{ editingIndex > -1 ? t('删除疵点') : t('取消') }}
        </AppButton>
        <AppButton class="quick-btn save" @click.stop="$emit('save')">
          {{ editingIndex > -1 ? t('保存修改') : t('报告疵点') }}
        </AppButton>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Icon, Switch as VanSwitch, Popup } from 'vant'
import MediaGrid from './MediaGrid.vue'
import 'vant/lib/icon/style'
import 'vant/lib/switch/style'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  editingIndex: { type: Number, default: -1 },
  sourceItem: { type: Object, default: () => ({ id: '', name: '', itemResultId: '' }) },
  severityOptions: { type: Array, default: () => [] },
  form: { type: Object, required: true },
  tierLoading: { type: Boolean, default: false },
  tierError: { type: String, default: '' },
  tierRetrying: { type: Boolean, default: false },
  autoCapture: { type: Boolean, default: false }
})

defineEmits(['close', 'save', 'delete', 'open-category-picker', 'retry-tier', 'add-media', 'remove-media', 'retry-upload', 'edit-save'])

const { t } = useI18n()

const mediaGridRef = ref(null)
let _headerCameraLock = false

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

watch(() => props.visible, (val) => {
  if (val && props.autoCapture && props.editingIndex < 0) {
    nextTick(() => {
      setTimeout(() => mediaGridRef.value?.handleAdd(), 300)
    })
  }
})

function removePhoto(idx) {
  props.form.photos.splice(idx, 1)
}

function selectQuantity(value) {
  if (Number(props.form.commonFlag || 0) === 1) props.form.commonFlag = 0
  props.form.quantity = value
  if (value !== 'other') props.form.customQuantity = ''
}

function onCommonChange(checked) {
  props.form.commonFlag = checked ? 1 : 0
  if (Number(props.form.commonFlag || 0) === 1) {
    props.form.quantity = null
    props.form.customQuantity = ''
  } else if (!props.form.quantity) {
    props.form.quantity = 1
  }
}
</script>

<style scoped lang="scss">
@use '../styles/quick-defect-modal.scss' as *;
</style>
