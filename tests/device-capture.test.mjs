import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const deviceCapture = await loadUtsModule('domain/deviceCapture.uts')

test('normalizes the system camera result into unique local paths', () => {
  assert.deepEqual(
    deviceCapture.normalizeDeviceCapturePaths(['/tmp/a.jpg', '', '/tmp/b.jpg', '/tmp/a.jpg']),
    ['/tmp/a.jpg', '/tmp/b.jpg']
  )
  assert.deepEqual(deviceCapture.normalizeDeviceCapturePaths(null), [])
})

test('prefixes native absolute capture paths so the image component can render them', () => {
  assert.equal(
    deviceCapture.resolveLocalMediaDisplayPath('/storage/emulated/0/Android/data/io.dcloud.uniappx/cache/uni-media/Pic_1.jpg'),
    'file:///storage/emulated/0/Android/data/io.dcloud.uniappx/cache/uni-media/Pic_1.jpg'
  )
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('  /data/user/0/app/cache/uni-media/Pic_2.jpg  '), 'file:///data/user/0/app/cache/uni-media/Pic_2.jpg')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('/storage/emulated/0/Android/data/io.dcloud.uniappx/cache/uni-media/Video_1.mp4'), 'file:///storage/emulated/0/Android/data/io.dcloud.uniappx/cache/uni-media/Video_1.mp4')
})

test('keeps already displayable media addresses untouched', () => {
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('file:///storage/emulated/0/a.jpg'), 'file:///storage/emulated/0/a.jpg')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('unifile://cache/uni-store/a.jpg'), 'unifile://cache/uni-store/a.jpg')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('/static/camera/xiangce.png'), '/static/camera/xiangce.png')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath(''), '')
  assert.equal(deviceCapture.resolveLocalMediaDisplayPath('   '), '')
})

test('treats a user cancellation of the device camera as a normal stop', () => {
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage('chooseImage:fail cancel'), true)
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage('chooseImage:fail camera permission denied'), false)
  assert.equal(deviceCapture.isDeviceCaptureCancelledMessage(''), false)
})

test('no longer limits how many photos one capture session keeps', () => {
  assert.equal(deviceCapture.resolveRemainingCaptureCount, undefined)
})

test('no longer exposes the removed continuous capture helper', () => {
  assert.equal(deviceCapture.shouldContinueBurstCapture, undefined)
})

/**
 * 取景与拍照必须放在页面里：createCameraContext 是页面级上下文，
 * 取景元素放进子组件时快门拍照会原生闪退；相机未就绪时也不允许调用 takePhoto。
 */
