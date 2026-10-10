<template>
  <view class="page">
    <view class="header">
      <view class="header-left">
        <h1>验货报告列表</h1>
        <text class="user-info">{{ userDisplayName }}</text>
      </view>
      <AppButton class="logout-btn" @click="logout">退出</AppButton>
    </view>

    <view class="content">
      <view class="empty" v-if="reports.length === 0">
        <view class="empty-icon">📋</view>
        <view class="empty-text">暂无验货报告</view>
        <AppButton class="create-btn" @click="createReport">创建报告</AppButton>
      </view>

      <view class="report-list" v-else>
        <view
          v-for="report in reports"
          :key="report.id"
          class="report-item"
          @click="viewReport(report)"
        >
          <view class="report-title">{{ report.title }}</view>
          <view class="report-info">
            <text class="report-date">{{ report.date }}</text>
            <text class="report-status" :class="'status-' + report.status">
              {{ report.statusText }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../../store/auth.js'

const authStore = useAuthStore()

const reports = ref([
  {
    id: 1,
    title: '产品验货报告 #001',
    date: '2026-04-13',
    status: 'completed',
    statusText: '已完成'
  },
  {
    id: 2,
    title: '产品验货报告 #002',
    date: '2026-04-12',
    status: 'pending',
    statusText: '进行中'
  }
])

// 获取当前用户信息
const currentUser = computed(() => authStore.user)
const userDisplayName = computed(() => {
  return currentUser.value?.realName || currentUser.value?.userName || '用户'
})

onMounted(() => {
  console.log('当前用户:', currentUser.value)
})

async function logout() {
  if (confirm('确定要退出登录吗？')) {
    await authStore.logout()
    uni.reLaunch({ url: '/pages/login/login' })
  }
}

function createReport() {
  globalThis.showToast('创建报告功能待实现')
}

function viewReport(report) {
  globalThis.showToast(`查看报告: ${report.title}`)
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  background: #fff;
  padding: 32rpx 40rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.header h1 {
  font-size: 40rpx;
  font-weight: 600;
  color: #1f2937;
}

.user-info {
  font-size: 28rpx;
  color: #6b7280;
  padding: 8rpx 24rpx;
  background: #f3f4f6;
  border-radius: 24rpx;
}

.logout-btn {
  padding: 16rpx 32rpx;
  border: 2rpx solid #e5e7eb;
  border-radius: 16rpx;
  background: #fff;
  color: #6b7280;
  font-size: 28rpx;
  cursor: pointer;
}

.logout-btn:hover {
  background: #f9fafb;
  border-color: #00b050;
  color: #00b050;
}

.content {
  padding: 40rpx;
}

.empty {
  text-align: center;
  padding: 120rpx 40rpx;
}

.empty-icon {
  font-size: 128rpx;
  margin-bottom: 32rpx;
}

.empty-text {
  font-size: 32rpx;
  color: #9ca3af;
  margin-bottom: 48rpx;
}

.create-btn {
  padding: 24rpx 64rpx;
  border: none;
  border-radius: 24rpx;
  background: linear-gradient(90deg, #00b050, #009245);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  cursor: pointer;
}

.create-btn:hover {
  opacity: 0.9;
}

.report-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.report-item {
  background: #fff;
  padding: 32rpx;
  border-radius: 24rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.report-item:hover {
  box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  transform: translateY(-4rpx);
}

.report-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16rpx;
}

.report-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.report-date {
  font-size: 28rpx;
  color: #6b7280;
}

.report-status {
  padding: 8rpx 24rpx;
  border-radius: 12rpx;
  font-size: 24rpx;
  font-weight: 500;
}

.status-completed {
  background: #d1fae5;
  color: #065f46;
}

.status-pending {
  background: #fef3c7;
  color: #92400e;
}
</style>
