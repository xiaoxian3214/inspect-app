## 1.0.6（2026-06-28）
> 新增功能

- 无

> 问题修复

- 修复 Android 竖屏全屏预览偏模糊：预览分辨率策略改为按预览容器比例选择，竖屏优先 16:9，并提高预览长边请求，避免 4:3 低分辨率预览被裁切放大
- 修复 Android 点击对焦容易被 UseCase 的 AF mode 覆盖导致对焦不生效：移除 Preview/ImageCapture 中强制写入的 `CONTROL_AF_MODE`，交由 CameraX `CameraControl.startFocusAndMetering` 管理
- 修复 Android 连续点击对焦时旧请求取消结果污染当前对焦框状态：对焦请求增加序号，仅接受最后一次点击的结果
- 修复部分 Android 机型点击对焦后画面仍不稳定：对焦请求优先使用 `AF + AE` 区域，设备不支持 AE 区域时自动回退 `AF only`

> 功能优化

- Android 绑定相机后新增 `CameraX focus caps: ...` 诊断日志，输出 AF 模式、AF 区域数量、最近对焦距离与焦距信息，便于判断固定焦、超广角、外接摄像头等硬件限制
- Android 点击对焦结束新增 `CameraX focus end: ...` 诊断日志，便于排查真机对焦结果
## 1.0.5（2026-06-16）
> 新增功能

- Android 端内置点击对焦指示器：预览层显示四角对焦框，对焦中白色、成功绿色、失败红色，带缩放与淡出动画
- Android 端新增 `preview-rotation` 预览旋转属性及 `changePreviewRotation` 方法，支持外接摄像头 0°/90°/180°/270° 方向修正
- 预览旋转角度自动叠加到拍照成片（`totalRotation = EXIF旋转 + previewRotation`），确保外接摄像头场景照片方向正确
- iOS 端同步暴露 `preview-rotation` 属性与 `changePreviewRotation` 方法，保持双端 API 对齐
- 新增 `takePreviewRotation` 示例页面（`pages/camera/` 与 `pagesx/camera/`），演示外接摄像头方向修正

> 问题修复

- 修复 Android 预览模糊、预览与拍照构图不一致：引入 `UseCaseGroup` + `ViewPort` 共享传感器裁切，预览与 `ImageCapture` 视场对齐（WYSIWYG）
- 修复 Android 拍照时亮屏/屏幕场景中心过曝发白：移除拍照前 `cancelFocusAndMetering` 重置、统一使用 `MINIMIZE_LATENCY`，对焦仅触发 AF（`FLAG_AF`）不联动 AE
- 修复 Android 打开相机时多次无效 rebind 导致预览卡顿或模糊：`setPhotoResolution` 相同档位不再重复绑定，组件 `applyPreviewReady` 去除 `changePhotoResolution` 调用，demo 页去除 `onCameraOpened` 中的冗余分辨率设置

> 功能优化

- Android 预览分辨率策略与拍照侧统一为 4:3，新增 `buildPreviewResolutionSelector`，移除 `PREFER_HIGHER_RESOLUTION_OVER_CAPTURE_RATE`，避免拍照抢带宽导致预览流过低分辨率
- Android `PreviewView` 改回 `COMPATIBLE` 模式，提升国产机型预览稳定性
- Android 打开相机等待 `PreviewView` 布局完成（≥200px）后再绑定，布局尺寸变化超过 10% 自动 rebind
- Android 预览流使用 `CONTINUOUS_VIDEO` 对焦、拍照流保持 `CONTINUOUS_PICTURE`，近距离拍屏幕更稳定
- Android 绑定完成后输出 `CameraX bind: preview=... capture=...` 诊断日志，便于真机排查分辨率问题
- 方向事件 `orientationChange` payload 新增 `portrait` / `landscape` 布尔字段，方便页面直接判断横竖屏状态
- 组件 `photoResolution` prop watch 使用 `immediate: false`，避免组件挂载时触发不必要的 rebind
## 1.0.4（2026-06-15）
> 新增功能

- Android 端新增 `photo-resolution` 拍照图片分辨率属性：`low`、`medium`、`high`、`original`
- `photo-resolution` 按设备支持的 JPEG 输出尺寸选档，避免保存后缩放/二次压缩导致 high/original 画质偏低

> 问题修复

- 无

> 功能优化

- Android 端完善 `changeSizeSelectors` 参数处理，支持比例、小尺寸目标、对象参数与非法值兜底；与 `photo-resolution` 同时使用时拍照输出档位以 `photo-resolution` 为准
## 1.0.3（2026-05-28）
> 新增功能

- 无

> 问题修复

- 修复`原生预览层与系统权限弹窗的生命周期/层级竞争问题`导致首次打开相机拍照页面时，权限的请求弹窗出现在跳转前的页面，导致相机页面一直黑屏无法授权的问题

> 功能优化

- 无
## 1.0.2（2026-05-27）
> 新增功能

- uni-app x 模式由组件内 `UNI-APP-X` 条件编译自动判断（`data.uniAppX`），无需页面传参；x 项目走 `ImaCameraEventPayload`（`UTSJSONObject`），uni-app/nvue 保持原有 `Map` 回调
- 新增 `ImaCameraEventPayload.kt`、`ImaCameraResult.kt`；`ImaCameraXBridge` 按 `uniAppXMode` 分支 `emitEvent`
- `ImaCameraManager` 新增 `setEventListener(callback, uniAppX)`

> 问题修复

- iOS 拍照/录像事件字段与 Android 对齐（`ImaCameraEventPayload`、录像进度 `timeText`/`seconds`、视频 `suffix`/`size` 等）
- 修复 uni-app x 下拍照/录像事件 `path` 为空（移除 `index.vue` 中 `toEmitEventMap` / `copyJsonObjectToEmitMap` 手工拷贝）
- 修复打开相机闪退；`ImaCameraEventPayload` 跳过 null 字段
- 修复开始录像提示音播放两次：移除 `takeVideo`/`takeVideoSnapshot` 中重复的 `videoSound(true)`，仅由原生层在录像开始时播放

> 功能优化
> 无
## 1.0.1（2026-05-25）
> 新增功能

- `pages`是uni-app的示例
- `pagesx`是uni-app x的示例

> 问题修复
> 无

> 功能优化
> 无

## 1.0.0（2026-05-24）
> 新增功能

- 新增方法：`open`、`reopen`、`close`、`destroyCamera`、`takePhoto`、`takePhotoSnapshot`、`takeVideo`、`takeVideoSnapshot`、`stopVideo`、`changeZoom`、`setCameraZoom`、`changeWideAngle`、`changeZoomNormal`、`changeExposure`、`changeWhiteBalance`、`changeHdr`、`changeFacing`、`changeMode`、`changeOrientation`、`changeGrid`、`changeFlash`、`changeAudio`、`changeSuffix`、`changeSizeSelectors`、`changePreviewCorner`、`changeGallery`、`changePinchZoom`、`changeTapToFocus`、`openAppSettings`、`isOpened`
- 新增事件：`onCamera`、`onCameraOpened`、`onCameraClosed`、`onPictureTaken`、`onVideoTakenStart`、`onVideoTakenEnd`、`onVideoTakenProgress`、`onFocusStart`、`onAutoFocusStart`、`onFocusEnd`、`onZoomChanged`、`onCameraChange`、`onOrientationChanged`、`onCameraTakenError`、`onCameraError`
- `android端`的所有功能已完成开发、测试
- `harmony端`兼容式组件不支持
- 初始版

> 问题修复
> 无

> 功能优化
> 无
