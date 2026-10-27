import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const zoom = await loadUtsModule('domain/mediaZoom.uts')

test('clamps the preview zoom scale into the allowed range', () => {
  assert.equal(zoom.MEDIA_ZOOM_FIT_SCALE, 1)
  assert.equal(zoom.MEDIA_ZOOM_MIN_SCALE, 0.5)
  assert.equal(zoom.MEDIA_ZOOM_MAX_SCALE, 4)
  assert.equal(zoom.clampMediaZoomScale(1), 1)
  assert.equal(zoom.clampMediaZoomScale(2.5), 2.5)
  assert.equal(zoom.clampMediaZoomScale(0.8), 0.8)
  // 缩小到一半为止，放大超过上限要收敛，避免图片糊成一片。
  assert.equal(zoom.clampMediaZoomScale(0.2), 0.5)
  assert.equal(zoom.clampMediaZoomScale(9), 4)
  // 非法读数回到完整适配，而不是让画面意外缩小。
  assert.equal(zoom.clampMediaZoomScale(0), 1)
  assert.equal(zoom.clampMediaZoomScale(Number.NaN), 1)
  assert.equal(zoom.clampMediaZoomScale(3, 2, 2.5), 2.5)
})

test('resolves pinch distance and pinch zoom scale', () => {
  assert.equal(zoom.resolvePinchDistance(0, 0, 3, 4), 5)
  assert.equal(zoom.resolvePinchDistance(10, 10, 10, 10), 0)
  // 捏开一倍间距放大一倍；捏合到一半间距缩小一半，继续捏合收敛在 0.5 倍。
  assert.equal(zoom.resolvePinchZoomScale(1, 100, 200), 2)
  assert.equal(zoom.resolvePinchZoomScale(1, 100, 50), 0.5)
  assert.equal(zoom.resolvePinchZoomScale(1, 100, 25), 0.5)
  assert.equal(zoom.resolvePinchZoomScale(2, 100, 100), 2)
  assert.equal(zoom.resolvePinchZoomScale(1, 100, 100000), 4)
  // 起始间距无效时保持原倍数，不出现除零跳变。
  assert.equal(zoom.resolvePinchZoomScale(1.8, 0, 200), 1.8)
  assert.equal(zoom.resolvePinchZoomScale(1.8, Number.NaN, 200), 1.8)
})

test('detects a double tap only inside the time window and near the previous tap', () => {
  assert.equal(zoom.MEDIA_ZOOM_DOUBLE_TAP_INTERVAL_MS, 300)
  assert.equal(zoom.isDoubleTapGesture(1000, 100, 200, 1200, 110, 205), true)
  // 超时、离得太远、没有可配对的上一次点击都不算双击。
  assert.equal(zoom.isDoubleTapGesture(1000, 100, 200, 1400, 110, 205), false)
  assert.equal(zoom.isDoubleTapGesture(1000, 100, 200, 1200, 260, 205), false)
  assert.equal(zoom.isDoubleTapGesture(0, 100, 200, 1200, 100, 200), false)
  assert.equal(zoom.isDoubleTapGesture(1200, 100, 200, 1200, 100, 200), false)
})

test('derives the preview area geometry from the window metrics', () => {
  assert.equal(zoom.MEDIA_PREVIEW_HEADER_HEIGHT_RPX, 100)
  assert.equal(zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX, 32)
  assert.equal(zoom.resolveMediaZoomTopPx(44, 48), 92)
  assert.equal(zoom.resolveMediaZoomTopPx(-10, -5), 0)
  assert.equal(zoom.resolveMediaZoomHeightPx(800, 92), 708)
  assert.equal(zoom.resolveMediaZoomHeightPx(80, 92), 1)
  // 左右各留一份内边距：图片可用宽度要扣掉两侧留白，留白过大时至少保留 1px。
  assert.equal(zoom.resolveMediaZoomWidthPx(360, 16), 328)
  assert.equal(zoom.resolveMediaZoomWidthPx(360, 0), 360)
  assert.equal(zoom.resolveMediaZoomWidthPx(30, 16), 1)
})

