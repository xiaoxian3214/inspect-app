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
