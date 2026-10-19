import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const orientationModule = await loadUtsModule('domain/imageOrientation.uts')

/**
 * 相机把机身横竖姿态写进照片的 EXIF 方向：left/right 表示像素横向存放，
 * 必须转 90/270 度才能正向展示，否则横拍照片在服务端与 PDF 里会一直歪着。
 */
test('maps EXIF orientation to the clockwise rotation that uprights a photo', () => {
  assert.equal(orientationModule.resolveExifOrientationRotation('right'), 90)
  assert.equal(orientationModule.resolveExifOrientationRotation('Right'), 90)
  assert.equal(orientationModule.resolveExifOrientationRotation('right-mirrored'), 90)
  assert.equal(orientationModule.resolveExifOrientationRotation('down'), 180)
  assert.equal(orientationModule.resolveExifOrientationRotation('down-mirrored'), 180)
  assert.equal(orientationModule.resolveExifOrientationRotation('left'), 270)
  assert.equal(orientationModule.resolveExifOrientationRotation('left-mirrored'), 270)
  assert.equal(orientationModule.resolveExifOrientationRotation('rotate-90'), 90)
  assert.equal(orientationModule.resolveExifOrientationRotation(' rotate-180 '), 180)
  assert.equal(orientationModule.resolveExifOrientationRotation('rotate-270'), 270)
})

test('keeps photos untouched when the EXIF orientation is already upright or unknown', () => {
  assert.equal(orientationModule.resolveExifOrientationRotation('up'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation('up-mirrored'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation(''), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation('landscape'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation(null), 0)
})

test('normalizes arbitrary angles into the four rotations the native API accepts', () => {
  assert.equal(orientationModule.normalizeRotation(0), 0)
  assert.equal(orientationModule.normalizeRotation(90), 90)
  assert.equal(orientationModule.normalizeRotation(-90), 270)
  assert.equal(orientationModule.normalizeRotation(450), 90)
  assert.equal(orientationModule.normalizeRotation(89.6), 90)
  assert.equal(orientationModule.normalizeRotation(360), 0)
  assert.equal(orientationModule.normalizeRotation(Number.NaN), 0)
})