test('custom camera page previews in page and captures one photo per shutter press', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /<script setup lang="uts">/)
  assert.doesNotMatch(page, /export default\s*\{/)
  assert.doesNotMatch(page, /\bthis\./)
  assert.doesNotMatch(page, /ima-camerax-view|xview-camera-view|\$refs/)
  // 应用内快门必须继续走 camera 组件；系统相机只作为右上角的独立补拍入口存在。
  const shutterSection = page.split('function takePhoto()')[1].split('function captureFromSystemCamera()')[0]
  assert.doesNotMatch(shutterSection, /chooseImage|sourceType/)
  assert.match(page, /sourceType:\s*\['camera'\]/)
  assert.doesNotMatch(page, /DeviceBurstCamera/)

  assert.match(page, /<camera\b/)
  assert.match(page, /id="camera"/)
  assert.match(page, /:device-position="devicePosition"/)
  assert.match(page, /:resolution="'high'"/)
  assert.match(page, /photo-resolution="original"/)
  assert.match(page, /@initdone="handleCameraInitDone"/)
  assert.match(page, /@error="handleCameraError"/)
  assert.match(page, /@stop="handleCameraStop"/)

  assert.match(page, /uni\.createCameraContext\(\)/)
  assert.match(page, /context\.takePhoto\(\{/)
  // 自定义拍照要求原图画质：快门用 original 档位，不能再退回有损的 high/normal。
  assert.match(page, /quality: 'original'/)
  assert.doesNotMatch(page, /quality: 'high'|quality: 'normal'|quality: 'low'/)
  assert.match(page, /selfieMirror: false/)
  assert.match(page, /normalizeDeviceCapturePaths\(\[result\.tempImagePath \?\? ''\]\)/)
  assert.match(page, /appendCapturedMedia\(shotPaths, 'image', 0, shutterRotation\)/)

  assert.match(page, /if \(!cameraReady\.value\) \{\s*uni\.showToast\(\{ title: t\('正在启动相机…'\), icon: 'none' \}\)\s*return\s*\}/)
  assert.match(page, /try \{\s*context\.takePhoto\(\{/)
  assert.match(page, /catch \(error\) \{\s*capturing\.value = false\s*notifyCaptureFailure\(\)/)

  assert.match(page, /uni\.chooseImage\(/)
  assert.doesNotMatch(page, /sourceType:\s*\['album'\]/)

  assert.ok(page.indexOf('preview-wrap') < page.indexOf('<CaptureControlBar'), '取景框必须排在底部控制条之前')
  assert.ok(page.indexOf('<CaptureControlBar') < page.indexOf('<CaptureStrip'), '已拍照片必须留在整个页面最下方的照片区')
})

/**
 * 拍完的照片优先按 EXIF 回正，EXIF 缺失时按自定义快门的原生机身姿态回正；
 * 陀螺仪不可用时按压快门的方向保持未知，回正逻辑退回纯 EXIF。底部缩略图另随手机实时旋转。
 */
test('captured photos are uprighted from the device EXIF orientation while the strip follows the handset', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')
  const preview = await readFile('components/camera/CapturePreview.uvue', 'utf8')

  // 加速度计给绝对方向；基座未注册加速度计模块时自动退回陀螺仪积分，两条链路都不能依赖浏览器 API。
  assert.match(page, /uni\.startAccelerometer\(\{/)
  assert.match(page, /uni\.onAccelerometerChange\(handleAccelerometerChange\)/)
  assert.match(page, /OnAccelerometerChangeCallbackResult/)
  assert.match(page, /fallbackToGyroscope\(/)
  assert.match(page, /startDeviceRotationTracking\(\)/)
  assert.match(page, /uni\.onGyroscopeChange\(handleGyroscopeChange\)/)
  assert.doesNotMatch(page, /document\.|window\./)
  assert.match(page, /onShow\(\(\) =>/)
  assert.match(page, /onHide\(\(\) =>/)
  // 陀螺仪不可用时方向保持 -1：底部照片退回按文件自身方向展示，不叠加任何旋转。
  assert.match(page, /const deviceRotation = ref\(DEVICE_ROTATION_UNKNOWN\)/)
  assert.match(page, /deviceRotation\.value = DEVICE_ROTATION_UNKNOWN/)
  assert.match(page, /const shutterRotation = deviceRotation\.value/)

  // EXIF 优先；照片缺失 EXIF 时用快门角度，回正仍走串行队列。
  assert.match(page, /import \{[^}]*needsOrientationReset[^}]*resolveCaptureRotation[^}]*resolveUprightRotation[^}]*\} from '\.\.\/\.\.\/domain\/imageOrientation\.uts'/)
  assert.match(page, /const mediaOrientationService = createAppMediaOrientationService\(resolveUprightRotation, resolveCaptureRotation, needsOrientationReset\)/)
  assert.match(page, /if \(mediaType === 'image'\) \{\s*learnCaptureAspectRatio\(path\)\s*enqueueMediaUpright\(path, shutterRotation\)\s*\}/)
  assert.match(page, /uprightChain = previous\.then\(\(\): Promise<void> => runUprightTask\(path, shutterRotation\)\)/)
  assert.match(page, /if \(previous == null\) uprightChain = runUprightTask\(path, shutterRotation\)/)
  assert.match(page, /pending = latest === pending \? null : latest/)
  assert.match(page, /const result = await mediaOrientationService\.normalizeUpright\(path, shutterRotation\)/)
  // 回正结果按路径回查下标后原位替换：用户等待期间删除照片也不会写错位置。
  assert.match(page, /const currentIndex = capturedPaths\.value\.indexOf\(path\)/)
  assert.match(page, /capturedPaths\.value = replaceCapturePath\(capturedPaths\.value, currentIndex, result\.path\)/)
  // 回正失败保留原图供重拍，但禁止作为已回正照片交给详情页。
  assert.match(page, /failedUprightPaths\.value\.includes\(path\)/)
  assert.match(page, /pendingUprightPaths\.value\.includes\(path\)/)
  assert.doesNotMatch(page, /图片方向处理失败，已按原图保存/)
  // 视频保留原始文件，不参与回正。
  assert.match(page, /appendCapturedMedia\(videoPaths, 'video', Math\.max\(1, Math\.round\(durationSeconds\)\)\)/)

  // “完成”仅持久化本地文件；落盘前必须等回正结束，不在取景页上传。
  const finish = page.split('async function handleFinishCapture()')[1].split('/** 取消本次拍摄')[0]
  const waitIndex = finish.indexOf('await waitPendingMediaUpright()')
  assert.ok(waitIndex > 0, '完成拍摄前必须等待回正任务结束')
  assert.ok(waitIndex < finish.indexOf('mediaPersistenceService.persistMediaPath'), '等待回正必须发生在落盘之前')
  assert.match(finish, /if \(failedUprightPaths\.value\.length > 0\) \{[\s\S]*?return[\s\S]*?\}/)

  // 底部缩略图按当前握持角反向补角；大图直接展示拍摄时已回正的文件，不叠加展示旋转。
  assert.doesNotMatch(page, /:rotation="selectedCaptureRotation"/)
  assert.doesNotMatch(page, /<CapturePreview[^>]*:device-rotation/)
  assert.match(strip, /resolveThumbnailRotation\(props\.deviceRotation\)/)
  assert.match(strip, /item\.processing \|\| item\.failed/)
  assert.match(page, /if \(pendingUprightPaths\.value\.includes\(path\) \|\| failedUprightPaths\.value\.includes\(path\)\) return/)
  assert.doesNotMatch(preview, /rotation: \{ type: Number|imageStyle/)
})

/** 连拍与「使用 N 张照片」都已按需求移除，底部只保留取消、快门与完成等操作。 */
test('custom camera page drops burst and confirm button in favor of a finish action', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')

  assert.doesNotMatch(page, /连拍|使用 \{count\} 张照片|continuous|shouldContinueBurstCapture|continueTimer/)
  assert.doesNotMatch(controlBar, /连拍|使用 \{count\} 张照片|AppButton/)

  assert.match(controlBar, /translateText\('完成'\)/)
  assert.match(controlBar, /defineEmits\(\['cancel-capture', 'toggle-flash', 'change-zoom', 'switch-capture-mode', 'switch-camera', 'press-shutter', 'finish-capture'\]\)/)
  assert.match(page, /@press-shutter="takePhoto"/)
  assert.match(page, /@finish-capture="handleFinishCapture"/)

  assert.match(page, /@remove-photo="removeCapture"/)
  assert.match(strip, /defineEmits\(\['remove-photo', 'preview-photo'\]\)/)
  assert.match(strip, /translateText\('还没有照片，点击快门开始拍摄'\)/)
})

/** 已拍照片要能看清内容，拍摄不设累计张数上限，照片区因此只能报总数、不再接收上限参数。 */
test('captured photos render large and without a session photo limit', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')

  const thumbSize = parseInt(/\.capture-thumb \{ width: (\d+)rpx;/.exec(strip)?.[1] ?? '0')
  const stripHeight = parseInt(/\.capture-strip \{ height: (\d+)rpx;/.exec(strip)?.[1] ?? '0')
  assert.ok(thumbSize >= 140, `缩略图需要放大到 140rpx 以上，当前 ${thumbSize}rpx`)
  assert.ok(stripHeight >= thumbSize, `照片区高度不能小于缩略图高度，当前 ${stripHeight}rpx`)

  assert.doesNotMatch(strip, /maxCount|max-count|capture-strip-count|countLabel/)
  assert.match(strip, /class="capture-thumb-number"/)
  assert.match(page, /<CaptureStrip :items="captureItems" :device-rotation="deviceRotation" @remove-photo="removeCapture" @preview-photo="openCapturePreview" \/>/)
  assert.doesNotMatch(page, /maxCaptureCount|最多拍摄/)
})

/** 取景框按成片比例铺满中间区域（裁切不拉伸），照片条贴到屏幕最下方，可用高度因此不再留底部安全区。 */
test('custom camera fills the viewfinder area with the photo ratio and pins the strip to the bottom', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const controlBar = await readFile('components/camera/CaptureControlBar.uvue', 'utf8')
  const strip = await readFile('components/camera/CaptureStrip.uvue', 'utf8')

  assert.match(page, /<view class="preview-frame" :style="previewFrameStyle">/)
  assert.match(page, /<camera v-if="cameraMounted"[\s\S]*?class="camera-preview"/)
  assert.match(page, /\.camera-preview \{ width: 100%; height: 100%; \}/)
  // 取景区裁掉取景框溢出部分，照片条不再留底部安全区，中间的取景画面因此可以铺满。
  assert.match(page, /\.preview-wrap \{[^}]*overflow: hidden;/)
  assert.doesNotMatch(page, /panelBottomPadding|safeBottomPaddingPx/)
  assert.match(page, /resolveCaptureFrameSize\(info\.windowWidth, availableHeight, captureAspectRatio\.value\)/)
  // 首张成片读出真实像素后校正取景比例，读取失败时保持 4:3 默认值；临时标定行已随方向问题定位完成移除。
  assert.match(page, /learnCaptureAspectRatio\(path\)/)
  assert.match(page, /resolveCaptureAspectRatio\(info\.width, info\.height\)/)
  assert.doesNotMatch(page, /captureDiagnostic|normalizeExifText/)

  // 取景可用高度按底部面板实测高度扣减：控制条 140rpx + 照片区 168rpx，照片条贴底后没有额外留白。
  const controlHeight = parseInt(/\.capture-control-row \{ height: (\d+)rpx/.exec(controlBar)?.[1] ?? '0')
  const stripHeight = parseInt(/\.capture-strip \{ height: (\d+)rpx/.exec(strip)?.[1] ?? '0')
  const panelHeight = parseInt(/CAPTURE_PANEL_HEIGHT_RPX = (\d+)/.exec(page)?.[1] ?? '0')
  assert.equal(panelHeight, controlHeight + stripHeight, `取景可用高度常量必须与底部面板实际高度一致：${panelHeight}`)
})

/** 拍照页文案全部走页面级翻译方法，必须能在英文和越南语下取到译文。 */
test('custom camera copy is translated for English and Vietnamese', async () => {
  const { translate } = await loadUtsModule('i18n/translate.uts')
  const keys = [
    '正在启动相机…',
    '点击快门拍摄一张，照片会显示在下方',
    '还没有照片，点击快门开始拍摄',
    '已拍 {count} 张',
    '无法使用相机，请检查系统相机权限',
    '打开相册失败，请重试',
    '翻转',
    '相册',
    '完成'
  ]
  for (const key of keys) {
    assert.notEqual(translate(key, 'en'), key, `缺少英文译文：${key}`)
    assert.notEqual(translate(key, 'vi'), key, `缺少越南语译文：${key}`)
  }
})

/** 页面复用纯领域函数处理路径与张数，并把「完成」结果交给上一页。 */
test('custom camera page reuses capture domain helpers', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /normalizeDeviceCapturePaths/)
  assert.match(page, /isDeviceCaptureCancelledMessage/)
  assert.match(page, /appendCapturePaths/)
  assert.match(page, /function translateText\(key: string, params: UTSJSONObject = \{\}\): string \{ return t\(/)
})

/** 取景与拍照回调可能晚于页面销毁返回，必须置位销毁标记并清理定时器，避免 vapor 原生渲染闪退。 */
test('custom camera page guards post-unmount callbacks and timers', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')

  assert.match(page, /onMounted\(\(\) => \{\s*armCameraReadyFallback\(\)/)
  assert.match(page, /onBeforeUnmount\(\(\) => \{\s*disposed = true\s*stopDeviceRotationTracking\(\)\s*clearReadyFallbackTimer\(\)/)
  assert.match(page, /onUnmounted\(\(\) => \{\s*disposed = true\s*clearReadyFallbackTimer\(\)/)
  assert.match(page, /function clearReadyFallbackTimer\(\): void \{/)
  assert.match(page, /function armCameraReadyFallback\(\): void \{/)
  assert.match(page, /clearTimeout\(readyFallbackTimerId\)/)
  assert.match(page, /if \(disposed\) return/)
  assert.match(page, /success: \(result[^)]*\) => \{\s*if \(disposed\) return\s*capturing\.value = false/)
  assert.match(page, /fail: \(error\) => \{\s*if \(disposed\) return\s*capturing\.value = false/)
  assert.match(page, /import TopSafeArea from '\.\.\/\.\.\/components\/common\/TopSafeArea\.uvue'/)
  assert.match(page, /<TopSafeArea/)
})

/** 首页用户抽屉的「自定义拍照」入口必须落到取景页面，并保持原有 setImage 回传契约。 */
test('custom camera entry opens the capture page and keeps the setImage contract', async () => {
  const page = await readFile('pages/report/simple-camera.uvue', 'utf8')
  const list = await readFile('pages/report/list.uvue', 'utf8')
  const drawer = await readFile('components/inspection/UserInfoDrawer.uvue', 'utf8')
  const pages = JSON.parse((await readFile('pages.json', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))

  // 拍摄期间只用相机临时路径：落盘服务仅在“完成”时调用，页面自身不直接操作文件系统。
  assert.doesNotMatch(page, /uni\.getFileSystemManager\(\)|copyFile\(\{|saveFile\(\{/)
  assert.match(page, /const mediaPersistenceService = createAppMediaPersistenceService\(\)/)
  const finish = page.split('async function handleFinishCapture')[1].split('function handleCancelCapture')[0]
  assert.match(finish, /await mediaPersistenceService\.persistMediaPath\(/)
  assert.match(finish, /emitCaptureResult\(false, savedPaths\)/)
  assert.match(page, /\$callMethod\('setImage', \{ path: savedPaths\[0\], paths: savedPaths \}\)/)
  assert.match(page, /uni\.navigateBack\(\)/)
  assert.doesNotMatch(page, /xview-camera-view|ima-camerax-view|\$refs|\bString\s*\(/)

  assert.match(drawer, /@click="openCustomCamera"/)
  assert.match(list, /uni\.navigateTo\(\{ url: '\/pages\/report\/simple-camera' \}\)/)
  assert.equal(pages.pages.some((item) => item.path === 'pages/report/simple-camera'), true)
})

/** 相机取景整体搬到页面后，示例页与连拍组件必须彻底移除，示例入口改指同一页面。 */
test('demo mount and burst component are removed without leaving dead routes', async () => {
  const index = await readFile('pagesx/index/index.uvue', 'utf8')
  const pages = JSON.parse((await readFile('pages.json', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))

  assert.match(index, /toPage\('\/pages\/report\/simple-camera'\)/)
  assert.equal(pages.pages.some((item) => item.path === 'pagesx/camera/deviceCapture'), false)
  assert.equal(pages.pages.some((item) => item.path === 'pagesx/camera/takePhotoAll'), false)
  await assert.rejects(readFile('components/camera/DeviceBurstCamera.uvue', 'utf8'))
  await assert.rejects(readFile('pagesx/camera/deviceCapture.uvue', 'utf8'))
})
