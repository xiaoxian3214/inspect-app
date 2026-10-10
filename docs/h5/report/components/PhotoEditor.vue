<template>
  <Popup
    :show="visible"
    position="bottom"
    :z-index="280"
    class="photo-editor-popup"
    :style="{ height: '100vh', width: '100%' }"
  >
    <view class="photo-editor-modal">
      <view class="editor-header">
        <AppButton class="header-btn" @click="handleCancel">{{ t('取消') }}</AppButton>
        <text class="header-title">{{ t('编辑照片') }}</text>
        <AppButton class="header-btn save" @click="handleSave">{{ t('保存') }}</AppButton>
      </view>

      <view class="editor-body" ref="editorBodyRef"></view>

      <view class="editor-toolbar">
        <view
          v-for="tool in tools"
          :key="tool.id"
          class="tool-item"
          :class="{ active: currentTool === tool.id }"
          @click="selectTool(tool.id)"
        >
          <text class="tool-icon">{{ tool.icon }}</text>
          <text class="tool-label">{{ tool.label }}</text>
        </view>
      </view>

      <view v-if="showColorBar" class="sub-toolbar">
        <view class="color-selector">
          <view
            v-for="c in colorOptions"
            :key="c"
            class="color-dot"
            :class="{ active: activeColor === c }"
            :style="{ background: c }"
            @click="activeColor = c"
          ></view>
        </view>
      </view>

      <view v-if="showTextInput" class="text-input-overlay" @click.self="cancelTextInput">
        <view class="text-input-box">
          <input
            ref="textInputElRef"
            v-model="textInputValue"
            class="text-input"
            :placeholder="t('输入文字')"
            @keyup.enter="confirmTextInput"
          />
          <view class="text-color-row">
            <view
              v-for="c in colorOptions"
              :key="c"
              class="color-dot"
              :class="{ active: activeColor === c }"
              :style="{ background: c }"
              @click="activeColor = c"
            ></view>
          </view>
          <view class="text-input-actions">
            <AppButton class="text-btn cancel" @click="cancelTextInput">{{ t('取消') }}</AppButton>
            <AppButton class="text-btn confirm" @click="confirmTextInput">{{ t('确定') }}</AppButton>
          </view>
        </view>
      </view>
    </view>
  </Popup>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { Popup } from 'vant'
import 'vant/lib/popup/style'
import { useI18n } from '../../../utils/i18n.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  photoSrc: { type: String, default: '' }
})

const emit = defineEmits(['close', 'save'])

const { t } = useI18n()

const editorBodyRef = ref(null)
const textInputElRef = ref(null)

const currentTool = ref('select')
const activeColor = ref('#ef4444')
const showTextInput = ref(false)
const textInputValue = ref('')

const colorOptions = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff', '#000000']

const tools = computed(() => [
  { id: 'select', icon: '☝', label: t('选择') },
  { id: 'arrow', icon: '➤', label: t('箭头') },
  { id: 'draw', icon: '✏', label: t('画笔') },
  { id: 'text', icon: 'T', label: t('文字') },
  { id: 'rect', icon: '□', label: t('矩形') },
  { id: 'ellipse', icon: '○', label: t('圆形') },
  { id: 'rotate', icon: '↻', label: t('旋转') },
  { id: 'resetView', icon: '⊡', label: t('适屏') },
  { id: 'undo', icon: '↩', label: t('撤销') },
  { id: 'delete', icon: '🗑', label: t('删除') }
])

const showColorBar = computed(() => {
  return ['arrow', 'draw', 'rect', 'ellipse', 'text'].includes(currentTool.value)
})

let canvasEl = null
let ctx = null
let bgImg = null
let canvasWidth = 0
let canvasHeight = 0
let imgDrawX = 0
let imgDrawY = 0
let imgDrawW = 0
let imgDrawH = 0
let dpr = 1
let rotation = 0

