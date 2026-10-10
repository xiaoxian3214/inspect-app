<template>
  <Popup
    :show="visible"
    position="bottom"
    round
    :z-index="270"
    class="category-picker-popup"
    :style="{ height: '76vh', width: '100%' }"
    @click-overlay="$emit('close')"
  >
    <view class="category-drawer">
      <view class="category-drawer-header">
        <AppButton class="drawer-nav-btn" @click="$emit('back')">‹</AppButton>
        <text class="drawer-title">选择疵点类别（{{ step }}/3）</text>
        <AppButton class="drawer-nav-btn" @click="$emit('close')">✕</AppButton>
      </view>

      <view class="category-breadcrumb">
        <text class="breadcrumb-step" :class="{ active: step === 1 }">一级</text>
        <text class="breadcrumb-separator">›</text>
        <text class="breadcrumb-step" :class="{ active: step === 2 }">二级</text>
        <text class="breadcrumb-separator">›</text>
        <text class="breadcrumb-step" :class="{ active: step === 3 }">三级</text>
      </view>

      <view class="category-search-wrap">
        <input
          :value="searchKeyword"
          class="category-search-input"
          placeholder="搜索 code / name"
          @input="$emit('update:searchKeyword', $event.target.value)"
        />
        <text v-if="searchKeyword" class="category-search-clear" @click="$emit('update:searchKeyword', '')">✕</text>
      </view>

      <view v-if="recentHistory.length > 0" class="recent-history-wrap">
        <view class="recent-history-title">最近使用</view>
        <view class="recent-history-list">
          <AppButton
            v-for="item in recentHistory"
            :key="item.defectCode"
            class="recent-history-item"
            @click="$emit('apply-recent', item)"
          >
            {{ item.defectCode }} - {{ item.defectDesc }}
          </AppButton>
        </view>
      </view>

      <view class="category-list">
        <AppButton
          v-for="node in filteredOptions"
          :key="node.code"
          class="category-item"
          @click="$emit('select', node)"
        >
          <text>{{ node.code }} - {{ node.name }}</text>
          <text v-if="step !== 3">›</text>
        </AppButton>
        <view v-if="!filteredOptions.length" class="category-empty">
          当前层级暂无可选项
        </view>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { Popup } from 'vant'
import 'vant/lib/popup/style'

defineProps({
  visible: { type: Boolean, default: false },
  step: { type: Number, default: 1 },
  searchKeyword: { type: String, default: '' },
  recentHistory: { type: Array, default: () => [] },
  filteredOptions: { type: Array, default: () => [] }
})

defineEmits(['close', 'back', 'select', 'update:searchKeyword', 'apply-recent'])
</script>

<style scoped lang="scss">
@use '../styles/category-picker.scss' as *;
</style>
