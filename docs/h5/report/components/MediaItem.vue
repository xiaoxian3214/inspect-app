<template>
  <view class="media-item" :class="`media-item--${mode}`">
    <!-- <view>视频：{{ isVideo}}</view> -->
    <template v-if="!visible">
      <view class="media-thumb media-lazy-placeholder"></view>
    </template>
    <template v-else-if="isVideo">
      <template v-if="mode === 'preview'">
        <video
          v-if="activated"
          :id="videoId"
          :src="videoSrc"
          class="media-video-player"
          :controls="false"
          playsinline
          webkit-playsinline
          x5-video-player-type="h5"
          x5-video-player-fullscreen="true"
          preload="auto"
          @play="onPlay"
          @pause="onPause"
          @ended="onPause"
          @loadedmetadata="onVideoReady"
          @timeupdate="onVideoReady"
          @error="onVideoError"
        ></video>
        <view v-if="activated && videoLoading" class="video-loading-wrap">
          <view class="video-loading-spinner"></view>
          <text class="video-loading-text">{{ t('加载中...') }}</text>
        </view>
        <view
          class="video-swipe-overlay"
          v-show="activated && !videoLoading && isPlaying"
          @click.stop="togglePlay"
        ></view>
        <view
          v-if="activated && !videoLoading && !isPlaying"
          class="video-play-btn"
          @click.stop="togglePlay"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="#fff"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </view>
        <template v-if="!activated">
          <view style="width: 100%; height: 100%; position: relative;">
            <image v-if="thumbUrl" class="video-poster-preview" :src="thumbUrl" mode="aspectFit" />
            <view v-else class="video-poster-preview video-poster-placeholder">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </view>
            <view class="video-play-btn" @click.stop="activateAndPlay">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="#fff"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </view>
          </view>
        </template>
      </template>
      <template v-else>
        <image
          v-if="thumbUrl"
          class="media-thumb"
          :src="thumbUrl"
          mode="aspectFill"
        />
        <view v-else class="media-thumb video-placeholder">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        </view>
        <view class="video-play-badge">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="#fff"
            style="margin-left: 2px;"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </view>
        <text v-if="media?.duration" class="video-duration">{{
          media.duration
        }}</text>
      </template>
    </template>
    <template v-else>
      <img v-if="mode === 'preview'" class="media-preview-img" :src="imgUrl" />
      <image v-else class="media-thumb" :src="imgUrl" mode="aspectFill" />
    </template>
  </view>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount, getCurrentInstance } from "vue";
import { isVideoMedia, getRawBlob, getPhotoDisplayUrl, getPhotoDisplayUrlAsync, extractVideoCover } from "../../../utils/photoUpload.js";
import { getBlob } from "../../../utils/photoBlobStore.js";
import { getApiBase } from "../../../utils/constants.js";
import { fetchFilePreviewBlob } from "../../../api/report.js";
import { useI18n } from "../../../utils/i18n.js";

const { t } = useI18n();

const props = defineProps({
  media: { type: Object, default: () => ({}) },
  mode: { type: String, default: "thumb" },
  visible: { type: Boolean, default: true }
});

const instance = getCurrentInstance();
const videoId = computed(() => `video-${props.media?._id || props.media?.fileId || Math.random().toString(36).slice(2, 10)}`);
const isPlaying = ref(false);

function onPlay() { isPlaying.value = true; videoLoading.value = false; }
function onPause() { isPlaying.value = false; }

function togglePlay() {
  const ctx = uni.createVideoContext(videoId.value, instance.proxy);
  if (isPlaying.value) {
    ctx.pause();
  } else {
    ctx.play();
  }
}

const activated = ref(false);
const videoSrc = ref("");
const videoLoading = ref(false);
const hasTriedBlobFallback = ref(false);
const localImgUrl = ref("");


let videoBlobUrl = null;

const isVideo = computed(() => isVideoMedia(props.media));
const fileId = computed(() => props.media?.fileId || "");

const thumbUrl = computed(() => {
  if (fileId.value) {
    return `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(fileId.value))}/thumbnail`;
  }
  if (props.media?.coverUrl) return props.media.coverUrl;
  if (props.media?.previewUrl) return props.media.previewUrl;
  return "";
});

const imgUrl = computed(() => {
  if (props.media?.previewUrl) return props.media.previewUrl;
  if (fileId.value) {
    return props.mode === "preview"
      ? `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(fileId.value))}/preview`
      : `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(fileId.value))}/thumbnail`;
  }
  return getPhotoDisplayUrl(props.media, props.mode === "preview" ? "preview" : "thumbnail") || localImgUrl.value || "";
});