let objects = []
let selectedObj = null
let isDrawing = false
let isDragging = false
let isResizing = false
let startX = 0
let startY = 0
let dragOffsetX = 0
let dragOffsetY = 0
let resizeHandle = ''
let currentPath = null
let textPlaceX = 0
let textPlaceY = 0

let HANDLE_SIZE = 10

let viewScale = 1
let viewOffsetX = 0
let viewOffsetY = 0
let isPinching = false
let lastPinchDist = 0
let lastPinchCenterX = 0
let lastPinchCenterY = 0
let isPanning = false

watch(() => props.visible, async (val) => {
  if (val && props.photoSrc) {
    await nextTick()
    objects = []
    selectedObj = null
    currentPath = null
    setTimeout(() => initEditor(), 200)
  } else if (!val) {
    cleanup()
  }
})

onUnmounted(() => { cleanup() })

function cleanup() {
  if (canvasEl && canvasEl.parentNode) {
    canvasEl.parentNode.removeChild(canvasEl)
  }
  canvasEl = null
  ctx = null
  bgImg = null
  objects = []
  selectedObj = null
}

function initEditor() {
  const bodyEl = editorBodyRef.value?.$el || editorBodyRef.value
  if (!bodyEl) return

  cleanup()
  rotation = 0
  viewScale = 1
  viewOffsetX = 0
  viewOffsetY = 0

  const rect = bodyEl.getBoundingClientRect()
  dpr = window.devicePixelRatio || 1
  HANDLE_SIZE = 10 * dpr
  canvasWidth = Math.floor(rect.width * dpr)
  canvasHeight = Math.floor(rect.height * dpr)

  canvasEl = document.createElement('canvas')
  canvasEl.width = canvasWidth
  canvasEl.height = canvasHeight
  canvasEl.style.cssText = `width:${rect.width}px;height:${rect.height}px;display:block;touch-action:none;`
  bodyEl.appendChild(canvasEl)

  ctx = canvasEl.getContext('2d')

  canvasEl.addEventListener('touchstart', handleTouchStart, { passive: false })
  canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false })
  canvasEl.addEventListener('touchend', handleTouchEnd)
  canvasEl.addEventListener('mousedown', handleMouseDown)
  canvasEl.addEventListener('mousemove', handleMouseMove)
  canvasEl.addEventListener('mouseup', handleMouseUp)

  loadImage()
}

function loadImage() {
  bgImg = new Image()
  bgImg.crossOrigin = 'anonymous'
  bgImg.onload = () => {
    recomputeImageLayout()
    redraw()
  }
  bgImg.onerror = () => {
    bgImg.crossOrigin = null
    bgImg.onload = () => {
      recomputeImageLayout()
      redraw()
    }
    bgImg.src = props.photoSrc
  }
  bgImg.src = props.photoSrc
}

function recomputeImageLayout() {
  if (!bgImg || !bgImg.naturalWidth) return
  const isRotated = rotation === 90 || rotation === 270
  const srcW = isRotated ? bgImg.naturalHeight : bgImg.naturalWidth
  const srcH = isRotated ? bgImg.naturalWidth : bgImg.naturalHeight
  const scale = Math.min(canvasWidth / srcW, canvasHeight / srcH)
  imgDrawW = Math.floor(srcW * scale)
  imgDrawH = Math.floor(srcH * scale)
  imgDrawX = Math.floor((canvasWidth - imgDrawW) / 2)
  imgDrawY = Math.floor((canvasHeight - imgDrawH) / 2)
}

