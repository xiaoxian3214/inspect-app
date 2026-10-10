<template>
  <view class="page">
    <text>测试页面 - 如果你能看到这个，说明基本渲染正常</text>
  </view>
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  console.log('Test page mounted!')
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f0f0f0;
  padding: 80rpx;
  font-size: 32rpx;
}
</style>
