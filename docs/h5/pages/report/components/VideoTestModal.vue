<template>
  <view v-if="visible" class="vt-mask">
    <view class="vt-content" @click.stop>
      <view class="vt-header">
        <text class="vt-close" @click="$emit('close')">✕</text>
        <text
          v-if="!isVideo"
          class="vt-edit"
          @click="handleEdit"
        >{{ $t('编辑') }}</text>
        <text v-else class="vt-edit" style="visibility: hidden">{{ $t('编辑') }}</text>
      </view>

      <view class="vt-body">
        <view v-if="isVideo" class="vt-media-area">
          <view ref="videoContainer" class="vt-video-wrap"></view>
          <text v-if="videoError" style="color: #f44336; font-size: 11px; display: block; margin-top: 4px;">{{ videoError }}</text>
        </view>
        <view
          v-else
          class="vt-media-area"
          @touchstart="onTouchStart"
          @touchmove.prevent="onTouchMove"
          @touchend="onTouchEnd"
          @dblclick="onDblClick"
        >
          <img
            v-if="imageSrc"
            class="vt-preview-img"
            :src="imageSrc"
            :style="imgTransformStyle"
            draggable="false"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getApiBase } from '../../../utils/constants.js'
import { isVideoMedia, getPhotoDisplayUrl } from '../../../utils/photoUpload.js'

export default {
  props: {
    visible: { type: Boolean, default: false },
    media: { type: Object, default: () => null }
  },
  emits: ['close', 'edit'],
  data() {
    return {
      videoError: '',
      _currentVideoEl: null,
      _videoCache: {},
      imgScale: 1,
      imgTranslateX: 0,
      imgTranslateY: 0,
      _pinchStartDist: 0,
      _pinchStartScale: 1,
      _lastTapTime: 0,
      _panStartX: 0,
      _panStartY: 0,
      _panStartTX: 0,
      _panStartTY: 0,
      _isPanning: false
    }
  },
  computed: {
    isVideo() {
      const m = this.media
      if (!m) return false
      return isVideoMedia(m) || m.fileType === 'video'
    },
    videoSrc() {
      const m = this.media
      if (!m) return ''
      if (m.fileId) {
        return `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(m.fileId))}/preview`
      }
      if (m.previewUrl) return m.previewUrl
      return ''
    },
    imageSrc() {
      const m = this.media
      if (!m) return ''
      return getPhotoDisplayUrl(m, 'preview') || ''
    },
    imgTransformStyle() {
      return {
        transform: `translate(${this.imgTranslateX}px, ${this.imgTranslateY}px) scale(${this.imgScale})`,
        transition: this._isPanning ? 'none' : 'transform 0.25s ease'
      }
    }
  },
  watch: {
    visible(v) {
      if (v) {
        this.resetImgTransform()
        this.$nextTick(() => this.renderMedia())
      } else {
        this.cleanup()
      }
    }
  },
  methods: {
    renderMedia() {
      if (!this.visible) return
      if (this.isVideo) {
        this.mountVideo()
      }
    },
    getOrCreateVideo(src) {
      if (this._videoCache[src]) return this._videoCache[src]
      const el = document.createElement('video')
      el.controls = true
      el.playsInline = true
      el.setAttribute('webkit-playsinline', 'true')
      el.setAttribute('x5-video-player-type', 'h5')
      el.setAttribute('x5-video-player-fullscreen', 'true')
      el.preload = 'auto'
      el.style.cssText = 'width:100%;max-height:80vh;background:#000;'
      el.onerror = () => {
        const e = el.error
        const msg = e
          ? this.$t('code={code}, message={msg}', { code: e.code, msg: e.message || this.$t('无') })
          : this.$t('未知错误')
        this.videoError = this.$t('播放错误: {msg}', { msg })
      }
      el.src = src
      this._videoCache[src] = el
      return el
    },
    mountVideo() {
      this.videoError = ''
      const src = this.videoSrc
      if (!src) return
      this.$nextTick(() => {
        const el = this.getOrCreateVideo(src)
        const dom = this.$refs.videoContainer?.$el || this.$refs.videoContainer
        if (dom) dom.appendChild(el)
        this._currentVideoEl = el
        el.currentTime = 0
        el.play().catch(() => {})
      })
    },
    handleEdit() {
      if (this.isVideo) return
      this.$emit('edit')
    },
    cleanup() {
      const el = this._currentVideoEl
      if (el) {
        try { el.pause() } catch {}
        try { el.remove() } catch {}
      }
      this._currentVideoEl = null
      this.videoError = ''
    },
    resetImgTransform() {
      this.imgScale = 1
      this.imgTranslateX = 0
      this.imgTranslateY = 0
      this._isPanning = false
    },
    onDblClick(e) {
      if (this.imgScale > 1.05) {
        this.resetImgTransform()
      } else {
        this._isPanning = false
        this.imgScale = 2.5
        this.imgTranslateX = 0
        this.imgTranslateY = 0
      }
    },
    onTouchStart(e) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        this._pinchStartDist = Math.sqrt(dx * dx + dy * dy)
        this._pinchStartScale = this.imgScale
      } else if (e.touches.length === 1) {
        const now = Date.now()
        if (now - this._lastTapTime < 300) {
          this.onDblClick(e)
          this._lastTapTime = 0
          return
        }
        this._lastTapTime = now
        if (this.imgScale > 1.05) {
          this._isPanning = true
          this._panStartX = e.touches[0].clientX
          this._panStartY = e.touches[0].clientY
          this._panStartTX = this.imgTranslateX
          this._panStartTY = this.imgTranslateY
        }
      }
    },
    onTouchMove(e) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (this._pinchStartDist > 0) {
          this._isPanning = true
          let newScale = this._pinchStartScale * (dist / this._pinchStartDist)
          newScale = Math.max(0.5, Math.min(5, newScale))
          this.imgScale = newScale
        }
      } else if (e.touches.length === 1 && this.imgScale > 1.05) {
        this._isPanning = true
        const dx = e.touches[0].clientX - this._panStartX
        const dy = e.touches[0].clientY - this._panStartY
        this.imgTranslateX = this._panStartTX + dx
        this.imgTranslateY = this._panStartTY + dy
      }
    },
    onTouchEnd(e) {
      this._pinchStartDist = 0
      this._isPanning = false
      if (this.imgScale < 1) {
        this.resetImgTransform()
      }
    }
  }
}
</script>

<style scoped>
.vt-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
}
.vt-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.92);
}
.vt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
  height: 88rpx;
  padding-top: env(safe-area-inset-top);
  flex-shrink: 0;
}
.vt-close {
  font-size: 48rpx;
  color: #fff;
  padding: 12rpx 20rpx;
  cursor: pointer;
  min-width: 80rpx;
}
.vt-edit {
  font-size: 28rpx;
  color: #60a5fa;
  padding: 8rpx 16rpx;
  cursor: pointer;
  min-width: 80rpx;
  text-align: right;
  font-weight: 600;
}
.vt-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.vt-media-area {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.vt-video-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vt-preview-img {
  width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  transform-origin: center center;
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}
</style>
