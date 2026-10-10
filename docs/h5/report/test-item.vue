<template>
  <view class="page">
    <view class="header">
      <text class="back" @click="uni.navigateBack()">←</text>
      <text class="title">{{ title }}</text>
      <text class="camera" @click="takePhoto">📷</text>
    </view>

    <scroll-view scroll-y class="body">
      <view class="card">
        <view class="card-title">规格参数</view>
        <view class="row" v-for="f in specs" :key="f.key">
          <text>{{ f.label }}</text>
          <input type="digit" v-model="f.value" placeholder="请输入" />
        </view>
      </view>

      <view class="card">
        <view class="card-title">评论</view>
        <textarea v-model="comment" placeholder="写评论" />
        <view class="photos">
          <view class="photo" v-for="(p,idx) in photos" :key="idx">📷</view>
        </view>
      </view>

      <view class="card">
        <view class="result-row">
          <view v-for="x in resultOptions" :key="x.key" class="res" :class="[x.type,{active:result===x.key}]" @click="result=x.key">
            <text class="sym">{{ x.icon }}</text>
            <text>{{ x.label }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <view class="footer">
      <AppButton class="small" @click="mock('复制检查点')">复制检查点</AppButton>
      <AppButton class="small danger" @click="mock('删除')">删除</AppButton>
      <AppButton class="save" @click="save">保存更新</AppButton>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const title = ref('测试项')
const result = ref('')
const comment = ref('')
const photos = ref([])
const specs = ref([
  { key: 'length', label: '长(CM)', value: '' },
  { key: 'width', label: '宽(CM)', value: '' },
  { key: 'height', label: '高(CM)', value: '' },
  { key: 'weight', label: '毛重(KG)', value: '' }
])

const resultOptions = [
  { key: 'APPROVED', label: '检查-合格', icon: '✓', type: 'ok' },
  { key: 'REJECTED', label: '检查-不合格', icon: '!', type: 'bad' },
  { key: 'PENDING', label: '待定', icon: '?', type: 'wait' },
  { key: 'NA', label: '不适用', icon: '⊘', type: 'na' }
]

function mock(t) { uni.showToast({ title: `${t}待接入`, icon: 'none' }) }
function takePhoto() { photos.value.push({ at: Date.now() }) }
function save() {
  if (!result.value) {
    uni.showToast({ title: '请选择检查结果', icon: 'none' })
    return
  }
  uni.showToast({ title: '已保存', icon: 'success' })
  uni.navigateBack()
}

onLoad((q) => { if (q.title) title.value = decodeURIComponent(q.title) })
</script>

<style scoped>
.page{min-height:100vh;background:#f4f6f8;display:flex;flex-direction:column;}
.header{height:88rpx;background:#07ae4f;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16rpx;}
.back,.camera{font-size:40rpx;width:50rpx;text-align:center;}.title{font-size:34rpx;font-weight:600;}
.body{flex:1;padding:16rpx;}
.card{background:#fff;border-radius:12rpx;padding:16rpx;margin-bottom:12rpx;}
.card-title{font-size:30rpx;font-weight:600;margin-bottom:12rpx;}
.row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10rpx;}
.row input{width:280rpx;height:74rpx;border:2rpx solid #e5e7eb;border-radius:10rpx;padding:0 14rpx;text-align:right;}
textarea{width:100%;min-height:150rpx;border:2rpx solid #e5e7eb;border-radius:10rpx;padding:14rpx;}
.photos{display:flex;gap:10rpx;margin-top:10rpx;}.photo{width:78rpx;height:78rpx;background:#f1f5f9;border-radius:10rpx;display:flex;align-items:center;justify-content:center;}
.result-row{display:flex;gap:10rpx;}
.res{flex:1;aspect-ratio:1;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:22rpx;border:4rpx solid transparent;}
.sym{font-size:42rpx;}
.res.ok{background:#dcfce7;color:#15803d;}.res.bad{background:#fee2e2;color:#dc2626;}.res.wait{background:#fef3c7;color:#b45309;}.res.na{background:#e2e8f0;color:#475569;}
.res.active{border-color:#111827;}
.footer{background:#fff;padding:14rpx;display:grid;grid-template-columns:1fr 1fr;gap:10rpx;}
.small{height:72rpx;line-height:72rpx;border-radius:10rpx;background:#f1f5f9;color:#475569;}
.small.danger{background:#fee2e2;color:#dc2626;}
.save{grid-column:1 / -1;height:84rpx;line-height:84rpx;border-radius:12rpx;background:#03ae4f;color:#fff;}
</style>