test('keeps the zoomed image covering the whole preview area', () => {
  // 2 倍时每个方向最多平移画面尺寸的一半，1 倍及缩小状态都不能平移（保持居中）。
  assert.deepEqual(zoom.clampMediaZoomOffset(300, 500, 2, 400, 800), { offsetX: 200, offsetY: 400 })
  assert.deepEqual(zoom.clampMediaZoomOffset(-300, -500, 2, 400, 800), { offsetX: -200, offsetY: -400 })
  assert.deepEqual(zoom.clampMediaZoomOffset(120, -80, 2, 400, 800), { offsetX: 120, offsetY: -80 })
  assert.deepEqual(zoom.clampMediaZoomOffset(120, -80, 1, 400, 800), { offsetX: 0, offsetY: 0 })
  // 缩小到一半时图片比画面小，必须居中显示。
  assert.deepEqual(zoom.clampMediaZoomOffset(120, -80, 0.5, 400, 800), { offsetX: 0, offsetY: 0 })
  assert.deepEqual(zoom.clampMediaZoomOffset(Number.NaN, Number.NaN, 3, 400, 800), { offsetX: -400, offsetY: -800 })
})

test('double tap zooms at the tapped point and taps again to fit the whole picture', () => {
  // 双击画面中心：放大到 2.5 倍且不偏移。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(1, 200, 400, 0, 0, 400, 800), { scale: 2.5, offsetX: 0, offsetY: 0 })
  // 双击中心右侧 100px：放大后该点仍留在原地，位移 = 100 * (1 - 2.5)。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(1, 300, 400, 0, 0, 400, 800), { scale: 2.5, offsetX: -150, offsetY: 0 })
  // 标题栏偏移要计入锚点：双击标题栏下方 100px 处，锚点纵坐标 = 600 - 100 - 400。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(1, 200, 600, 0, 100, 400, 800), { scale: 2.5, offsetX: 0, offsetY: -150 })
  // 左右留白同样要计入锚点：画面中心 = 16 + 328 / 2，双击点 280 距中心 100px。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(1, 280, 400, 16, 0, 328, 800), { scale: 2.5, offsetX: -150, offsetY: 0 })
  // 已放大时再次双击回到 1 倍居中；已缩小时双击先恢复完整适配。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(2.5, 300, 500, 0, 0, 400, 800), { scale: 1, offsetX: 0, offsetY: 0 })
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(0.5, 300, 500, 0, 0, 400, 800), { scale: 1, offsetX: 0, offsetY: 0 })
  // 边缘双击也要收敛在可见范围内。
  assert.deepEqual(zoom.resolveDoubleTapZoomTransform(1, 400, 800, 0, 0, 400, 800), { scale: 2.5, offsetX: -300, offsetY: -600 })
})

/**
 * 大图预览支持双指捏合放大/缩小、双击放大或恢复完整适配，缩放只在图片上生效；
 * 缩放状态与画面几何必须始终和页面布局一致。
 */
