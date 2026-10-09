import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const orientationModule = await loadUtsModule('domain/imageOrientation.uts')

test('maps accelerometer gravity to a stable counter-rotation for media thumbnails', () => {
  assert.equal(orientationModule.resolveMediaPreviewRotation(0, -1, 180), 0)
  assert.equal(orientationModule.resolveMediaPreviewRotation(1, 0, 0), -90)
  assert.equal(orientationModule.resolveMediaPreviewRotation(-1, 0, 0), 90)
  assert.equal(orientationModule.resolveMediaPreviewRotation(0, 1, 0), 180)
  assert.equal(orientationModule.resolveMediaPreviewRotation(0.2, -0.1, 90), 90)
  assert.equal(orientationModule.resolveMediaPreviewRotation(0.68, -0.62, 180), 180)
})

test('rotates each thumbnail only by the delta from its capture orientation', () => {
  assert.equal(orientationModule.resolveMediaPreviewRotationDelta(-90, -90), 0)
  assert.equal(orientationModule.resolveMediaPreviewRotationDelta(90, 90), 0)
  assert.equal(orientationModule.resolveMediaPreviewRotationDelta(0, -90), 90)
  assert.equal(orientationModule.resolveMediaPreviewRotationDelta(-90, 0), -90)
  assert.equal(orientationModule.resolveMediaPreviewRotationDelta(90, -90), 180)
})
