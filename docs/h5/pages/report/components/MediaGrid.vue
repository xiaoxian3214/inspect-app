<template>
  <view class="media-grid-wrap">
    <view class="media-grid">
      <view
        v-for="(media, idx) in photos"
        :key="media._id || idx"
        :ref="(el) => setThumbRef(idx, el)"
        class="media-grid-item"
        @click="openPreview(idx, $event)"
      >
   <!-- {{ media.fileExt}} -->
        <MediaItem :media="media" mode="thumb" :visible="visibleSet.has(idx)" />
        <view
          v-if="shouldShowStatusBadge(media)"
          class="media-status-badge"
          :class="getUploadStatusClass(media)"
          :aria-label="getUploadStatusText(media)"
          @click.stop="handleStatusBadgeClick(media, idx)"
        >
          <view
            v-if="media.uploadStatus === 'uploading'"
            class="status-upload-light"
          ></view>
          <text
            v-else-if="media.uploadStatus === 'error' || media.uploadStatus === 'needs_attention'"
            class="status-error-icon"
          >!</text>
          <view
            v-else
            class="status-wait-light"
            :class="{ waiting: media.uploadStatus === 'retry_wait' }"
          ></view>
        </view>
        <view class="media-remove-btn" @click.stop="handleRemove(idx)">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            stroke-width="3"
            stroke-linecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </view>
      </view>

      <view
        v-if="!hideAdd"
        class="media-grid-add"
        :class="{ disabled: captureProcessing }"
        @click="handleAdd()"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          stroke-width="1.5"
          stroke-linecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <text class="add-text">{{ t('拍照') }}</text>
      </view>
    </view>
    <Teleport to="body">
      <view v-if="previewVisible" class="preview-mask" @click="closePreview">
        <view class="preview-header" @click.stop>
          <view class="preview-close"  @click.stop="closePreview">✕</view>
          <text class="preview-counter"
            >{{ previewIndex + 1 }} / {{ photos.length }}</text
          >
          <view
            v-if="!isCurrentPreviewVideo"
            class="preview-edit"
            @click.stop="openEditor"
            >{{ t('编辑') }}</view
          >
          <view v-else class="preview-edit" style="visibility: hidden"
            >{{ t('编辑') }}</view
          >
        </view>
        <swiper
          v-if="!isZoomed"
          class="preview-swiper"
          :current="previewIndex"
          @change="onSwiperChange"
        >
          <swiper-item v-for="(media, idx) in photos" :key="media._id || idx">
            <view class="preview-slide" @click="closePreview">
              <template v-if="Math.abs(idx - previewIndex) <= 1">
                <view class="preview-media-wrap" @click.stop
                  @touchstart="idx === previewIndex ? onPreviewTouchStart($event) : null"
                  @touchmove="idx === previewIndex ? onPreviewTouchMove($event) : null"
                  @touchend="idx === previewIndex ? onPreviewTouchEnd($event) : null"
                >
                  <view :style="idx === previewIndex ? previewTransformStyle : ''" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                    <MediaItem :media="media" mode="preview" :ref="(el) => setVideoItemRef(idx, el)" />
                  </view>
                </view>
              </template>
            </view>
          </swiper-item>
        </swiper>

        <view
          v-else
          class="preview-zoomed-container"
          style="flex: 1; width: 100%; height: 100%; overflow: hidden;"
          @click="closePreview"
        >
          <view class="preview-slide" @click.stop>
            <view class="preview-media-wrap"
              @touchstart="onPreviewTouchStart($event)"
              @touchmove.stop.prevent="onPreviewTouchMove($event)"
              @touchend="onPreviewTouchEnd($event)"
            >
              <view :style="previewTransformStyle" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                <MediaItem :media="photos[previewIndex]" mode="preview" />
              </view>
            </view>
          </view>
        </view>
      </view>

      <PhotoEditor
        :visible="editorVisible"
        :photo-src="editorSrc"
        @close="editorVisible = false"
        @save="handleEditorSave"
      />


    </Teleport>
  </view>
</template>