function getBBox(obj) {
  if (obj.type === 'arrow') {
    const minX = Math.min(obj.x1, obj.x2)
    const minY = Math.min(obj.y1, obj.y2)
    const maxX = Math.max(obj.x1, obj.x2)
    const maxY = Math.max(obj.y1, obj.y2)
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  } else if (obj.type === 'rect') {
    const x = obj.w >= 0 ? obj.x : obj.x + obj.w
    const y = obj.h >= 0 ? obj.y : obj.y + obj.h
    return { x, y, w: Math.abs(obj.w), h: Math.abs(obj.h) }
  } else if (obj.type === 'ellipse') {
    return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 }
  } else if (obj.type === 'text') {
    ctx.font = `bold ${obj.fontSize}px sans-serif`
    const metrics = ctx.measureText(obj.text)
    return { x: obj.x, y: obj.y - obj.fontSize, w: metrics.width, h: obj.fontSize * 1.2 }
  } else if (obj.type === 'path') {
    if (!obj.points || obj.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of obj.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

function hitTest(x, y, obj) {
  const threshold = 15 * dpr
  if (obj.type === 'arrow') {
    return pointToSegmentDist(x, y, obj.x1, obj.y1, obj.x2, obj.y2) <= threshold
  } else if (obj.type === 'path') {
    if (!obj.points || obj.points.length < 2) return false
    for (let i = 1; i < obj.points.length; i++) {
      if (pointToSegmentDist(x, y, obj.points[i - 1].x, obj.points[i - 1].y, obj.points[i].x, obj.points[i].y) <= threshold) {
        return true
      }
    }
    return false
  } else if (obj.type === 'rect') {
    const { x: rx, y: ry, w, h } = obj
    const onTop = pointToSegmentDist(x, y, rx, ry, rx + w, ry) <= threshold
    const onBottom = pointToSegmentDist(x, y, rx, ry + h, rx + w, ry + h) <= threshold
    const onLeft = pointToSegmentDist(x, y, rx, ry, rx, ry + h) <= threshold
    const onRight = pointToSegmentDist(x, y, rx + w, ry, rx + w, ry + h) <= threshold
    return onTop || onBottom || onLeft || onRight
  } else if (obj.type === 'ellipse') {
    const { cx, cy, rx, ry } = obj
    if (rx < 1 || ry < 1) return false
    const nx = (x - cx) / rx
    const ny = (y - cy) / ry
    const dist = Math.sqrt(nx * nx + ny * ny)
    return Math.abs(dist - 1) <= threshold / Math.min(rx, ry)
  } else if (obj.type === 'text') {
    const bbox = getBBox(obj)
    const pad = 5 * dpr
    return x >= bbox.x - pad && x <= bbox.x + bbox.w + pad &&
           y >= bbox.y - pad && y <= bbox.y + bbox.h + pad
  }
  return false
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1))
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = x1 + t * dx
  const projY = y1 + t * dy
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY))
}

function getResizeHandle(x, y, obj) {
  const bbox = getBBox(obj)
  const hs = HANDLE_SIZE
  const handles = [
    { name: 'tl', hx: bbox.x, hy: bbox.y },
    { name: 'tr', hx: bbox.x + bbox.w, hy: bbox.y },
    { name: 'bl', hx: bbox.x, hy: bbox.y + bbox.h },
    { name: 'br', hx: bbox.x + bbox.w, hy: bbox.y + bbox.h }
  ]
  for (const h of handles) {
    if (Math.abs(x - h.hx) <= hs && Math.abs(y - h.hy) <= hs) {
      return h.name
    }
  }
  return ''
}

function drawSelectionBox(obj) {
  if (!ctx) return
  const bbox = getBBox(obj)
  ctx.save()
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 2 * dpr
  ctx.setLineDash([4 * dpr, 4 * dpr])
  const pad = 4 * dpr
  ctx.strokeRect(bbox.x - pad, bbox.y - pad, bbox.w + pad * 2, bbox.h + pad * 2)
  ctx.setLineDash([])

  const hs = HANDLE_SIZE
  const handles = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x, y: bbox.y + bbox.h },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h }
  ]
  for (const h of handles) {
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 2 * dpr
    ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
    ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
  }
  ctx.restore()
}

function moveObject(obj, dx, dy) {
  if (obj.type === 'arrow') {
    obj.x1 += dx; obj.y1 += dy
    obj.x2 += dx; obj.y2 += dy
  } else if (obj.type === 'rect') {
    obj.x += dx; obj.y += dy
  } else if (obj.type === 'ellipse') {
    obj.cx += dx; obj.cy += dy
  } else if (obj.type === 'text') {
    obj.x += dx; obj.y += dy
  } else if (obj.type === 'path') {
    for (const p of obj.points) {
      p.x += dx; p.y += dy
    }
  }
}

