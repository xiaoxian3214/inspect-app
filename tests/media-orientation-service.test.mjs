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
    readImageInfo: async (path) => {
      if (options.readFails) throw new Error('no exif')
      return { orientation: path === (options.uprightPath ?? '/cache/upright.jpg') && !options.retainExif ? 'up' : options.exifOrientation ?? 'up', width: options.width ?? 3000, height: options.height ?? 4000 }
    },
    resolveUprightRotation: (exifOrientation) => {
      orientations.push(exifOrientation)
      return orientationModule.resolveUprightRotation(exifOrientation)
    },
    resolveCaptureRotation: (exifOrientation, shutterRotation, width, height) => {
      orientations.push(exifOrientation)
      return orientationModule.resolveCaptureRotation(exifOrientation, shutterRotation, width, height)
    },
    needsOrientationReset: orientationModule.needsOrientationReset,
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

/** 竖持拍摄（0°）命中竖图像素与快门姿态同值：不旋转、不重编码，画质保持原样。 */
test('keeps portrait captures byte-for-byte untouched', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: '', width: 3000, height: 4000 })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/portrait.jpg', 0), { path: '/cache/portrait.jpg', rotation: 0, failed: false })
  assert.equal(fake.rotations.length, 0)
})

/** 横拍按快门姿态补角：270°（头朝左）得到内容朝上的横图，竖着拿手机预览也是正的。 */
test('uprights a landscape capture by the shutter pose', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: '', width: 3000, height: 4000 })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/landscape.jpg', 270), { path: '/cache/upright.jpg', rotation: 270, failed: false })
  assert.deepEqual(fake.rotations, [{ path: '/cache/landscape.jpg', rotation: 270 }])
})

/** 竖图像素与残留 EXIF 同时存在时，rotation 0 必须重写成无标记文件，否则竖屏相册会重复转向。 */
test('clears stale orientation metadata from a portrait capture', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'right', width: 3000, height: 4000 })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/portrait.jpg', 0), { path: '/cache/upright.jpg', rotation: 0, failed: false })
  assert.deepEqual(fake.rotations, [{ path: '/cache/portrait.jpg', rotation: 0 }])
})

/** 清除旧方向标记失败不得把相册里会侧转的竖图当成已回正的照片提交。 */
test('blocks a plugin-uprighted portrait image if its stale EXIF cannot be removed', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: 'right', width: 3000, height: 4000, rotateFails: true })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/portrait.jpg', 0), { path: '/cache/portrait.jpg', rotation: 0, failed: true })
})

/** 横图像素说明拿到的是传感器原始帧：按「传感器朝向 + 快门姿态」补一次即可与手持姿势对齐。 */
test('uprights raw sensor frames by sensor orientation and shutter pose', async () => {
  const upright = createFakeOrientationDependencies({ exifOrientation: 'right', width: 4000, height: 3000 })
  assert.deepEqual(await upright.service.normalizeUpright('/cache/raw.jpg', 0), { path: '/cache/upright.jpg', rotation: 90, failed: false })
  assert.deepEqual(upright.rotations, [{ path: '/cache/raw.jpg', rotation: 90 }])

  // 缺可信 EXIF 时按常见后摄朝向 90 兜底，再加快门姿态。
  const noExif = createFakeOrientationDependencies({ exifOrientation: 'up', width: 4000, height: 3000 })
  assert.deepEqual(await noExif.service.normalizeUpright('/cache/raw.jpg', 90), { path: '/cache/upright.jpg', rotation: 180, failed: false })

  // 反向横屏（270°）的原始帧相对机身已经正向：90 加 270 正好整周，不需要旋转。
  const reverseLandscape = createFakeOrientationDependencies({ exifOrientation: '', width: 4000, height: 3000 })
  assert.deepEqual(await reverseLandscape.service.normalizeUpright('/cache/raw.jpg', 270), { path: '/cache/raw.jpg', rotation: 0, failed: false })
  assert.equal(reverseLandscape.rotations.length, 0)

  // left（270°）说明传感器朝向相反（前摄或反向装配的后摄），按 EXIF 取 270 再加姿态。
  const flippedSensor = createFakeOrientationDependencies({ exifOrientation: 'left', width: 4000, height: 3000 })
  assert.deepEqual(await flippedSensor.service.normalizeUpright('/cache/raw.jpg', 90), { path: '/cache/upright.jpg', rotation: 0, failed: false })

  const failing = createFakeOrientationDependencies({ exifOrientation: 'right', width: 4000, height: 3000, rotateFails: true })
  assert.deepEqual(await failing.service.normalizeUpright('/cache/raw.jpg', 0), { path: '/cache/raw.jpg', rotation: 90, failed: true })
})