async function resolveLocalImageUrl() {
  if (isVideo.value || fileId.value || !props.visible) {
    localImgUrl.value = "";
    return;
  }
  const syncUrl = getPhotoDisplayUrl(props.media, props.mode === "preview" ? "preview" : "thumbnail");
  if (syncUrl) {
    localImgUrl.value = "";
    return;
  }
  const url = await getPhotoDisplayUrlAsync(props.media, props.mode === "preview" ? "preview" : "thumbnail");
  localImgUrl.value = url || "";
}

async function loadVideo() {
  const media = props.media;
  videoLoading.value = false;

  if (fileId.value) {
    videoSrc.value = `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(fileId.value))}/preview`;
    return;
  }

  if (media?.previewUrl) {
    videoSrc.value = media.previewUrl;
    return;
  }

  const localBlob = getRawBlob(media?._id);
  if (localBlob instanceof Blob) {
    revokeVideoBlobUrl();
    videoBlobUrl = URL.createObjectURL(localBlob);
    videoSrc.value = videoBlobUrl;
    return;
  }

  const blobKey = String(media?.blobKey || "").trim();
  if (blobKey) {
    try {
      const dbBlob = await getBlob(blobKey);
      if (dbBlob instanceof Blob && activated.value) {
        revokeVideoBlobUrl();
        videoBlobUrl = URL.createObjectURL(dbBlob);
        videoSrc.value = videoBlobUrl;
        return;
      }
    } catch {}
  }

  videoLoading.value = false;
  return;
}

function onVideoReady() {
  videoLoading.value = false;
}

async function onVideoError() {
  if (!activated.value) return;
  if (!fileId.value) return;
  if (hasTriedBlobFallback.value) return;
  hasTriedBlobFallback.value = true;
  videoLoading.value = true;

  try {
    const blob = await fetchFilePreviewBlob(fileId.value);
    if (!(blob instanceof Blob)) throw new Error("empty blob");
    revokeVideoBlobUrl();
    videoBlobUrl = URL.createObjectURL(blob);
    videoSrc.value = videoBlobUrl;
  } catch {
    videoLoading.value = false;
  }
}

function revokeVideoBlobUrl() {
  if (videoBlobUrl) {
    try {
      URL.revokeObjectURL(videoBlobUrl);
    } catch {}
    videoBlobUrl = null;
  }
}

function cleanupVideo() {
  videoSrc.value = "";
  revokeVideoBlobUrl();
  videoLoading.value = false;
  hasTriedBlobFallback.value = false;
}

watch(fileId, () => {
  activated.value = false;
});

watch(
  () => [
    props.media?._id,
    props.media?.blobKey,
    props.media?.previewUrl,
    props.media?.localPath,
    props.media?.dataUrl,
    props.media?.fileId,
    props.mode,
    props.visible
  ],
  () => {
    resolveLocalImageUrl();
  },
  { immediate: true }
);

async function tryGenerateCover() {
  if (!isVideo.value) return;
  if (props.media?.coverUrl) return;
  if (fileId.value) return;

  let blob = null;
  const rawBlob = getRawBlob(props.media?._id);
  if (rawBlob instanceof Blob) {
    blob = rawBlob;
  } else {
    const blobKey = String(props.media?.blobKey || "").trim();
    if (blobKey) {
      try { blob = await getBlob(blobKey); } catch {}
    }
  }
  if (blob instanceof Blob && !props.media?.coverUrl) {
    const coverBlob = await extractVideoCover(blob);
    if (coverBlob && props.media) {
      props.media.coverUrl = URL.createObjectURL(coverBlob);
    }
  }
}

watch(() => [props.media?.fileId, props.media?._id], () => {
  if (!props.media?.coverUrl) tryGenerateCover();
});

onMounted(() => {
  tryGenerateCover();
});

async function activate() {
  if (activated.value) return;
  activated.value = true;
  isPlaying.value = false;
  await nextTick();
  loadVideo();
}

async function activateAndPlay() {
  await activate();
  await nextTick();
  setTimeout(() => togglePlay(), 0);
}

function deactivate() {
  if (!activated.value) return;
  cleanupVideo();
  activated.value = false;
  isPlaying.value = false;
}

onBeforeUnmount(() => {
  if (activated.value) cleanupVideo();
});

defineExpose({ activate, activateAndPlay, deactivate });
</script>

<style scoped lang="scss">
.media-item {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-lazy-placeholder {
  background: #e2e8f0;
}

.video-placeholder {
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-play-badge {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.video-duration {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  font-size: 20rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 6rpx;
  padding: 2rpx 8rpx;
  line-height: 1.4;
}

.media-item--preview {
  width: 100%;
  height: 100%;
}

.video-poster-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}

.video-poster-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-play-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;

  &:active {
    background: rgba(0, 0, 0, 0.7);
  }
}

.media-preview-img {
  width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.video-loading-wrap {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}

.video-loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.video-loading-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.7);
}

.media-video-player {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

.video-swipe-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 80px;
  z-index: 2;
}
</style>