function scaleObject(obj, handle, dx, dy) {
  const bbox = getBBox(obj)
  if (bbox.w < 5 && bbox.h < 5) return

  let scaleFactorX = 1
  let scaleFactorY = 1
  let anchorX = bbox.x
  let anchorY = bbox.y

  if (handle === 'br') {
    scaleFactorX = (bbox.w + dx) / bbox.w
    scaleFactorY = (bbox.h + dy) / bbox.h
    anchorX = bbox.x; anchorY = bbox.y
  } else if (handle === 'bl') {
    scaleFactorX = (bbox.w - dx) / bbox.w
    scaleFactorY = (bbox.h + dy) / bbox.h
    anchorX = bbox.x + bbox.w; anchorY = bbox.y
  } else if (handle === 'tr') {
    scaleFactorX = (bbox.w + dx) / bbox.w
    scaleFactorY = (bbox.h - dy) / bbox.h
    anchorX = bbox.x; anchorY = bbox.y + bbox.h
  } else if (handle === 'tl') {
    scaleFactorX = (bbox.w - dx) / bbox.w
    scaleFactorY = (bbox.h - dy) / bbox.h
    anchorX = bbox.x + bbox.w; anchorY = bbox.y + bbox.h
  }

  if (scaleFactorX < 0.2) scaleFactorX = 0.2
  if (scaleFactorY < 0.2) scaleFactorY = 0.2
  if (scaleFactorX > 5) scaleFactorX = 5
  if (scaleFactorY > 5) scaleFactorY = 5

  applyScale(obj, anchorX, anchorY, scaleFactorX, scaleFactorY)
}

function applyScale(obj, anchorX, anchorY, sx, sy) {
  function tr(px, py) {
    return { x: anchorX + (px - anchorX) * sx, y: anchorY + (py - anchorY) * sy }
  }

  if (obj.type === 'arrow') {
    const p1 = tr(obj.x1, obj.y1)
    const p2 = tr(obj.x2, obj.y2)
    obj.x1 = p1.x; obj.y1 = p1.y
    obj.x2 = p2.x; obj.y2 = p2.y
  } else if (obj.type === 'rect') {
    const p = tr(obj.x, obj.y)
    obj.x = p.x; obj.y = p.y
    obj.w *= sx; obj.h *= sy
  } else if (obj.type === 'ellipse') {
    const c = tr(obj.cx, obj.cy)
    obj.cx = c.x; obj.cy = c.y
    obj.rx *= sx; obj.ry *= sy
  } else if (obj.type === 'text') {
    const p = tr(obj.x, obj.y)
    obj.x = p.x; obj.y = p.y
    obj.fontSize = Math.max(10, Math.round(obj.fontSize * Math.max(sx, sy)))
  } else if (obj.type === 'path') {
    for (const p of obj.points) {
      const np = tr(p.x, p.y)
      p.x = np.x; p.y = np.y
    }
    obj.width = Math.max(1, obj.width * Math.max(sx, sy))
  }
}

function redraw() {
  if (!ctx) return
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  ctx.save()
  ctx.translate(viewOffsetX, viewOffsetY)
  ctx.scale(viewScale, viewScale)

  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    ctx.save()
    const cx = imgDrawX + imgDrawW / 2
    const cy = imgDrawY + imgDrawH / 2
    ctx.translate(cx, cy)
    ctx.rotate((rotation * Math.PI) / 180)
    const isRotated = rotation === 90 || rotation === 270
    const drawW = isRotated ? imgDrawH : imgDrawW
    const drawH = isRotated ? imgDrawW : imgDrawH
    ctx.drawImage(bgImg, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  }
  for (const obj of objects) {
    renderItem(obj)
  }
  if (selectedObj) {
    drawSelectionBox(selectedObj)
  }

  ctx.restore()
}

