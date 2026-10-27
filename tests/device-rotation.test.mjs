import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const orientationModule = await loadUtsModule('domain/imageOrientation.uts')

/** 陀螺仪读数按弧度/秒积分：正值代表屏幕朝观察者时逆时针，机身顺时针应得到正向累积。 */
test('gyroscope samples integrate into clockwise quarter turns', () => {
  let state = orientationModule.createDeviceRotationState()
  assert.equal(state.rotation, 0)
  assert.equal(state.accumulated, 0)

  // 顺时针转动 90°：z 轴为负角速度，0.4 秒内累计到 -90°，落在 90° 档位。
  state = orientationModule.applyGyroscopeSample(state, -Math.PI / 2 / 0.4, 0.4)
  assert.equal(state.rotation, 90)
  assert.ok(Math.abs(state.accumulated - 90) < 0.001)

  // 继续顺时针转到 180°。
  state = orientationModule.applyGyroscopeSample(state, -Math.PI / 2 / 0.4, 0.4)
  assert.equal(state.rotation, 180)
})

/** 逆时针方向必须得到 270° 档位，说明方向判定不是只判幅度。 */
test('counter-clockwise rotation lands on the opposite quadrant', () => {
  let state = orientationModule.createDeviceRotationState()
  state = orientationModule.applyGyroscopeSample(state, Math.PI / 2 / 0.4, 0.4)
  assert.equal(state.rotation, 270)
})

/** 静止死区吸收陀螺仪零偏：手不动时不能因为噪声慢慢判定成转过 90 度。 */
test('gyroscope dead zone keeps a resting phone at its current quadrant', () => {
  let state = orientationModule.createDeviceRotationState()
  for (let index = 0; index < 120; index++) {
    state = orientationModule.applyGyroscopeSample(state, 0.05, 0.2)
  }
  assert.equal(state.rotation, 0)
  assert.equal(state.accumulated, 0)
})

/** 45° 分界需要 15° 迟滞：刚过中线时不能抖动切换档位。 */
test('quadrant switching waits past the midpoint to avoid flicker', () => {
  let state = orientationModule.createDeviceRotationState()
  // 只转过 50°：越过 45° 中线但不足 60° 阈值，保持 0° 档位。
  state = orientationModule.applyGyroscopeSample(state, -(50 * Math.PI) / 180 / 0.5, 0.5)
  assert.equal(state.rotation, 0)

  // 补到 65°：越过阈值后切到 90° 档位。
  state = orientationModule.applyGyroscopeSample(state, -(15 * Math.PI) / 180 / 0.5, 0.5)
  assert.equal(state.rotation, 90)
})

/** 长回调间隔必须按上限截断，一次卡顿不能直接跨过多档。 */
test('a stalled gyroscope callback cannot jump more than a quarter turn', () => {
  let state = orientationModule.createDeviceRotationState()
  // 30 秒的间隔按 0.5 秒上限积分：π 弧度/秒只折算成 90°，而不是 15 圈。
  state = orientationModule.applyGyroscopeSample(state, -Math.PI, 30)
  assert.equal(state.rotation, 90)
  assert.ok(Math.abs(state.accumulated) <= 180)
})

/** 非法读数与原样返回：时长为 0 或数值缺失时不能改动跟踪状态。 */
test('invalid gyroscope samples leave the tracked rotation untouched', () => {
  const state = orientationModule.createDeviceRotationState()
  assert.equal(orientationModule.applyGyroscopeSample(state, -2, 0), state)
  assert.equal(orientationModule.applyGyroscopeSample(state, Number.NaN, 0.2).rotation, 0)
})

/** 纯函数：90°/270° 判为横屏，0°/180° 判为竖屏，负角度说明方向未知。 */
test('orientation label reports landscape, portrait and an unknown sensor', () => {
  assert.equal(orientationModule.resolveDeviceOrientationLabel(0), '竖屏')
  assert.equal(orientationModule.resolveDeviceOrientationLabel(180), '竖屏')
  assert.equal(orientationModule.resolveDeviceOrientationLabel(90), '横屏')
  assert.equal(orientationModule.resolveDeviceOrientationLabel(270), '横屏')
  assert.equal(orientationModule.resolveDeviceOrientationLabel(450), '横屏')
  assert.equal(orientationModule.resolveDeviceOrientationLabel(-1), '方向未知')
})

/** 启动异常要能区分「基座缺模块」和「设备启动失败」，否则真机上无法判断该不该重做基座。 */
test('gyroscope failures distinguish a missing module from a start failure', () => {
  assert.equal(orientationModule.resolveGyroscopeFailureLabel('UTS module _uni-gyroscope is not registered'), '陀螺仪未注册')
  assert.equal(orientationModule.resolveGyroscopeFailureLabel('startGyroscope:fail permission denied'), '陀螺仪启动失败')
  assert.equal(orientationModule.resolveGyroscopeFailureLabel(''), '陀螺仪启动失败')
})