test('capture preview zooms images with pinch, double tap and drag', async () => {
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')

  // 缩放平移作用在图片层，视频不参与缩放。
  assert.match(preview, /<view v-else class="preview-zoom" :style="imageZoomStyle">/)
  assert.match(preview, /const imageZoomStyle = computed\(\(\): string => `transform: translate\(\$\{zoomOffsetX\.value\}px, \$\{zoomOffsetY\.value\}px\) scale\(\$\{zoomScale\.value\}\)`\)/)
  assert.match(preview, /\.preview-zoom \{ width: 100%; height: 100%; align-items: center; justify-content: center; \}/)
  // 放大后的图片必须被预览区裁掉，不能盖住标题栏；左右内边距让图片不贴屏幕边缘。
  const contentCss = /\.preview-content \{([^}]*)\}/.exec(preview)?.[1] ?? ''
  assert.match(contentCss, /overflow: hidden;/)
  assert.match(contentCss, /box-sizing: border-box;/)
  const cssPaddingLeft = parseInt(/padding-left: (\d+)rpx;/.exec(contentCss)?.[1] ?? '0')
  const cssPaddingRight = parseInt(/padding-right: (\d+)rpx;/.exec(contentCss)?.[1] ?? '0')
  assert.equal(cssPaddingLeft, zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX, `左右留白必须与 MEDIA_PREVIEW_SIDE_PADDING_RPX 一致，当前 ${cssPaddingLeft}rpx`)
  assert.equal(cssPaddingRight, zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX, `左右留白必须与 MEDIA_PREVIEW_SIDE_PADDING_RPX 一致，当前 ${cssPaddingRight}rpx`)

  // 三种手势：双指捏合放大/缩小、放大后单指拖动平移、未放大时左右滑动翻页。
  assert.match(preview, /@touchstart="handleTouchStart"/)
  assert.match(preview, /@touchmove="handleTouchMove"/)
  assert.match(preview, /@touchend="handleTouchEnd"/)
  assert.match(preview, /resolvePinchDistance\(touchX\(event\), touchY\(event\), event\.touches\[1\]\.clientX, event\.touches\[1\]\.clientY\)/)
  assert.match(preview, /resolvePinchZoomScale\(pinchStartScale, pinchStartDistance, distance\)/)
  assert.match(preview, /clampMediaZoomOffset\(/)
  assert.match(preview, /!props\.isVideo && event\.touches\.length >= 2/)
  assert.match(preview, /!props\.isVideo && zoomScale\.value > MEDIA_ZOOM_FIT_SCALE \? 'pan' : 'swipe'/)
  // 捏合松手后停在用户选择的大小，不再强制回弹到完整适配（缩小是明确的手势意图）。
  assert.doesNotMatch(preview, /MEDIA_ZOOM_RESET_THRESHOLD/)

  // 双击放大/缩小：点击判定用时间窗口 + 位移，锚点用真实画面几何（含标题栏与左右留白）。
  assert.match(preview, /isDoubleTapGesture\(lastTapAt, lastTapX, lastTapY, tapAt, touchX\(event\), touchY\(event\)\)/)
  assert.match(preview, /resolveDoubleTapZoomTransform\(zoomScale\.value, touchX\(event\), touchY\(event\), zoomAreaLeft, zoomAreaTop, zoomAreaWidth, zoomAreaHeight\)/)
  assert.match(preview, /Math\.abs\(deltaX\) < MEDIA_ZOOM_TAP_MOVE_PX && Math\.abs\(deltaY\) < MEDIA_ZOOM_TAP_MOVE_PX/)

  // 画面几何来自窗口信息 + CSS 里的标题栏高度与左右留白，常量不能和样式脱节。
  assert.match(preview, /uni\.getWindowInfo\(\)/)
  assert.match(preview, /zoomAreaLeft = Math\.max\(0, uni\.rpx2px\(MEDIA_PREVIEW_SIDE_PADDING_RPX\)\)/)
  assert.match(preview, /resolveMediaZoomTopPx\(info\.safeAreaInsets\.top, uni\.rpx2px\(MEDIA_PREVIEW_HEADER_HEIGHT_RPX\)\)/)
  assert.match(preview, /resolveMediaZoomWidthPx\(info\.windowWidth, zoomAreaLeft\)/)
  assert.match(preview, /resolveMediaZoomHeightPx\(info\.windowHeight, zoomAreaTop\)/)
  const cssHeaderHeight = parseInt(/\.preview-header \{ height: (\d+)rpx;/.exec(preview)?.[1] ?? '0')
  assert.equal(cssHeaderHeight, zoom.MEDIA_PREVIEW_HEADER_HEIGHT_RPX, `标题栏高度必须与 MEDIA_PREVIEW_HEADER_HEIGHT_RPX 一致，当前 ${cssHeaderHeight}rpx`)

  // 切图与重新打开都要回到完整适配，且不在关闭/编辑状态下写缩放。
  assert.match(preview, /function resetZoom\(\): void \{ zoomScale\.value = MEDIA_ZOOM_FIT_SCALE; zoomOffsetX\.value = 0; zoomOffsetY\.value = 0 \}/)
  assert.match(preview, /watch\(\(\): number => props\.index, \(\): void => \{ if \(props\.visible\) resetZoom\(\) \}\)/)
  assert.match(preview, /if \(visible\) \{ editing\.value = false; resetZoom\(\) \}/)

  // 移动端能力：不使用 H5 DOM / SVG / 浏览器事件。
  assert.doesNotMatch(preview, /document\.|<svg\b|addEventListener/)
})