<script setup>
import {
  ref,
  computed,
  shallowRef,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount
} from "vue";
import {
  getPhotoDisplayUrl,
  getPhotoDisplayUrlAsync,
  isVideoMedia
} from "../../../utils/photoUpload.js";
import { createCaptureCompletionGuard } from "../../../utils/mediaCaptureLifecycle.js";
import { getApiBase } from "../../../utils/constants.js";
import PhotoEditor from "./PhotoEditor.vue";
import MediaItem from "./MediaItem.vue";
import dd from "dingtalk-jsapi";
import { useI18n } from "../../../utils/i18n.js";


const MAX_VIDEO_DURATION = 60;
const MAX_VIDEO_SIZE_MB = 200;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

const { t } = useI18n();

function checkVideoDuration(file) {
  return new Promise((resolve) => {
    if (!file.type?.startsWith("video/")) {
      resolve(true);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      try { video.pause(); } catch {}
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      try { URL.revokeObjectURL(url); } catch {}
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve(true);
    }, 5000);
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const ok = video.duration <= MAX_VIDEO_DURATION;
      cleanup();
      resolve(ok);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve(true);
    };
    video.src = url;
  });
}

function isBlobLikeFile(value) {
  return value instanceof File || value instanceof Blob;
}

function inferIsVideo(fileLike, filePath = "", fileType = "") {
  if (String(fileType).toLowerCase() === "video") return true;
  if (/\.(mp4|mov|webm|avi|m4v)$/i.test(String(filePath))) return true;
  const mimeType = String(fileLike?.type || fileType || "").toLowerCase();
  return mimeType.startsWith("video/");
}

function guessMimeType(filePath = "", isVideo = false) {
  const lowerPath = String(filePath).toLowerCase();
  if (lowerPath.endsWith(".png")) return "image/png";
  if (lowerPath.endsWith(".webp")) return "image/webp";
  if (lowerPath.endsWith(".gif")) return "image/gif";
  if (lowerPath.endsWith(".mov")) return "video/quicktime";
  if (lowerPath.endsWith(".webm")) return "video/webm";
  if (lowerPath.endsWith(".avi")) return "video/x-msvideo";
  if (lowerPath.endsWith(".m4v")) return "video/mp4";
  if (lowerPath.endsWith(".mp4")) return "video/mp4";
  return isVideo ? "video/mp4" : "image/jpeg";
}