/** 加速度计给绝对方向：不靠积分，进页面第一帧就能直接判出竖持、横持与倒置。 */
test('accelerometer samples resolve the absolute device quadrant', () => {
  const resolve = orientationModule.resolveAccelerometerRotation
  // 真机标定：该基座上报的是重力方向，竖持（头朝上）时 y 为负，必须判 0° 而不是 180°。
  assert.equal(resolve(0, -9.8, 0, orientationModule.DEVICE_ROTATION_UNKNOWN), 0)
  assert.equal(resolve(0, 9.8, 0, orientationModule.DEVICE_ROTATION_UNKNOWN), 180)
  // 向右横（landscape，顶部朝右）观察值 x 为正 → 90°；向左横（reverseLandscape）x 为负 → 270°。
  assert.equal(resolve(9.8, 0, 0, orientationModule.DEVICE_ROTATION_UNKNOWN), 90)
  assert.equal(resolve(-9.8, 0, 0, orientationModule.DEVICE_ROTATION_UNKNOWN), 270)
  // 取景时常见的 45° 俯倾：重力在屏幕平面上仍有分量，方向照常可判。
  assert.equal(resolve(0, -9.8 * Math.cos(Math.PI / 4), 9.8 * Math.sin(Math.PI / 4), orientationModule.DEVICE_ROTATION_UNKNOWN), 0)
})

/** 基座若上报传感器反作用力语义（竖持 y 为正），用标定参数整体镜像，判定结构与档位完全不变。 */
test('accelerometer reading sign mirrors for a base that reports the sensor reaction force', () => {
  const resolve = orientationModule.resolveAccelerometerRotation
  const unknown = orientationModule.DEVICE_ROTATION_UNKNOWN
  assert.equal(resolve(0, 9.8, 0, unknown, 1), 0)
  assert.equal(resolve(0, -9.8, 0, unknown, 1), 180)
  assert.equal(resolve(-9.8, 0, 0, unknown, 1), 90)
  assert.equal(resolve(9.8, 0, 0, unknown, 1), 270)
})

/** 换档迟滞：越过 45° 中线后还要多转 15°，避免临界点来回抖动。 */
test('accelerometer quadrant switching keeps a hysteresis band', () => {
  const resolve = orientationModule.resolveAccelerometerRotation
  const sampleAt = (degrees) => ({
    // 按真机上报的重力方向构造样本：机身顺时针转过 degrees 时，观察值 x 为正、y 为负。
    x: 9.8 * Math.sin((degrees * Math.PI) / 180),
    y: -9.8 * Math.cos((degrees * Math.PI) / 180),
    z: 0
  })
  const tilted50 = sampleAt(50)
  const tilted65 = sampleAt(65)
  const tilted40 = sampleAt(40)

  // 只转到 50°：越过 45° 中线但不足 60° 阈值，保持 0° 档。
  assert.equal(resolve(tilted50.x, tilted50.y, tilted50.z, 0), 0)
  // 补到 65°：越过阈值后切到 90° 档。
  assert.equal(resolve(tilted65.x, tilted65.y, tilted65.z, 0), 90)
  // 从横持反向回到 40°：同样保持 90° 档，不抖动。
  assert.equal(resolve(tilted40.x, tilted40.y, tilted40.z, 90), 90)
  // 第一帧没有历史档位，直接按绝对方向判定。
  assert.equal(resolve(tilted50.x, tilted50.y, tilted50.z, orientationModule.DEVICE_ROTATION_UNKNOWN), 90)
})

/** 平放或非法读数不能改判方向：重力几乎垂直于屏幕时横竖不可判，保持上一档而不是误报竖屏。 */
test('flat or invalid accelerometer readings keep the previous quadrant', () => {
  const resolve = orientationModule.resolveAccelerometerRotation
  assert.equal(resolve(0.03, 0.05, 9.8, 270), 270)
  assert.equal(resolve(0.03, 0.05, 9.8, orientationModule.DEVICE_ROTATION_UNKNOWN), orientationModule.DEVICE_ROTATION_UNKNOWN)
  assert.equal(resolve(Number.NaN, Number.NaN, Number.NaN, 90), 90)
  assert.equal(resolve(0, 0, 0, 90), 90)
})

/** 加速度计启动异常同样要区分「基座缺模块」和「设备启动失败」，便于真机定位。 */
test('accelerometer failures distinguish a missing module from a start failure', () => {
  assert.equal(orientationModule.resolveAccelerometerFailureLabel('UTS module _uni-accelerometer is not registered'), '加速度计未注册')
  assert.equal(orientationModule.resolveAccelerometerFailureLabel('startAccelerometer:fail permission denied'), '加速度计启动失败')
  assert.equal(orientationModule.resolveAccelerometerFailureLabel(''), '加速度计启动失败')
})