function renderItem(item) {
  if (!ctx) return
  ctx.save()
  if (item.type === 'arrow') {
    drawArrow(item.x1, item.y1, item.x2, item.y2, item.color, item.width)
  } else if (item.type === 'path') {
    ctx.strokeStyle = item.color
    ctx.lineWidth = item.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    if (item.points.length > 0) {
      ctx.moveTo(item.points[0].x, item.points[0].y)
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y)
      }
    }
    ctx.stroke()
  } else if (item.type === 'text') {
    ctx.font = `bold ${item.fontSize}px sans-serif`
    ctx.fillStyle = item.color
    ctx.fillText(item.text, item.x, item.y)
  } else if (item.type === 'rect') {
    ctx.strokeStyle = item.color
    ctx.lineWidth = item.width
    ctx.strokeRect(item.x, item.y, item.w, item.h)
  } else if (item.type === 'ellipse') {
    ctx.strokeStyle = item.color
    ctx.lineWidth = item.width
    ctx.beginPath()
    ctx.ellipse(item.cx, item.cy, item.rx, item.ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawArrow(x1, y1, x2, y2, color, width) {
  const headLen = Math.max(width * 4, 14)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

function getCanvasPos(e) {
  if (!canvasEl) return { x: 0, y: 0 }
  const rect = canvasEl.getBoundingClientRect()
  let clientX, clientY
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX
    clientY = e.changedTouches[0].clientY
  } else {
    clientX = e.clientX
    clientY = e.clientY
  }
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height
  const rawX = (clientX - rect.left) * scaleX
  const rawY = (clientY - rect.top) * scaleY
  return {
    x: (rawX - viewOffsetX) / viewScale,
    y: (rawY - viewOffsetY) / viewScale
  }
}

function getPinchDist(e) {
  const t = e.touches
  const dx = t[1].clientX - t[0].clientX
  const dy = t[1].clientY - t[0].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function getPinchCenter(e) {
  const t = e.touches
  return {
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2
  }
}

function handleTouchStart(e) {
  e.preventDefault()
  if (e.touches.length === 2) {
    isPinching = true
    isDrawing = false
    isDragging = false
    isPanning = false
    lastPinchDist = getPinchDist(e)
    const center = getPinchCenter(e)
    lastPinchCenterX = center.x
    lastPinchCenterY = center.y
    return
  }
  handleStart(e)
}

function handleTouchMove(e) {
  e.preventDefault()
  if (e.touches.length === 2 && isPinching) {
    const newDist = getPinchDist(e)
    const scaleRatio = newDist / lastPinchDist
    const center = getPinchCenter(e)

    const rect = canvasEl.getBoundingClientRect()
    const cx = (center.x - rect.left) * (canvasWidth / rect.width)
    const cy = (center.y - rect.top) * (canvasHeight / rect.height)

    const newScale = Math.min(Math.max(viewScale * scaleRatio, 0.5), 5)
    const factor = newScale / viewScale
    viewOffsetX = cx - factor * (cx - viewOffsetX)
    viewOffsetY = cy - factor * (cy - viewOffsetY)
    viewScale = newScale

    lastPinchDist = newDist
    lastPinchCenterX = center.x
    lastPinchCenterY = center.y
    redraw()
    return
  }
  handleMove(e)
}

function handleTouchEnd(e) {
  if (isPinching) {
    isPinching = false
    if (e.touches.length === 0) return
    return
  }
  if (isPanning) {
    isPanning = false
    return
  }
  handleEnd(e)
}

function handleMouseDown(e) { handleStart(e) }
function handleMouseMove(e) { if (isDrawing || isDragging || isResizing || isPanning) handleMove(e) }
function handleMouseUp(e) { handleEnd(e) }

function handleStart(e) {
  const pos = getCanvasPos(e)

  if (selectedObj) {
    const handle = getResizeHandle(pos.x, pos.y, selectedObj)
    if (handle) {
      isResizing = true
      resizeHandle = handle
      startX = pos.x
      startY = pos.y
      return
    }
  }

  let found = null
  for (let i = objects.length - 1; i >= 0; i--) {
    if (hitTest(pos.x, pos.y, objects[i])) {
      found = objects[i]
      break
    }
  }

  if (found) {
    selectedObj = found
    isDragging = true
    startX = pos.x
    startY = pos.y
    redraw()
    return
  }

  selectedObj = null

  if (currentTool.value === 'select') {
    isPanning = true
    startX = pos.x
    startY = pos.y
    redraw()
    return
  }

  if (currentTool.value === 'text') {
    textPlaceX = pos.x
    textPlaceY = pos.y
    showTextInput.value = true
    textInputValue.value = ''
    nextTick(() => {
      const el = textInputElRef.value?.$el || textInputElRef.value
      el?.focus?.()
    })
    return
  }

  selectedObj = null
  isDrawing = true
  startX = pos.x
  startY = pos.y

  if (currentTool.value === 'draw') {
    currentPath = { type: 'path', color: activeColor.value, width: 3 * dpr, points: [{ x: pos.x, y: pos.y }] }
  }
}

function handleMove(e) {
  const pos = getCanvasPos(e)

  if (isPanning && !isDragging && !isResizing && !isDrawing) {
    const dx = pos.x - startX
    const dy = pos.y - startY
    viewOffsetX += dx * viewScale
    viewOffsetY += dy * viewScale
    redraw()
    return
  }

  if (isDragging && selectedObj) {
    const dx = pos.x - startX
    const dy = pos.y - startY
    moveObject(selectedObj, dx, dy)
    startX = pos.x
    startY = pos.y
    redraw()
    return
  }

  if (isResizing && selectedObj) {
    const dx = pos.x - startX
    const dy = pos.y - startY
    scaleObject(selectedObj, resizeHandle, dx, dy)
    startX = pos.x
    startY = pos.y
    redraw()
    return
  }

  if (!isDrawing || !ctx) return

  redraw()

  if (currentTool.value === 'draw' && currentPath) {
    currentPath.points.push({ x: pos.x, y: pos.y })
    renderItem(currentPath)
  } else if (currentTool.value === 'arrow') {
    drawArrow(startX, startY, pos.x, pos.y, activeColor.value, (3 * dpr) / viewScale)
  } else if (currentTool.value === 'rect') {
    ctx.strokeStyle = activeColor.value
    ctx.lineWidth = (3 * dpr) / viewScale
    ctx.strokeRect(startX, startY, pos.x - startX, pos.y - startY)
  } else if (currentTool.value === 'ellipse') {
    const cx = (startX + pos.x) / 2
    const cy = (startY + pos.y) / 2
    const rx = Math.abs(pos.x - startX) / 2
    const ry = Math.abs(pos.y - startY) / 2
    ctx.strokeStyle = activeColor.value
    ctx.lineWidth = (3 * dpr) / viewScale
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function handleEnd(e) {
  if (isPanning) {
    isPanning = false
    return
  }

  if (isDragging) {
    isDragging = false
    return
  }

  if (isResizing) {
    isResizing = false
    resizeHandle = ''
    return
  }

  if (!isDrawing) return
  isDrawing = false
  const pos = getCanvasPos(e)

  if (currentTool.value === 'arrow') {
    const dx = pos.x - startX
    const dy = pos.y - startY
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      const obj = { type: 'arrow', x1: startX, y1: startY, x2: pos.x, y2: pos.y, color: activeColor.value, width: 3 * dpr }
      objects.push(obj)
    }
  } else if (currentTool.value === 'draw' && currentPath) {
    objects.push(currentPath)
    currentPath = null
  } else if (currentTool.value === 'rect') {
    const w = pos.x - startX
    const h = pos.y - startY
    if (Math.abs(w) > 5 || Math.abs(h) > 5) {
      const obj = { type: 'rect', x: startX, y: startY, w, h, color: activeColor.value, width: 3 * dpr }
      objects.push(obj)
    }
  } else if (currentTool.value === 'ellipse') {
    const cx = (startX + pos.x) / 2
    const cy = (startY + pos.y) / 2
    const rx = Math.abs(pos.x - startX) / 2
    const ry = Math.abs(pos.y - startY) / 2
    if (rx > 3 || ry > 3) {
      const obj = { type: 'ellipse', cx, cy, rx, ry, color: activeColor.value, width: 3 * dpr }
      objects.push(obj)
    }
  }

  selectedObj = null
  redraw()
}

function selectTool(toolId) {
  if (toolId === 'undo') {
    if (objects.length > 0) {
      objects.pop()
      selectedObj = null
      redraw()
    }
    return
  }
  if (toolId === 'delete') {
    if (selectedObj) {
      const idx = objects.indexOf(selectedObj)
      if (idx > -1) objects.splice(idx, 1)
      selectedObj = null
      redraw()
    }
    return
  }
  if (toolId === 'rotate') {
    rotation = (rotation + 90) % 360
    selectedObj = null
    recomputeImageLayout()
    redraw()
    return
  }
  if (toolId === 'resetView') {
    viewScale = 1
    viewOffsetX = 0
    viewOffsetY = 0
    redraw()
    return
  }
  currentTool.value = toolId
  if (toolId !== 'select') {
    selectedObj = null
    redraw()
  }
}

function confirmTextInput() {
  if (textInputValue.value.trim()) {
    const obj = {
      type: 'text',
      text: textInputValue.value.trim(),
      x: textPlaceX,
      y: textPlaceY,
      color: activeColor.value,
      fontSize: 24 * dpr
    }
    objects.push(obj)
    selectedObj = null
    redraw()
  }
  showTextInput.value = false
  textInputValue.value = ''
}

function cancelTextInput() {
  showTextInput.value = false
  textInputValue.value = ''
}

function handleCancel() {
  cleanup()
  emit('close')
}

function handleSave() {
  if (!canvasEl || !bgImg) { emit('close'); return }
  try {
    selectedObj = null
    redraw()

    const natW = bgImg.naturalWidth
    const natH = bgImg.naturalHeight
    const isRotated = rotation === 90 || rotation === 270
    const outW = isRotated ? natH : natW
    const outH = isRotated ? natW : natH
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = outW
    outputCanvas.height = outH
    const outCtx = outputCanvas.getContext('2d')

    outCtx.save()
    outCtx.translate(outW / 2, outH / 2)
    outCtx.rotate((rotation * Math.PI) / 180)
    outCtx.drawImage(bgImg, -natW / 2, -natH / 2, natW, natH)
    outCtx.restore()

    const sx = outW / imgDrawW
    const sy = outH / imgDrawH

    for (const item of objects) {
      outCtx.save()
      if (item.type === 'arrow') {
        const x1 = (item.x1 - imgDrawX) * sx
        const y1 = (item.y1 - imgDrawY) * sy
        const x2 = (item.x2 - imgDrawX) * sx
        const y2 = (item.y2 - imgDrawY) * sy
        const headLen = Math.max(item.width * sx * 4, 14 * sx)
        const angle = Math.atan2(y2 - y1, x2 - x1)
        outCtx.strokeStyle = item.color
        outCtx.fillStyle = item.color
        outCtx.lineWidth = item.width * sx
        outCtx.lineCap = 'round'
        outCtx.beginPath()
        outCtx.moveTo(x1, y1)
        outCtx.lineTo(x2, y2)
        outCtx.stroke()
        outCtx.beginPath()
        outCtx.moveTo(x2, y2)
        outCtx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
        outCtx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
        outCtx.closePath()
        outCtx.fill()
      } else if (item.type === 'path') {
        outCtx.strokeStyle = item.color
        outCtx.lineWidth = item.width * sx
        outCtx.lineCap = 'round'
        outCtx.lineJoin = 'round'
        outCtx.beginPath()
        if (item.points.length > 0) {
          outCtx.moveTo((item.points[0].x - imgDrawX) * sx, (item.points[0].y - imgDrawY) * sy)
          for (let i = 1; i < item.points.length; i++) {
            outCtx.lineTo((item.points[i].x - imgDrawX) * sx, (item.points[i].y - imgDrawY) * sy)
          }
        }
        outCtx.stroke()
      } else if (item.type === 'text') {
        const fontSize = Math.round(item.fontSize * sx)
        outCtx.font = `bold ${fontSize}px sans-serif`
        outCtx.fillStyle = item.color
        outCtx.fillText(item.text, (item.x - imgDrawX) * sx, (item.y - imgDrawY) * sy)
      } else if (item.type === 'rect') {
        outCtx.strokeStyle = item.color
        outCtx.lineWidth = item.width * sx
        outCtx.strokeRect(
          (item.x - imgDrawX) * sx,
          (item.y - imgDrawY) * sy,
          item.w * sx,
          item.h * sy
        )
      } else if (item.type === 'ellipse') {
        outCtx.strokeStyle = item.color
        outCtx.lineWidth = item.width * sx
        outCtx.beginPath()
        outCtx.ellipse(
          (item.cx - imgDrawX) * sx,
          (item.cy - imgDrawY) * sy,
          item.rx * sx,
          item.ry * sy,
          0, 0, Math.PI * 2
        )
        outCtx.stroke()
      }
      outCtx.restore()
    }

    const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.92)
    cleanup()
    emit('save', dataUrl)
  } catch (error) {
    cleanup()
    emit('close')
  }
}
</script>

<style scoped lang="scss">
.photo-editor-modal {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 32rpx;
  background: #222;
  color: #fff;

  .header-btn {
    font-size: 28rpx;
    color: #ccc;
    padding: 8rpx 16rpx;
    min-width: 80rpx;

    &.save {
      color: #22c55e;
      font-weight: 600;
    }
  }

  .header-title {
    font-size: 30rpx;
    font-weight: 600;
  }
}

.editor-body {
  flex: 1;
  overflow: hidden;
  background: #111;
  position: relative;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 16rpx 8rpx;
  background: #222;
  flex-wrap: wrap;
  gap: 4rpx;

  .tool-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    padding: 12rpx 16rpx;
    border-radius: 12rpx;
    cursor: pointer;
    min-width: 80rpx;

    &.active {
      background: #333;

      .tool-icon, .tool-label {
        color: #22c55e;
      }
    }

    .tool-icon {
      font-size: 32rpx;
      color: #ccc;
    }

    .tool-label {
      font-size: 20rpx;
      color: #999;
    }
  }
}

.sub-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 32rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #1a1a1a;

  .color-selector {
    display: flex;
    gap: 16rpx;
  }
}

.color-dot {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 3rpx solid #555;
  cursor: pointer;

  &.active {
    border-color: #fff;
    box-shadow: 0 0 0 3rpx #22c55e;
  }
}

.text-input-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;

  .text-input-box {
    background: #fff;
    border-radius: 16rpx;
    padding: 32rpx;
    width: 80%;
    max-width: 600rpx;

    .text-input {
      width: 100%;
      height: 80rpx;
      border: 2rpx solid #e5e7eb;
      border-radius: 8rpx;
      padding: 0 16rpx;
      font-size: 28rpx;
    }

    .text-color-row {
      display: flex;
      gap: 16rpx;
      margin-top: 20rpx;
      justify-content: center;
    }

    .text-input-actions {
      display: flex;
      gap: 16rpx;
      margin-top: 24rpx;
      justify-content: flex-end;

      .text-btn {
        padding: 12rpx 32rpx;
        border-radius: 8rpx;
        font-size: 26rpx;

        &.cancel {
          background: #f3f4f6;
          color: #666;
        }

        &.confirm {
          background: #22c55e;
          color: #fff;
        }
      }
    }
  }
}
</style>