async function filePathToFile(filePath, { isVideo = false, fileType = "" } = {}) {
  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath || typeof fetch === "undefined") return null;
  try {
    const resp = await fetch(normalizedPath);
    if (!resp.ok) throw new Error(`读取文件失败: ${resp.status}`);
    const blob = await resp.blob();
    const mimeType =
      String(blob.type || "").trim() || guessMimeType(normalizedPath, isVideo);
    const extMatch = normalizedPath.match(/\.([a-z0-9]+)(?:[#?].*)?$/i);
    const ext = extMatch?.[1] || (mimeType.startsWith("video/") ? "mp4" : "jpg");
    const safeType =
      String(fileType || "").toLowerCase().startsWith("video/")
        ? fileType
        : mimeType;
    return new File([blob], `media_${Date.now()}.${ext}`, {
      type: safeType || guessMimeType(normalizedPath, isVideo)
    });
  } catch (error) {
    console.warn("[MediaGrid] 无法将本地路径转换为 File:", normalizedPath, error);
    return null;
  }
}

async function normalizeChooseMediaItem(item) {
  const file = item?.file || item?.tempFile || null;
  const filePath = item?.tempFilePath || item?.path || "";
  const rawFileType = String(item?.fileType || "").trim();
  const isVideo = inferIsVideo(file, filePath, rawFileType);

  let source = null;
  if (isBlobLikeFile(file)) {
    source = file;
    const rawType = String(source?.type || "").trim().toLowerCase();
    if (
      isVideo &&
      (!rawType || rawType === "application/octet-stream" || !rawType.startsWith("video/")) &&
      filePath
    ) {
      const extMatch = String(filePath).match(/\.([a-z0-9]+)(?:[#?].*)?$/i);
      const ext = extMatch?.[1] || "mp4";
      try {
        source = new File([source], `media_${Date.now()}.${ext}`, {
          type: guessMimeType(filePath, true)
        });
      } catch {}
    }
  } else if (filePath) {
    source = await filePathToFile(filePath, { isVideo, fileType: rawFileType });
  }

  if (!isBlobLikeFile(source)) return null;

  return {
    source,
    isVideo,
    duration: item?.duration ? `${Math.round(item.duration)}s` : "",
    size: Number(item?.size || source.size || 0),
    rawDuration: Number(item?.duration || 0)
  };
}

const props = defineProps({
  photos: { type: Array, default: () => [] },
  hideAdd: { type: Boolean, default: false },
  hidePendingOverlay: { type: Boolean, default: false }
});

const emit = defineEmits([
  "add",
  "add-check-point",
  "remove",
  "retry",
  "edit-save",
  "capture-start",
  "capture-end"
]);

const previewVisible = ref(false);
const previewIndex = ref(0);
const editorVisible = ref(false);
const editorSrc = ref("");
const captureBusy = ref(false);
const captureProcessing = ref(false);
let activeCaptureId = 0;
let nextCaptureId = 0;
let captureParentLocked = false;

function finishCapture(captureId = activeCaptureId) {
  if (captureId !== activeCaptureId) return;
  if (!captureBusy.value) return;
  captureBusy.value = false;
  captureProcessing.value = false;
  activeCaptureId = 0;
  if (captureParentLocked) {
    captureParentLocked = false;
    emit("capture-end");
  }
}

function markCaptureProcessing(captureId) {
  if (captureId !== activeCaptureId) return false;
  captureProcessing.value = true;
  if (!captureParentLocked) {
    captureParentLocked = true;
    emit("capture-start");
  }
  return true;
}

const isCurrentPreviewVideo = computed(() => {
  const media = props.photos[previewIndex.value];
  // uni.showToast(media.fileExt,medio)
  // debugger
  if (!media) return false;
  return isVideoMedia(media) || media.fileType === "video";
});



const visibleSet = shallowRef(new Set());
const thumbElMap = new Map();
let observer = null;

function createObserver() {
  if (typeof IntersectionObserver === "undefined") {
    visibleSet.value = new Set(props.photos.map((_, i) => i));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      let changed = false;
      const next = new Set(visibleSet.value);
      for (const entry of entries) {
        const idx = Number(entry.target.dataset?.idx);
        if (Number.isNaN(idx)) continue;
        if (entry.isIntersecting) {
          if (!next.has(idx)) {
            next.add(idx);
            changed = true;
          }
        }
      }
      if (changed) visibleSet.value = next;
    },
    { rootMargin: "200px 0px" }
  );
}

function setThumbRef(idx, el) {
  const dom = el?.$el || el;
  const prev = thumbElMap.get(idx);
  if (prev === dom) return;
  if (prev && observer) observer.unobserve(prev);
  if (dom) {
    if (dom.dataset) dom.dataset.idx = idx;
    thumbElMap.set(idx, dom);
    if (observer) observer.observe(dom);
  } else {
    thumbElMap.delete(idx);
  }
}

onMounted(() => {
  createObserver();
  thumbElMap.forEach((dom) => {
    if (observer) observer.observe(dom);
  });
});

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  thumbElMap.clear();
  revokeAllBlobUrls();
});

const resolvedUrls = ref({});

function getPhotoKey(photo, idx) {
  if (!photo) return `empty_${idx}`;
  return photo._id || photo.blobKey || photo.fileId || `idx_${idx}`;
}

function revokeAllBlobUrls() {
  resolvedUrls.value = {};
}

function resolveUrlAsync(photo, idx, mode) {
  const key = `${getPhotoKey(photo, idx)}_${mode}`;
  const urls = resolvedUrls.value;
  const syncUrl = getPhotoDisplayUrl(photo, mode);
  if (syncUrl) {
    if (urls[key] !== syncUrl) {
      resolvedUrls.value = { ...urls, [key]: syncUrl };
    }
    return syncUrl;
  }
  const cached = urls[key];
  if (cached && !cached.startsWith("blob:")) return cached;
  if (cached && cached.startsWith("blob:") && photo.fileId) {
    const next = { ...urls };
    delete next[key];
    resolvedUrls.value = next;
  }
  getPhotoDisplayUrlAsync(photo, mode).then((url) => {
    if (url) {
      resolvedUrls.value = { ...resolvedUrls.value, [key]: url };
    }
  });
  return resolvedUrls.value[key] || "";
}

function getPreviewUrl(photo, idx) {
  if (!photo) return "";
  if (typeof photo === "string") return photo;
  if (photo.fileId) {
    return `${getApiBase()}/api/inspect/file/${encodeURIComponent(String(photo.fileId))}/preview`;
  }
  return resolveUrlAsync(photo, idx, "preview");
}

let resolveDebounceTimer = null;

watch(
  () =>
    props.photos
      .map((p) => `${p._id || ""}_${p.fileId || ""}_${p.uploadStatus || ""}`)
      .join(","),
  () => {
    clearTimeout(resolveDebounceTimer);
    resolveDebounceTimer = setTimeout(() => {
      const urls = { ...resolvedUrls.value };
      let changed = false;
      for (const key of Object.keys(urls)) {
        if (urls[key]?.startsWith("blob:")) {
          const stillNeeded = props.photos.some((p, i) => {
            const k1 = `${getPhotoKey(p, i)}_thumbnail`;
            const k2 = `${getPhotoKey(p, i)}_preview`;
            return key === k1 || key === k2;
          });
          if (!stillNeeded) {
            delete urls[key];
            changed = true;
          }
        }
      }
      if (changed) resolvedUrls.value = urls;
      props.photos.forEach((photo, idx) => {
        if (visibleSet.value.has(idx) || props.photos.length <= 9) {
          resolveUrlAsync(photo, idx, "thumbnail");
        }
      });
    }, 150);
  },
  { immediate: true }
);

const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
const isZoomed = computed(() => scale.value > 1.05);

let pinchStartDist = 0;
let pinchStartScale = 1;
let lastTapTime = 0;
let singleTapTimer = null;
let panStartX = 0;
let panStartY = 0;
let panStartTX = 0;
let panStartTY = 0;
let isTouchMoved = false;
let touchCount = 0;

const previewTransformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  transition: isTouchMoved ? "none" : "transform 0.25s ease"
}));