/** 加速度计是首选绝对方向来源；基座没注册该模块时必须自动退回陀螺仪积分，绝不阻塞拍摄。 */
test('capture page reads the accelerometer first and falls back to the gyroscope', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /uni\.startAccelerometer\(\{[\s\S]*?interval: 'ui'/)
  assert.match(page, /uni\.onAccelerometerChange\(handleAccelerometerChange\)/)
  assert.match(page, /uni\.offAccelerometerChange\(handleAccelerometerChange\)/)
  assert.match(page, /uni\.stopAccelerometer\(\)/)
  assert.match(page, /resolveAccelerometerRotation\(result\.x, result\.y, result\.z, deviceRotation\.value\)/)
  assert.match(page, /function fallbackToGyroscope\(reason: string\): void \{/)
  assert.match(page, /fallbackToGyroscope\(resolveAccelerometerFailureLabel\(result\.errMsg\)\)/)
  // 原始轴读数用于真机核对符号标定，并按固定间隔节流刷新，避免每个采样都重渲染原生视图。
  assert.match(page, /orientationSampleLabel/)
  assert.match(page, /SENSOR_SAMPLE_LABEL_INTERVAL_MS/)
  assert.doesNotMatch(page, /document\.|window\./)
})

/** 取景页左上角必须用同一份实时方向显示横竖屏角标，文案另有中英越三语译文。 */
test('capture page shows a top-left orientation badge translated for every locale', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const { translate } = await loadUtsModule('i18n/translate.uts')

  assert.match(page, /class="orientation-badge"/)
  assert.match(page, /resolveDeviceOrientationLabel\(deviceRotation\.value\)/)
  assert.match(page, /orientationAngleLabel !== ''/)
  assert.match(page, /\.orientation-badge \{ position: absolute; top: 24rpx; left: 24rpx;/)
  // 方向未知时必须把原因写在角标上（模块未注册/启动失败/收不到数据），而不是只留一个「未知」。
  assert.match(page, /resolveGyroscopeFailureLabel\(result\.errMsg\)/)
  assert.match(page, /markOrientationUnavailable\(accelerometerDiagnosticKey, '陀螺仪无数据'\)/)
  assert.match(page, /fail: \(result: StartGyroscopeFail\): void => \{/)
  assert.match(page, /orientationDiagnosticText !== ''/)
  // 角标属于取景区，必须排在底部控制条之前，不能挤进照片区。
  assert.ok(page.indexOf('orientation-badge') < page.indexOf('<CaptureControlBar'))
  for (const key of ['横屏', '竖屏', '方向未知', '加速度计未注册', '加速度计启动失败', '加速度计无数据', '陀螺仪未注册', '陀螺仪启动失败', '陀螺仪无数据']) {
    assert.notEqual(translate(key, 'en'), key, `缺少英文译文：${key}`)
    assert.notEqual(translate(key, 'vi'), key, `缺少越南语译文：${key}`)
  }
})

/**
 * 底部缩略图跟随机身反向旋转，观看者横竖握持都能看到正向图片；大图与保存的文件按照片自身已回正的方向。
 */
test('capture strip follows the handset while the big preview trusts the uprighted file', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')
  assert.match(page, /<CaptureStrip :items="captureItems" :device-rotation="deviceRotation"[^>]*\/>/)
  assert.match(strip, /:style="thumbnailRotationStyle"/)
  assert.match(strip, /resolveThumbnailRotation\(props\.deviceRotation\)/)
  assert.doesNotMatch(preview, /deviceRotation|resolveThumbnailRotation|previewRotationStyle|preview-media-rotated/)
  // 大图只按自身已回正的方向显示：缩放层只做缩放平移，不参与旋转。
  assert.match(preview, /<image class="preview-media" :src="displaySource" mode="aspectFit" \/>/)
  // 方向未知（-1）时不叠加旋转；成片已按快门姿态回正，缩略图只按当前握持角反向补角。
  assert.equal(orientationModule.resolveThumbnailRotation(orientationModule.DEVICE_ROTATION_UNKNOWN), 0)
  assert.equal(orientationModule.resolveThumbnailRotation(0), 0)
  assert.equal(orientationModule.resolveThumbnailRotation(90), 270)
  assert.equal(orientationModule.resolveThumbnailRotation(180), 180)
  assert.equal(orientationModule.resolveThumbnailRotation(270), 90)
  // 竖图成片在拍摄时按快门姿态补一次：横拍（90/270°）成片就是横图且内容朝上，竖着拿手机预览也是正的。
  assert.equal(orientationModule.resolveCaptureRotation('', 90, 3000, 4000), 90)
  assert.equal(orientationModule.resolveCaptureRotation('', 270, 3000, 4000), 270)
})

/** 自定义原生方向插件已彻底移除：工程里不能再有它的残留与引用。 */
test('the removed native orientation plugin leaves no source or route behind', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.doesNotMatch(page, /inspection-device-orientation|startDeviceOrientation|stopDeviceOrientation/)
  await assert.rejects(readFile('uni_modules/inspection-device-orientation/package.json', 'utf8'))
  await assert.rejects(readFile('tests/device-orientation.test.mjs', 'utf8'))
})