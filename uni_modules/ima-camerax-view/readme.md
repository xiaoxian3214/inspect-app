# 原生自定义相机拍照、视频录制 （ima-camerax-view）

`原生自定义相机拍照、视频录制 （ima-camerax-view）`是基于原生相机开发的UTS插件，支持`相机拍照`、`视频录制`
、可实现`点击聚焦`、`手势缩放`、
`自定义布局`、`自定义蒙版`（用于人脸拍照，身份证拍照等）。

# 原生自定义相机拍照、视频录制 （ima-camerax-view）

`原生自定义相机拍照、视频录制 （ima-camerax-view）`是基于原生相机开发的UTS插件，支持`相机拍照`、`视频录制`
、可实现`点击聚焦`、`手势缩放`、
`自定义布局`、`自定义蒙版`（用于人脸拍照，身份证拍照等）。

## ⚠️注意️

- `ima-camerax-view【本插件】`：[插件地址](https://ext.dcloud.net.cn/plugin?name=ima-camerax-view)
- `ima-camera-view【老插件】`：[插件地址](https://ext.dcloud.net.cn/plugin?name=ima-camera-view)【继续维护，只修复现存的一些bug，不再新增新功能】

新增 `ima-camerax-view` 原因：

- 1、底层 CameraView 库（`com.otaliastudios:cameraview`）自 **2021-10-27** 发布 v2.7.2 后长期无新版本，难以跟进 Android 新系统与新机型
- 2、主要是 CameraView 版无法使用一些相机的新特性，如：**超广角镜头切换（0.5x，`changeWideAngle`）**、**按倍率缩放（`setCameraZoom`，如 0.5 / 1.0 / 2.0）**、**多摄逻辑镜头切换**、**Camera2 白平衡 / HDR / 曝光补偿**、**录像进度（`onVideoTakenProgress`）与设备方向变化（`onOrientationChanged`）回调**等
- 3、CameraX 为 Google 官方 Jetpack 组件，生命周期、预览/拍照/录像 UseCase 组合更规范，长期维护有保障
- 4、可通过 Camera2 Interop 扩展超广角切换、光学/数码缩放、白平衡、HDR、曝光等能力，可扩展性更强
- 5、与旧版 `ima-camera-view` 组件 API 保持基本一致，便于从 CameraView 版平滑迁移




## 支持功能

- `open`：打开摄像头预览
- `reopen`：关闭后重新打开摄像头预览
- `close`：关闭摄像头预览
- `destroyCamera`：销毁相机预览视图
- `isOpened`：查询摄像头预览是否已打开
- `takePhoto`：拍照（标准拍照流程，含快门声/震动）
- `takePhotoSnapshot`：快照拍照（快速拍照，含快门声/震动）
- `takeVideo`：开始录制视频（可选 `duration` 最大时长，单位 ms，0 表示不限制）
- `takeVideoSnapshot`：快照方式录制视频（可选 `duration`）
- `stopVideo`：停止视频录制
- `changeZoom`：设置线性缩放（0～1，对应 CameraX `setLinearZoom`）
- `setCameraZoom`：设置光学/数码缩放倍数（如 0.5、1.0、2.0，对应 CameraX `setZoomRatio`）
- `changeWideAngle`：切换至超广角镜头（0.5x）
- `changeZoomNormal`：恢复标准主摄 1.0x 缩放
- `changeExposure`：设置曝光补偿（-2～2）
- `changeWhiteBalance`：设置白平衡（auto / incandescent / fluorescent / daylight / cloudy）
- `changeHdr`：设置 HDR 模式（off / on）
- `changeFacing`：切换前后摄像头（back / front）
- `changeMode`：切换相机模式（预留，当前未实现）
- `changeOrientation`：设置预览/输出方向（auto / portrait / landscape）
- `changeGrid`：设置预览网格及颜色（off / draw_3X3 / draw_4x4 / draw_phi）
- `changeFlash`：设置闪光灯模式（off / on / auto / torch）
- `changeAudio`：设置录像音频（on / off / mono / stereo）
- `changeSuffix`：设置照片输出格式（jpeg / jpg 等）
- `changeSizeSelectors`：设置目标分辨率比例（width、height、tolerance）
- `changePreviewCorner`：设置预览圆角（固定像素 radius 或比例 radiusRate）
- `changeGallery`：设置是否保存至系统相册
- `changePinchZoom`：开启/关闭手势双指缩放
- `changeTapToFocus`：开启/关闭点击对焦
- `openAppSettings`：打开系统应用设置（权限被永久拒绝时引导用户授权）

## 自定义调整

- 自定义调整页面地址：`uni_modules/ima-camerax-view/utssdk/app-android/index.vue`
- 蓝牙自拍杆、手机快捷键的自定义，可以参考文件中的`shortcutListener`方法
- 设置拍照、录制视频的声音，可以参考文件中的`photoSound`、`videoSound`方法

## 需要权限

- 摄像头、音频、文件读取、文件写入、震动

```text
"android.permission.CAMERA",
"android.permission.RECORD_AUDIO",
"android.permission.VIBRATE"
"android.permission.READ_EXTERNAL_STORAGE"
"android.permission.WRITE_EXTERNAL_STORAGE"
```

- 即：在`manifest.json`中的`distribute.android.permissions`加入

```text
// 拍摄照片和视频时需要
<uses-permission android:name="android.permission.CAMERA" /> 
// 拍摄视频时需要Audio.ON（默认）
<uses-permission android:name="android.permission.RECORD_AUDIO" /> 
// 读取拍照、录像文件文件时需要
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
// 报错拍照、录像文件文件时需要（默认保存到沙盒缓存）
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" /> 
// 震动权限
<uses-permission android:name="android.permission.VIBRATE" />
```

## 快门声音素材

- 将需要的快门声音放在`uni_modules/ima-camerax-view/utssdk/app-android/assets`下即可
- [熊猫办公](https://www.tukuppt.com/yinxiaomuban/kuaimenshengyin.html)
- [站长素材](https://sc.chinaz.com/tag_yinxiao/kuaimen.html)

## 使用示例【此示例的代码只实现了`相机拍照`的逻辑，更多示例请导入项目】

- 新建一个`camera.nvue`的文件
- ⚠️注意️：只能在`.nvue`、`.uvue`的文件后缀下才生效，不支持`.vue`

```nvue
<template>
	<view class="ima-camera" :style="{ width: windowWidth, height: windowHeight }">
		<ima-camerax-view
			ref="cameraRef"
			class="camera-view"
			:style="{ width: windowWidth + 'px', height: windowHeight + 'px' }"
			flash="on"
			@onPictureTaken="onPictureTaken"
			onFocusStart="onFocusStart"
		/>
		<view class="camera-menu">
			<!--返回键-->
			<cover-image @tap="back" class="camera-menu-button back" src="/static/camera/back.png" />
			<!--快门键-->
			<cover-image
				@tap="takePhoto"
				class="camera-menu-button shutter"
				src="/static/camera/shutter.png"
			/>
			<!--反转键-->
			<cover-image @tap="flip" class="camera-menu-button flip" src="/static/camera/flip.png" />
		</view>
	</view>
</template>

<script>
let _this = null
export default {
	data() {
		return {
			windowWidth: '', //屏幕可用宽度
			windowHeight: '', //屏幕可用高度
			facing: 'back'
		}
	},
	onLoad() {
		_this = this
		this.initCamera()
	},
	methods: {
		//初始化相机
		initCamera() {
			console.log('初始化相机')
			uni.getSystemInfo({
				success: (res) => {
					_this.windowWidth = res.windowWidth
					_this.windowHeight = res.windowHeight
				}
			})
		},
		onFocusStart(e) {
			console.log('聚焦', e)
		},
		takePhoto() {
			console.log('拍照', this.facing)
			this.$refs.cameraRef.takePhoto()
		},
		//返回
		back() {
			console.log('返回上一页', this.facing)
			uni.navigateBack()
		},
		//反转
		flip() {
			console.log('镜头反转', this.facing)
			this.facing = this.facing === 'back' ? 'front' : 'back'
			this.$refs.cameraRef.changeFacing(this.facing)
		},
		onPictureTaken(e) {
			console.log('拍照结果', e.detail)
			_this.snapshotsrc = e.detail?.path || ''
			_this.getTakenRes()
			uni.navigateBack()
		},
		//设置
		getTakenRes() {
			console.log('返回结果给上一页')
			let pages = getCurrentPages()
			let prevPage = pages[pages.length - 2] //上一个页面
			//直接调用上一个页面的setImage()方法，把数据存到上一个页面中去
			prevPage.$vm.setImage({ path: _this.snapshotsrc })
		}
	}
}
</script>

<style lang="scss">
.ima-camera {
	justify-content: center;
	align-items: center;

	.camera-view {
		width: 100%;
		background: #111;
	}

	.camera-menu {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 750rpx;
		height: 180rpx;
		z-index: 98;
		align-items: center;
		justify-content: center;

		&-button {
			width: 80rpx;
			height: 80rpx;
			position: absolute;
			bottom: 50rpx;
			z-index: 99;
			align-items: center;
			justify-content: center;
		}

		.back {
			left: 30rpx;
		}

		.shutter {
			width: 130rpx;
			height: 130rpx;
			left: 310rpx;
			bottom: 25rpx;
		}

		.flip {
			right: 30rpx;
		}
	}
}
</style>
```

## 常见的比例的定义（widthRatio，heightRatio）

```typescript
// 正方形
AspectRatio.of(1, 1)      // 1:1

// 竖屏比例
AspectRatio.of(9, 16)     // 9:16 (手机竖屏)
AspectRatio.of(3, 4)      // 3:4
AspectRatio.of(2, 3)      // 2:3
AspectRatio.of(10, 16)    // 10:16 (5:8)

// 横屏比例
AspectRatio.of(16, 9)     // 16:9 (宽屏)
AspectRatio.of(4, 3)      // 4:3 (传统)
AspectRatio.of(3, 2)      // 3:2 (照片)
AspectRatio.of(16, 10)    // 16:10 (8:5)
AspectRatio.of(21, 9)     // 21:9 (超宽屏)

// 建议比例
const AspectRatios = {
  // 1:1 正方形
  SQUARE: AspectRatio.of(1, 1),
  // 9:16 竖屏（手机默认）
  PORTRAIT: AspectRatio.of(9, 16),
  // 16:9 横屏
  LANDSCAPE: AspectRatio.of(16, 9),
  // 3:4 传统照片比例
  THREE_FOUR: AspectRatio.of(3, 4),
  // 4:3 传统相机比例
  FOUR_THREE: AspectRatio.of(4, 3)
}
```

## 不同场景的推荐值（tolerance）

```typescript
const TOLERANCE = {
  STRICT: 0.01.toFloat(),    // 非常严格，几乎精确匹配
  STANDARD: 0.05.toFloat(),  // 标准，推荐使用
  FLEXIBLE: 0.1.toFloat(),   // 灵活，兼容更多设备
  LOOSE: 0.2.toFloat()       // 宽松，可能匹配到意外比例
}
```

## Api

| 属性 | 类型 | 默认值 | 说明 | 平台 |
|------|------|--------|------|------|
| mode | String | `"picture"` | 相机模式：`picture`（拍照）、`video`（录视频，预留） | `android` |
| facing | String | `"back"` | 摄像头：`back`（后置）、`front`（前置） | `android` |
| flash | String | `"off"` | 闪光灯：`off`、`on`、`auto`、`torch` | `android` |
| previewCornerRadius | Number | `0` | 预览圆角半径（像素），与 `previewCornerRadiusRate` 二选一或组合使用 | `android` |
| previewCornerRadiusRate | Number | `0` | 预览圆角比例（0～1），相对短边计算 | `android` |
| whiteBalance | String | `"auto"` | 白平衡：`auto`、`incandescent`、`fluorescent`、`daylight`、`cloudy` | `android` |
| hdr | String | `"off"` | HDR：`off`、`on` | `android` |
| audio | String | `"on"` | 录像音频：`on`、`off`、`mono`、`stereo` | `android` |
| photoSuffix | String | `"jpeg"` | 照片格式：`jpeg`、`jpg` 等 | `android` |
| photo-resolution | String | `"medium"` | 拍照图片分辨率：`low`、`medium`、`high`、`original`；与 `changeSizeSelectors` 同时使用时拍照分辨率以该属性为准 | `android` |
| orientation | String | `"auto"` | 预览/输出方向：`auto`、`portrait`、`landscape` | `android` |
| shutter | Boolean | `true` | 拍照时是否播放快门声（为 `true` 时 `sound` 才生效） | `android` |
| sound | String | `""` | 拍照声音文件名，mp3 放在 `uni_modules/ima-camerax-view/utssdk/app-android/assets` 下；空则系统默认 | `android` |
| vibrate | Boolean | `false` | 拍照时是否震动（为 `true` 时 `duration` 才生效） | `android` |
| duration | Number | `300` | 拍照震动时长，单位 ms | `android` |
| gallery | Boolean | `false` | 是否保存至系统相册 | `android` |
| grid | String | `"off"` | 预览网格：`off`、`draw_3X3`、`draw_4x4`、`draw_phi` | `android` |
| gridColor | String | `"#808080"` | 网格线颜色，如 `#fff`、`#808080` | `android` |
| recorder | Boolean | `true` | 录像时是否播放提示音（为 `true` 时 `sound2` 才生效） | `android` |
| sound2 | String | `""` | 录像提示音文件名，路径同 `sound` | `android` |
| shortcut | Boolean | `false` | 是否开启音量键 / 蓝牙自拍杆快捷键 | `android` |
| pinchZoom | Boolean | `true` | 是否开启手势双指缩放 | `android` |
| tapToFocus | Boolean | `true` | 是否开启点击对焦（Android 内置四角对焦框指示器） | `android` |

## 方法

| 方法名称 | 说明 | 方法参数 | 平台 |
|----------|------|----------|------|
| open | 打开摄像头预览 | 无 | `android` |
| reopen | 关闭后重新打开摄像头预览 | 无 | `android` |
| close | 关闭摄像头预览 | 无 | `android` |
| destroyCamera | 销毁相机预览视图 | 无 | `android` |
| isOpened | 查询预览是否已打开 | 无，返回 `Boolean` | `android` |
| takePhoto | 拍照（标准流程，含快门声/震动） | 无 | `android` |
| takePhotoSnapshot | 快照拍照（快速拍照，含快门声/震动） | 无 | `android` |
| takeVideo | 开始录制视频 | `duration`：最大时长（ms），`0` 表示不限制 | `android` |
| takeVideoSnapshot | 快照方式录制视频 | `duration`：最大时长（ms），`0` 表示不限制 | `android` |
| stopVideo | 停止视频录制 | 无 | `android` |
| changeZoom | 设置线性缩放 | `zoom`：0～1（对应 CameraX `setLinearZoom`） | `android` |
| setCameraZoom | 设置缩放倍数 | `ratio`：如 `0.5`、`1.0`、`2.0`（对应 CameraX `setZoomRatio`） | `android` |
| changeWideAngle | 切换至超广角镜头 | 无 | `android` |
| changeZoomNormal | 恢复标准主摄 1.0x | 无 | `android` |
| changeExposure | 设置曝光补偿 | `exposure`：-2～2，默认 `0` | `android` |
| changeWhiteBalance | 设置白平衡 | `whiteBalance`：参考 Api 中 `whiteBalance` | `android` |
| changeHdr | 设置 HDR | `hdr`：参考 Api 中 `hdr` | `android` |
| changeFacing | 切换前后摄像头 | `facing`：参考 Api 中 `facing` | `android` |
| changeMode | 切换相机模式 | `mode`：预留，当前未实现 | `android` |
| changeOrientation | 设置预览/输出方向 | `orientation`：参考 Api 中 `orientation` | `android` |
| changeGrid | 设置预览网格及颜色 | `grid`、`color`（可选，默认取 prop `gridColor`） | `android` |
| changeFlash | 设置闪光灯 | `flash`：参考 Api 中 `flash` | `android` |
| changeAudio | 设置录像音频 | `audio`：参考 Api 中 `audio` | `android` |
| changeSuffix | 设置照片输出格式 | `suffix`：参考 Api 中 `photoSuffix` | `android` |
| changePhotoResolution | 设置拍照图片分辨率 | `resolution`：`low`、`medium`、`high`、`original` | `android` |
| changeSizeSelectors | 设置预览目标比例/尺寸 | `width`、`height`、`tolerance`（容差 0～1，建议 0.05～0.15），也可传 `{ width, height, tolerance }`；拍照输出档位优先受 `photo-resolution` 控制 | `android` |
| changePreviewCorner | 设置预览圆角 | `radius`（像素，可选）、`radiusRate`（比例，可选） | `android` |
| changeGallery | 设置是否保存至相册 | `gallery`：`true` / `false` | `android` |
| changePinchZoom | 开启/关闭手势缩放 | `enabled`：`true` / `false` | `android` |
| changeTapToFocus | 开启/关闭点击对焦 | `enabled`：`true` / `false` | `android` |
| openAppSettings | 打开系统应用设置（权限被永久拒绝时） | 无 | `android` |

## 事件

| 事件名称 | 说明 | 回调参数 | 平台 |
|----------|------|----------|------|
| onCamera | 相机打开（`onCameraOpened` 别名） | `{ facing, physicalCameraId, cameraId }` | `android` |
| onCameraOpened | 相机打开 | `{ facing, physicalCameraId, cameraId }` | `android` |
| onCameraClosed | 相机关闭 | `{}` | `android` |
| onPictureTaken | 拍照完成 | `{ path, uri, fast, isFront, width, height, rotation }` | `android` |
| onVideoTakenStart | 录像开始 | `{ path, elapsed, timeText, duration }` | `android` |
| onVideoTakenProgress | 录像进度（约 500ms 一次） | `{ elapsed, duration, seconds, timeText }` | `android` |
| onVideoTakenEnd | 录像完成 | `{ path, uri, duration, size, suffix }` | `android` |
| onFocusStart | 对焦开始（Android 同步显示内置对焦框） | `{ x, y }`（归一化坐标 0～1） | `android` |
| onAutoFocusStart | 自动对焦开始（`onFocusStart` 别名） | `{ x, y }` | `android` |
| onFocusEnd | 对焦结束 | `{ x, y, success }` | `android` |
| onZoomChanged | 缩放变化 | `{ minZoomRatio, maxZoomRatio, linearZoom, zoomRatio }` | `android` |
| onCameraChange | 相机参数变更 | `{ action, message }` | `android` |
| onOrientationChanged | 设备方向变化 | `{ angle, orientation, isPortrait, isLandscape }` | `android` |
| onCameraTakenError | 拍照/录像失败 | `{ action, message }` | `android` |
| onCameraError | 相机错误 | `{ action, message }` | `android` |