function resetZoom() {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
  isTouchMoved = false;
}

function preloadNearbyPreviews(idx) {
  for (
    let i = Math.max(0, idx - 1);
    i <= Math.min(props.photos.length - 1, idx + 1);
    i++
  ) {
    const photo = props.photos[i];
    if (photo && !isVideoMedia(photo)) {
      resolveUrlAsync(photo, i, "preview");
    }
  }
}

function openPreview(idx, e) {
  try { e?.preventDefault?.(); } catch {}
  try { e?.stopPropagation?.(); } catch {}
  previewIndex.value = idx;
  previewVisible.value = true;
  preloadNearbyPreviews(idx);
}

function closePreview() {
  const vRef = videoItemRefs[previewIndex.value];
  if (vRef?.deactivate) vRef.deactivate();
  previewVisible.value = false;
  resetZoom();
}

const videoItemRefs = {};

function setVideoItemRef(idx, el) {
  if (el) videoItemRefs[idx] = el;
  else delete videoItemRefs[idx];
}

function onSwiperChange(e) {
  const prevIdx = previewIndex.value;
  const newIdx = e.detail.current;
  previewIndex.value = newIdx;
  resetZoom();
  const prevRef = videoItemRefs[prevIdx];
  if (prevRef?.deactivate) prevRef.deactivate();
  preloadNearbyPreviews(newIdx);
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onPreviewTouchStart(e) {
  const touches = e.touches || e.changedTouches;
  touchCount = touches.length;
  isTouchMoved = false;

  if (touches.length === 2) {
    pinchStartDist = getTouchDist(touches);
    pinchStartScale = scale.value;
  } else if (touches.length === 1) {
    panStartX = touches[0].clientX;
    panStartY = touches[0].clientY;
    panStartTX = translateX.value;
    panStartTY = translateY.value;
  }
}

function onPreviewTouchMove(e) {
  const touches = e.touches || e.changedTouches;
  isTouchMoved = true;

  if (touches.length === 2) {
    const dist = getTouchDist(touches);
    const newScale = Math.min(
      5,
      Math.max(1, pinchStartScale * (dist / pinchStartDist))
    );
    scale.value = newScale;
    if (newScale <= 1) {
      translateX.value = 0;
      translateY.value = 0;
    }
  } else if (touches.length === 1 && isZoomed.value) {
    const dx = touches[0].clientX - panStartX;
    const dy = touches[0].clientY - panStartY;
    translateX.value = panStartTX + dx;
    translateY.value = panStartTY + dy;
  }
}

function onPreviewTouchEnd(e) {
  const now = Date.now();

  if (scale.value < 1) {
    resetZoom();
    return;
  }

  if (!isTouchMoved && touchCount === 1) {
    const timeSinceLastTap = now - lastTapTime;

    if (timeSinceLastTap < 350 && lastTapTime > 0) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
      lastTapTime = 0;
      if (isZoomed.value) {
        resetZoom();
      } else {
        isTouchMoved = false;
        scale.value = 2.5;
      }
      return;
    }

    lastTapTime = now;
    clearTimeout(singleTapTimer);
    singleTapTimer = setTimeout(() => {
      singleTapTimer = null;
      lastTapTime = 0;
      // Do not close preview on single tap of the media wrap
      // if (!isZoomed.value) {
      //   closePreview();
      // }
    }, 350);
  }
}

