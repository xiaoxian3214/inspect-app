<template>
  <view
    class="app-button"
    :class="{ 'is-disabled': disabled }"
    @click="handleClick"
  >
    <slot />
  </view>
</template>

<script setup>
import { shouldAcceptClick } from '../utils/clickGuard.js'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  },
  debounce: {
    type: Number,
    default: 300
  }
})

const emit = defineEmits(['click'])
let lastAcceptedAt = Number.NEGATIVE_INFINITY

function handleClick(event) {
  if (props.disabled) return

  const now = Date.now()
  if (!shouldAcceptClick(lastAcceptedAt, now, props.debounce)) return

  lastAcceptedAt = now
  emit('click', event)
}
</script>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.app-button.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>
