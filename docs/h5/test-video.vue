<template>
  <div style="padding: 20px;">
    <div style="margin-bottom: 10px; font-size: 14px; word-break: break-all;">{{ log }}</div>
    <!-- <video
      v-if="videoSrc"
      :src="videoSrc"
      controls
      playsinline
      webkit-playsinline
      preload="auto"
      style="width: 100%;"
    ></video> -->
     <video
      :src="'http://hunk:7260/qcm/api/inspect/file/2057343370862264321/preview'"
      controls
      playsinline
      webkit-playsinline
      preload="auto"
      style="width: 100%;"
    ></video>
  </div>
</template>

<script>
import { getApiBase } from '../utils/constants.js'

export default {
  data() {
    return {
      log: '页面加载中...',
      videoSrc: ''
    }
  },
  mounted() {
    this.testStream()
  },
  beforeDestroy() {
    if (this.videoSrc) URL.revokeObjectURL(this.videoSrc)
  },
  methods: {
    // async testStream() {
    //   const base = getApiBase()
    //   const url = `${base}/api/inspect/file/2056332376648237057/preview`
    //   this.log = '请求地址: ' + url

    //   try {
    //     const token = localStorage.getItem('access_token')
    //     const headers = {}
    //     if (token) headers['Authorization'] = `Bearer ${token}`

    //     const resp = await fetch(url, { method: 'GET', headers })
    //     this.log = `状态: ${resp.status}, Content-Type: ${resp.headers.get('content-type')}`

    //     if (!resp.ok) {
    //       this.log += ' | 请求失败'
    //       return
    //     }

    //     const blob = await resp.blob()
    //     this.log += ` | Blob size: ${blob.size}, type: ${blob.type}`

    //     if (blob.size > 0) {
    //       this.videoSrc = URL.createObjectURL(blob)
    //       this.log += ' | 已转为视频地址'
    //     } else {
    //       this.log += ' | 返回内容为空'
    //     }
    //   } catch (e) {
    //     this.log = '出错: ' + e.message
    //   }
    // }
  }
}
</script>
