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
  assert.equal(orientationModule.resolveExifOrientationRotation('6'), 90)
  assert.equal(orientationModule.resolveExifOrientationRotation('8'), 270)
  assert.equal(orientationModule.resolveExifOrientationRotation('3'), 180)
})

test('keeps photos untouched when the EXIF orientation is already upright or unknown', () => {
  assert.equal(orientationModule.resolveExifOrientationRotation('up'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation('up-mirrored'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation(''), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation('landscape'), 0)
  assert.equal(orientationModule.resolveExifOrientationRotation(null), 0)
})

/**
 * 缩略图按当前握持角反向补角：成片已在拍摄时回正，竖持为 0，机体转动时缩略图跟着补回来。
 */
test('rotates thumbnails against every physical device orientation', () => {
  assert.equal(orientationModule.resolveThumbnailRotation(0), 0)
  assert.equal(orientationModule.resolveThumbnailRotation(90), 270)
  assert.equal(orientationModule.resolveThumbnailRotation(180), 180)
  assert.equal(orientationModule.resolveThumbnailRotation(270), 90)
  assert.equal(orientationModule.resolveThumbnailRotation(-1), 0)
  assert.equal(orientationModule.resolveThumbnailRotation(359), 0)
})

/**
 * 原生插件（CameraImpl.kt）已用 image.imageInfo.rotationDegrees 把像素转过一次：屏幕锁定竖屏时
 * display.rotation 恒为 0，该值恒等于传感器朝向，只抵消装配、不抵消握持——握持姿态本来就在传感器帧里。
 * 这种竖图成片再顺时针补一次「按快门时的机身姿态」，照片就与手持姿势对齐：竖持 0 不重编码，
 * 横拍得到横图、内容朝上，竖着拿手机预览也是正的。
 */
test('uprights plugin-uprighted portrait pixels by the shutter pose', () => {
  assert.equal(orientationModule.resolveCaptureRotation('', 0, 3000, 4000), 0)
  assert.equal(orientationModule.resolveCaptureRotation('', 90, 3000, 4000), 90)
  assert.equal(orientationModule.resolveCaptureRotation('', 180, 3000, 4000), 180)
  assert.equal(orientationModule.resolveCaptureRotation('', 270, 3000, 4000), 270)
  // 插件不写 EXIF，残留方向标记不参与判断，避免与快门姿态叠加成错误角度。
  assert.equal(orientationModule.resolveCaptureRotation('right', 270, 3000, 4000), 270)
  assert.equal(orientationModule.resolveCaptureRotation('left', 90, 3000, 4000), 90)
  assert.equal(orientationModule.resolveCaptureRotation('up', 270, 3000, 4000), 270)
})

/**
 * 横图像素说明拿到的是传感器原始帧（插件没有转像素），按「传感器朝向 + 快门姿态」补一次即可与手持姿势对齐；
 * 传感器朝向取 EXIF 的 90/270（可信），缺失或为 0/180 时按常见后摄 90 兜底。
 */
test('uprights raw sensor frames by the sensor orientation plus the shutter pose', () => {
  assert.equal(orientationModule.resolveCaptureRotation('', 0, 4000, 3000), 90)
  assert.equal(orientationModule.resolveCaptureRotation('', 90, 4000, 3000), 180)
  // 反向横屏的传感器帧相对机身已经正向：传感器朝向 90 加快门 270 正好整周，无需再转。
  assert.equal(orientationModule.resolveCaptureRotation('', 270, 4000, 3000), 0)
  assert.equal(orientationModule.resolveCaptureRotation('right', 90, 4000, 3000), 180)
  assert.equal(orientationModule.resolveCaptureRotation('left', 270, 4000, 3000), 180)
  assert.equal(orientationModule.resolveCaptureRotation('up', 90, 4000, 3000), 180)
  // 正方形无法判断横竖：有 EXIF 就按 EXIF，否则拒绝按原图完成。
  assert.equal(orientationModule.resolveCaptureRotation('right', 90, 3000, 3000), 90)
  assert.equal(orientationModule.resolveCaptureRotation('', 90, 3000, 3000), -1)
  // 未知快门姿态（系统相机）只按 EXIF 处理。
  assert.equal(orientationModule.resolveCaptureRotation('down', -1, 4000, 3000), 180)
  assert.equal(orientationModule.resolveCaptureRotation('', -1, 4000, 3000), 0)
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
