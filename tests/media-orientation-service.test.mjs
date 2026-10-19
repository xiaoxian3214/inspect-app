import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const orientationModule = await loadUtsModule('domain/imageOrientation.uts')
const serviceModule = await loadUtsModule('services/mediaOrientationService.uts')

/**
 * 构造带断言的假依赖：模拟 uni.getImageInfo 与 uni.compressImage，并记录旋转调用与方向入参。
 * @param options exifOrientation 假方向；rotateFails 模拟旋转失败；uprightPath 旋转后的新路径；readFails 模拟读方向失败
 */
function createFakeOrientationDependencies(options = {}) {
  const rotations = []
  const orientations = []
  const service = serviceModule.createMediaOrientationService({
    readExifOrientation: async (path) => {
      if (options.readFails) throw new Error('no exif')
      return options.exifOrientation ?? 'up'
    },
    resolveUprightRotation: (exifOrientation) => {
      orientations.push(exifOrientation)
      return orientationModule.resolveUprightRotation(exifOrientation)
    },
    rotateImageToUpright: async (path, rotation) => {
      rotations.push({ path: path, rotation: rotation })
      if (options.rotateFails) throw new Error('rotate failed')
      return options.uprightPath ?? '/cache/upright.jpg'
    }
  })
  return { service: service, rotations: rotations, orientations: orientations }
}

test('uprights a landscape photo using the orientation written by the device', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'right', uprightPath: '/cache/upright.jpg' })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_1.jpg')
  assert.deepEqual(result, { path: '/cache/upright.jpg', rotation: 90, failed: false })
  assert.deepEqual(fake.rotations, [{ path: '/storage/cache/Pic_1.jpg', rotation: 90 }])
})

test('passes the raw EXIF text to the injected orientation mapping', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'down-mirrored' })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_3.jpg')
  assert.deepEqual(fake.orientations, ['down-mirrored'])
  assert.deepEqual(result, { path: '/cache/upright.jpg', rotation: 180, failed: false })
})

test('keeps an already upright photo byte-for-byte untouched', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'up' })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_2.jpg')
  assert.deepEqual(result, { path: '/storage/cache/Pic_2.jpg', rotation: 0, failed: false })
  assert.equal(fake.rotations.length, 0)
})

test('treats an unreadable orientation as upright instead of failing the capture', async () => {
  const fake = createFakeOrientationDependencies({ readFails: true })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_4.jpg')
  assert.deepEqual(result, { path: '/storage/cache/Pic_4.jpg', rotation: 0, failed: false })
  assert.equal(fake.rotations.length, 0)
})

test('falls back to the original path when the native rotation fails', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'left', rotateFails: true })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_5.jpg')
  assert.deepEqual(result, { path: '/storage/cache/Pic_5.jpg', rotation: 270, failed: true })
})

test('ignores an empty path without touching the native APIs', async () => {
  const fake = createFakeOrientationDependencies()
  const result = await fake.service.normalizeUpright('   ')
  assert.deepEqual(result, { path: '', rotation: 0, failed: false })
  assert.equal(fake.rotations.length, 0)
  assert.equal(fake.orientations.length, 0)
})