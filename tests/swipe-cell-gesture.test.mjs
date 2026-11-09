import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const gesture = await loadUtsModule('domain/swipeCellGesture.uts')

test('locks vertical drags before checklist horizontal swipe handling starts', () => {
  assert.equal(gesture.resolveGestureAxis(4, 5, 10), 'pending')
  assert.equal(gesture.resolveGestureAxis(8, 24, 10), 'vertical')
  assert.equal(gesture.resolveGestureAxis(24, 8, 10), 'horizontal')
})

test('clamps checklist swipe movement to the H5 action widths', () => {
  assert.equal(gesture.clampSwipeOffset(140, 90, 280), 90)
  assert.equal(gesture.clampSwipeOffset(-360, 90, 280), -280)
  assert.equal(gesture.clampSwipeOffset(32, 90, 280), 32)
})

test('opens the matching H5 action side only after crossing the swipe threshold', () => {
  assert.deepEqual(gesture.resolveSwipeTarget(56, 90, 280, 48), { offset: 90, position: 'left' })
  assert.deepEqual(gesture.resolveSwipeTarget(-56, 90, 280, 48), { offset: -280, position: 'right' })
  assert.deepEqual(gesture.resolveSwipeTarget(20, 90, 280, 48), { offset: 0, position: 'closed' })
})

test('preserves an opened action while the finger starts a closing gesture', () => {
  assert.equal(gesture.resolveSwipeMove(90, -35, 90, 280), 55)
  assert.equal(gesture.resolveSwipeMove(-280, 80, 90, 280), -200)
})

test('closes an opened action after a short reverse drag instead of requiring a full-width drag', () => {
  assert.deepEqual(gesture.resolveSwipeRelease(-200, -280, 80, 90, 280, 48), { offset: 0, position: 'closed' })
  assert.deepEqual(gesture.resolveSwipeRelease(30, 90, -60, 90, 280, 48), { offset: 0, position: 'closed' })
})

test('keeps an opened action when the reverse drag does not cross the close threshold', () => {
  assert.deepEqual(gesture.resolveSwipeRelease(-250, -280, 30, 90, 280, 48), { offset: -280, position: 'right' })
  assert.deepEqual(gesture.resolveSwipeRelease(65, 90, -25, 90, 280, 48), { offset: 90, position: 'left' })
})

/**
 * 回归：四个结果按钮的展开宽度必须以 CSS rpx 收口。
 * uni.rpx2px 在 Android 上按 scaledDensity（含系统字体缩放）换算，系统字体放大后它会比 CSS 的 480rpx 小，
 * 旧实现直接把像素位移写进 transform，滑动只能露出 3 个按钮，最左侧【合格】被清单内容遮住。
 */
test('swipe visual offset always lands exactly on the CSS rpx action width', () => {
  // 常规字体：像素宽度与 CSS 一致，展开到 -480rpx
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(-230, 230, 480), -480)
  // 系统字体放大：rpx2px 只给出 314px，仍必须收口到 -480rpx，而不是停在 -314px
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(-314, 314, 480), -480)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(-157, 314, 480), -240)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(120, 120, 120), 120)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(0, 230, 480), 0)
})

test('swipe visual offset clamps drags that overshoot the action area and survives a zero width', () => {
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(-9999, 230, 480), -480)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(9999, 120, 120), 120)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(-90, 0, 480), -480)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(90, 0, 120), 120)
  assert.equal(gesture.resolveSwipeVisualOffsetRpx(0, 0, 480), 0)
})