/** 部分原生编码器的 rotate: 0 直接复制源文件，必须检查生成文件的 EXIF 而非只看返回路径。 */
test('rejects native zero-degree exports that retain the stale EXIF tag', async () => {
  const service = serviceModule.createMediaOrientationService({
    readImageInfo: async () => ({ orientation: 'right', width: 3000, height: 4000 }),
    resolveUprightRotation: orientationModule.resolveUprightRotation,
    resolveCaptureRotation: orientationModule.resolveCaptureRotation,
    needsOrientationReset: orientationModule.needsOrientationReset,
    rotateImageToUpright: async () => '/cache/copied-with-stale-exif.jpg'
  })
  assert.deepEqual(await service.normalizeUpright('/cache/portrait.jpg', 0), { path: '/cache/portrait.jpg', rotation: 0, failed: true })
})

/** 重写后的文件确实不带方向标记时，竖图成片可以按 rotation 0 入库。 */
test('accepts a rewritten zero-degree export whose EXIF was removed', async () => {
  const service = serviceModule.createMediaOrientationService({
    readImageInfo: async (path) => ({ orientation: path === '/cache/rewritten.jpg' ? 'up' : 'right', width: 3000, height: 4000 }),
    resolveUprightRotation: orientationModule.resolveUprightRotation,
    resolveCaptureRotation: orientationModule.resolveCaptureRotation,
    needsOrientationReset: orientationModule.needsOrientationReset,
    rotateImageToUpright: async () => '/cache/rewritten.jpg'
  })
  assert.deepEqual(await service.normalizeUpright('/cache/portrait.jpg', 0), { path: '/cache/rewritten.jpg', rotation: 0, failed: false })
})

test('marks an unreadable image orientation unresolved instead of assuming upright pixels', async () => {
  const fake = createFakeOrientationDependencies({ readFails: true })
  const result = await fake.service.normalizeUpright('/storage/cache/Pic_4.jpg')
  assert.deepEqual(result, { path: '/storage/cache/Pic_4.jpg', rotation: 0, failed: true })
  assert.equal(fake.rotations.length, 0)
})

/** 竖图成片一律按快门姿态回正；系统相机（姿态未知）仍按 EXIF 处理，不猜姿态。 */
test('uprights portrait pixels by shutter pose and leaves unknown-pose sources on EXIF', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: '', width: 3000, height: 4000 })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/shot.jpg', 90), { path: '/cache/upright.jpg', rotation: 90, failed: false })
  assert.deepEqual(fake.rotations, [{ path: '/cache/shot.jpg', rotation: 90 }])
  const album = createFakeOrientationDependencies({ exifOrientation: '', width: 4000, height: 3000 })
  assert.deepEqual(await album.service.normalizeUpright('/album/photo.jpg'), { path: '/album/photo.jpg', rotation: 0, failed: false })
})