function openEditor() {
  const photo = props.photos[previewIndex.value];
  if (!photo) return;
  editorSrc.value = getPreviewUrl(photo, previewIndex.value);
  previewVisible.value = false;
  editorVisible.value = true;
}



function handleEditorSave(dataUrl) {
  editorVisible.value = false;
  emit("edit-save", { index: previewIndex.value, dataUrl });
}

function handleRemove(idx) {
  uni.showModal({
    title: t("删除确认"),
    content: t("确定要删除这张图片吗？"),
    confirmText: t("删除"),
    confirmColor: "#ef4444",
    success: (res) => {
      if (res.confirm) emit("remove", idx);
    }
  });
}

function shouldShowStatusBadge(media) {
  const status = String(media?.uploadStatus || "").toLowerCase();
  if (!status || status === "done" || status === "success" || status === "uploaded") return false;
  if (props.hidePendingOverlay && (status === "pending" || status === "retry_wait")) return false;
  return ["pending", "uploading", "retry_wait", "error", "needs_attention"].includes(status);
}

function getUploadStatusClass(media) {
  const status = String(media?.uploadStatus || "").toLowerCase();
  if (status === "needs_attention") return "error";
  return status;
}

function getUploadStatusText(media) {
  const status = String(media?.uploadStatus || "").toLowerCase();
  if (status === "uploading") return t("正在上传");
  if (status === "retry_wait") return t("网络较差，等待自动上传");
  if (status === "error" || status === "needs_attention") {
    return media?.uploadError || t("上传失败，点击重试");
  }
  return t("已保存到本地，等待同步");
}

function handleStatusBadgeClick(media, idx) {
  const status = String(media?.uploadStatus || "").toLowerCase();
  if (status === "error" || status === "needs_attention") {
    emit("retry", idx);
    return;
  }
  if (typeof uni !== "undefined" && typeof uni.showToast === "function") {
    uni.showToast({ title: getUploadStatusText(media), icon: "none", duration: 2200 });
  }
}

function isDingTalkEnv() {
  if (typeof dd !== 'undefined' && dd?.env?.platform) {
    return dd.env.platform !== 'notInDingTalk';
  }
  return false;
}

function pickViaChooseMedia(captureId, options = {}) {
  const api = isDingTalkEnv() && typeof dd !== "undefined"  ? dd : uni;
  const callbackGuard = createCaptureCompletionGuard(() => finishCapture(captureId));
  api.chooseMedia({
    mediaType: options.mediaType || ["image", "video"],
    sourceType: options.sourceType || ["camera"],
    maxDuration: 60,
    success: async (res) => {
      if (!markCaptureProcessing(captureId)) return;
      callbackGuard.beginResult();
      try {
        let tempFiles = Array.isArray(res?.tempFiles) ? res.tempFiles : [];
        // 兼容钉钉可能返回的 filePaths 格式
        if (!tempFiles.length && Array.isArray(res?.filePaths)) {
          tempFiles = res.filePaths.map(path => ({
            path,
            tempFilePath: path,
            fileType: path.match(/\.(mp4|mov|webm|avi|m4v)$/i) ? 'video' : 'image'
          }));
        } else if (!tempFiles.length && Array.isArray(res?.apFilePaths)) {
          // 兼容支付宝/部分钉钉返回的 apFilePaths
          tempFiles = res.apFilePaths.map(path => ({
            path,
            tempFilePath: path,
            fileType: path.match(/\.(mp4|mov|webm|avi|m4v)$/i) ? 'video' : 'image'
          }));
        }
        if (!tempFiles.length) return;
        const results = [];
        let hasOverDuration = false;
        let hasOverSize = false;
        for (const f of tempFiles) {
          const normalized = await normalizeChooseMediaItem(f);
          if (!normalized) continue;
          if (options.imageOnly && normalized.isVideo) continue;
          if (normalized.isVideo && normalized.size > MAX_VIDEO_SIZE_BYTES) {
            hasOverSize = true;
            continue;
          }
          if (normalized.isVideo && normalized.rawDuration > MAX_VIDEO_DURATION) {
            hasOverDuration = true;
            continue;
          }
          results.push(normalized);
        }
        if (hasOverSize) {
          uni.showToast({
            title: t("视频大小不能超过{size}MB", { size: MAX_VIDEO_SIZE_MB }),
            icon: "none"
          });
        } else if (hasOverDuration) {
          uni.showToast({
            title: t("视频时长不能超过{seconds}秒", { seconds: MAX_VIDEO_DURATION }),
            icon: "none"
          });
        }
        if (!results.length && tempFiles.length) {
          uni.showToast({
            title: t("未获取到可上传的文件对象"),
            icon: "none"
          });
        }
        if (results.length) {
          if (options.imageOnly) emit("add-check-point", results);
          else emit("add", results);
        }
      } finally {
        callbackGuard.finish();
      }
    },
    fail: (err) => {
      console.warn("[MediaGrid] chooseMedia failed:", err);
      callbackGuard.finish();
    },
    complete: () => callbackGuard.complete()
  });
}

function pickViaFileInput(captureId, options = {}) {
  if (typeof document === "undefined") {
    finishCapture(captureId);
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = options.imageOnly ? "image/*" : "image/*,video/*";
  if (options.sourceType?.[0] !== 'album') input.setAttribute("capture", "environment");
  if (options.sourceType?.[0] === 'album') input.multiple = true;
  input.style.display = "none";
  input.onchange = async () => {
    const isCurrentCapture = markCaptureProcessing(captureId);
    if (input.parentNode) input.parentNode.removeChild(input);
    if (!isCurrentCapture) return;
    try {
      const files = input.files ? Array.from(input.files) : [];
      if (options.imageOnly) {
        const images = files.filter((file) =>
          String(file.type || '').startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '')
        );
        if (images.length) emit("add-check-point", images.map((source) => ({ source, isVideo: false })));
        return;
      }
      const file = files.find((item) => {
        const mimeType = String(item?.type || "").toLowerCase();
        return mimeType.startsWith("image/") || inferIsVideo(item, item?.name, mimeType);
      }) || files[0];
      if (!file) return;
      const isVideo = inferIsVideo(file, file.name, file.type);
      if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        uni.showToast({
          title: t("视频大小不能超过{size}MB", { size: MAX_VIDEO_SIZE_MB }),
          icon: "none"
        });
        return;
      }
      if (isVideo && !(await checkVideoDuration(file))) {
        uni.showToast({
          title: t("视频时长不能超过{seconds}秒", { seconds: MAX_VIDEO_DURATION }),
          icon: "none"
        });
        return;
      }
      emit("add", [{
        source: file,
        isVideo,
        mediaType: isVideo ? "video" : "image",
        fileType: file.type || (isVideo ? "video" : "image"),
        duration: ""
      }]);
    } finally {
      finishCapture(captureId);
    }
  };
  input.oncancel = () => {
    if (input.parentNode) input.parentNode.removeChild(input);
    finishCapture(captureId);
  };
  if (typeof window !== "undefined") {
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (captureId === activeCaptureId && !captureProcessing.value && input.parentNode) {
            input.parentNode.removeChild(input);
            finishCapture(captureId);
          }
        }, 500);
      },
      { once: true }
    );
  }
  document.body.appendChild(input);
  input.click();
}