/** 倒竖着拍（180°）同样按快门姿态补半周，成片不会上下颠倒。 */
test('rotates upside-down captures by the shutter pose', async () => {
  const fake = createFakeOrientationDependencies({ exifOrientation: '', width: 3000, height: 4000 })
  assert.deepEqual(await fake.service.normalizeUpright('/cache/upside-down.jpg', 180), { path: '/cache/upright.jpg', rotation: 180, failed: false })
  assert.deepEqual(fake.rotations, [{ path: '/cache/upside-down.jpg', rotation: 180 }])
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

/** 原生相机返回的 /storage 绝对路径不可读时，尝试 image 组件可识别的 file:// URI。 */
test('retries native image inspection and rotation with a file URI', async () => {
  const calls = []
  const previousUni = globalThis.uni
  globalThis.uni = {
    getImageInfo: ({ src, success, fail }) => {
      calls.push(['info', src])
      if (src.startsWith('file://')) success({ orientation: 'right' })
      else fail({ errMsg: 'cannot open raw path' })
    },
    compressImage: ({ src, rotate, quality, success, fail }) => {
      calls.push(['rotate', src, rotate, quality])
      if (src.startsWith('file://')) success({ tempFilePath: '/cache/upright.jpg' })
      else fail({ errMsg: 'cannot open raw path', errCode: 1300002 })
    }
  }
  try {
    const service = serviceModule.createAppMediaOrientationService(orientationModule.resolveUprightRotation, orientationModule.resolveCaptureRotation)
    assert.deepEqual(await service.normalizeUpright('/storage/cache/shot.jpg', 0), { path: '/cache/upright.jpg', rotation: 90, failed: false })
    assert.deepEqual(calls, [
      ['info', '/storage/cache/shot.jpg'],
      ['info', 'file:///storage/cache/shot.jpg'],
      ['rotate', '/storage/cache/shot.jpg', 90, 100],
      ['rotate', 'file:///storage/cache/shot.jpg', 90, 100]
    ])
  } finally {
    globalThis.uni = previousUni
  }
})

/** 自定义拍照回正只指定旋转角度与最高画质，不允许裁剪或缩放参数改变原图尺寸。 */
test('native upright export passes only src, rotate and quality 100 besides callbacks', async () => {
  const calls = []
  const previousUni = globalThis.uni
  globalThis.uni = {
    getImageInfo: ({ success }) => success({ orientation: 'right', width: 4000, height: 3000 }),
    compressImage: (options) => {
      calls.push(options)
      options.success({ tempFilePath: '/cache/upright.jpg' })
    }
  }
  try {
    const service = serviceModule.createAppMediaOrientationService(orientationModule.resolveUprightRotation, orientationModule.resolveCaptureRotation)
    assert.deepEqual(await service.normalizeUpright('/cache/shot.jpg', 0), { path: '/cache/upright.jpg', rotation: 90, failed: false })
    assert.equal(calls.length, 1)
    assert.deepEqual(Object.keys(calls[0]).sort(), ['fail', 'quality', 'rotate', 'src', 'success'])
    assert.equal(calls[0].src, '/cache/shot.jpg')
    assert.equal(calls[0].rotate, 90)
    assert.equal(calls[0].quality, 100)
  } finally {
    globalThis.uni = previousUni
  }
})

/** 两种本地地址均无法旋转时，不能把失败结果误当成回正成功。 */
test('reports an unresolved upright rotation after both native paths fail', async () => {
  const previousUni = globalThis.uni
  globalThis.uni = {
    getImageInfo: ({ success }) => success({ orientation: 'right' }),
    compressImage: ({ fail }) => fail({ errMsg: 'image cannot be decoded', errCode: 1300002 })
  }
  try {
    const service = serviceModule.createAppMediaOrientationService(orientationModule.resolveUprightRotation, orientationModule.resolveCaptureRotation)
    assert.deepEqual(await service.normalizeUpright('/storage/cache/shot.jpg', 0), { path: '/storage/cache/shot.jpg', rotation: 90, failed: true })
  } finally {
    globalThis.uni = previousUni
  }
})