function handleAdd(options = {}) {
  if (captureBusy.value) {
    if (captureProcessing.value) return;
    finishCapture(activeCaptureId);
  }
  const captureId = ++nextCaptureId;
  activeCaptureId = captureId;
  captureBusy.value = true;
  captureProcessing.value = false;
  const isDingTalk = isDingTalkEnv();
  try {
    if (
      (isDingTalk && typeof dd !== "undefined" && typeof dd.chooseMedia === "function") ||
      (!isDingTalk && typeof uni !== "undefined" && typeof uni.chooseMedia === "function")
    ) {
      pickViaChooseMedia(captureId, options);
    } else {
      pickViaFileInput(captureId, options);
    }
  } catch (error) {
    finishCapture(captureId);
    throw error;
  }
}


function pickCheckPointImage(sourceType) {
  handleAdd({ sourceType: [sourceType], mediaType: ["image"], imageOnly: true });
}

defineExpose({ handleAdd, captureFromCamera: handleAdd, pickCheckPointImage });
</script>

<style scoped lang="scss">
.media-grid-wrap {
  width: 100%;
}

.media-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.media-grid-item {
  position: relative;
  width: calc((100% - 24rpx) / 3);
  aspect-ratio: 1;
  border-radius: 12rpx;
  overflow: hidden;
  background: #f5f5f5;
  cursor: pointer;
}

.media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.media-status-badge {
  position: absolute;
  top: 8rpx;
  left: 8rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  cursor: pointer;
  box-sizing: border-box;
  border: none;
  background: transparent;

  &::after {
    content: "";
    position: absolute;
    inset: -12rpx;
  }

  &.error {
    background: rgba(220, 38, 38, 0.94);
    border: 2rpx solid rgba(255, 255, 255, 0.92);
    box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.28);
  }
}

.status-upload-light,
.status-wait-light {
  width: 18rpx;
  height: 18rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.96);
  border-radius: 50%;
  animation: statusBreath 1.35s ease-in-out infinite;
}

.status-upload-light {
  background: #2563eb;
  box-shadow: 0 0 8rpx 3rpx rgba(37, 99, 235, 0.72);
}

.status-wait-light {
  background: #f59e0b;
  box-shadow: 0 0 8rpx 3rpx rgba(245, 158, 11, 0.72);
}

@keyframes statusBreath {
  0%,
  100% {
    opacity: 0.58;
    transform: scale(0.82);
  }
  50% {
    opacity: 1;
    transform: scale(1.12);
  }
}

.status-error-icon {
  font-size: 26rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.media-remove-btn {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 32rpx;
  height: 32rpx;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.media-grid-add {
  width: calc((100% - 24rpx) / 3);
  aspect-ratio: 1;
  border-radius: 12rpx;
  border: 2rpx dashed #d1d5db;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  cursor: pointer;
  background: #fafafa;
  transition: background 0.2s;

  &.disabled {
    opacity: 0.55;
    pointer-events: none;
  }

  &:active {
    background: #f0f0f0;
  }
}

.add-text {
  font-size: 20rpx;
  color: #94a3b8;
}
</style>

<style lang="scss">
/* 预览弹窗 - 非 scoped，因为通过 Teleport 渲染到 body */
.preview-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32rpx;
  height: 88rpx;
  padding-top: env(safe-area-inset-top);
  flex-shrink: 0;
  position: relative;
  z-index: 20;
}

.preview-close {
  width: 104rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52rpx;
  color: #fff;
  cursor: pointer;
}

.preview-counter {
  font-size: 30rpx;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.preview-edit {
  font-size: 28rpx;
  color: #60a5fa;
  padding: 8rpx 16rpx;
  cursor: pointer;
  min-width: 80rpx;
  text-align: right;
  font-weight: 600;
}

.preview-swiper {
  flex: 1;
  width: 100%;
}

.preview-slide {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-video-play-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.preview-video-container {
  width: 100%;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-media-wrap {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  overflow: hidden;
}

.preview-img-transform {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  will-change: transform;
}

.preview-video-wrap {
  touch-action: pan-x;
  width: 100%;
  height: 100%;
}

.preview-zoomed-container {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
