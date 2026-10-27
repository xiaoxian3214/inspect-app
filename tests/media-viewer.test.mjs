import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const { findMediaIndex, adjacentMedia, replaceMedia, editedMediaMetadata, canvasImageSource, editorTimeoutMessage, normalizeCanvasImagePath } = await loadUtsModule('domain/mediaViewer.uts')

/** 原生图片信息提供可解码的本地路径时，画布不得继续使用可能是临时 URI 的原始地址。 */
test('canvas loads the resolved local image path', () => {
  assert.equal(canvasImageSource({ path: '/private/resolved.jpg' }, '_doc/original.jpg'), '/private/resolved.jpg')
  assert.equal(canvasImageSource({ path: '' }, '_doc/original.jpg'), '_doc/original.jpg')
})

/** 画布 Image 只认本地路径：file:// 前缀必须去掉，否则导出解码失败。 */
test('canvas image source drops the file scheme prefix', () => {
  assert.equal(normalizeCanvasImagePath('file:///storage/emulated/0/DCIM/a.jpg'), '/storage/emulated/0/DCIM/a.jpg')
  assert.equal(normalizeCanvasImagePath('/storage/emulated/0/DCIM/a.jpg'), '/storage/emulated/0/DCIM/a.jpg')
  assert.equal(normalizeCanvasImagePath('_doc/uniapp_temp/a.jpg'), '_doc/uniapp_temp/a.jpg')
  // 其他协议与空值原样返回，避免破坏网络图与代码包资源。
  assert.equal(normalizeCanvasImagePath('content://media/external/images/1'), 'content://media/external/images/1')
  assert.equal(normalizeCanvasImagePath('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(normalizeCanvasImagePath('file://'), 'file://')
  assert.equal(normalizeCanvasImagePath(''), '')
})

/** 超时提示保留原生接口错误，避免把画布持续失败误判成偶发加载慢。 */
test('editor timeout identifies the stage and native failure', () => {
  assert.equal(editorTimeoutMessage('正在初始化画布…', 'canvas not found'), '正在初始化画布…超时，请重试：canvas not found')
  assert.equal(editorTimeoutMessage('正在读取图片…', ''), '正在读取图片…超时，请重试')
})

/** 同一媒体库按现有排序循环切换，且允许记录在异步更新后通过 photoId 定位。 */
test('navigates only the current media group and wraps at both ends', () => {
  const photos = [{ photoId: 'a' }, { photoId: 'b' }, { photoId: 'c' }]
  assert.equal(findMediaIndex(photos, { photoId: 'b' }), 1)
  assert.equal(adjacentMedia(photos, { photoId: 'c' }, 1), photos[0])
  assert.equal(adjacentMedia(photos, { photoId: 'a' }, -1), photos[2])
  assert.equal(adjacentMedia(photos, { photoId: 'absent' }, 1), null)
  assert.equal(adjacentMedia([], { photoId: 'a' }, 1), null)
  assert.equal(findMediaIndex([{ fileId: 'remote' }], { fileId: 'remote' }), 0)
})

/** 新图片保留业务归属，但旧远程文件与上传失败状态不能继承。 */
test('edited images become independent pending local media', () => {
  const old = { photoId: 'old', ownerType: 'checklist', ownerId: 'row', bizType: 'checkPoint', sortNo: 2, fileId: 'remote', filePath: '/old', thumbnailPath: '/thumb', previewUrl: '/preview', fileName: 'old.jpg', fileExt: 'jpg', mimeType: 'image/jpeg', md5: 'old-hash', uploadStatus: 'done', uploadError: 'old error', retryCount: 4 }
  const metadata = editedMediaMetadata(old)
  assert.equal(metadata.ownerId, 'row')
  assert.equal(metadata.bizType, 'checkPoint')
  assert.equal(metadata.sortNo, 2)
  for (const key of ['photoId', 'fileId', 'filePath', 'thumbnailPath', 'previewUrl', 'fileName', 'fileExt', 'mimeType', 'md5', 'uploadStatus', 'uploadError', 'retryCount']) assert.equal(metadata[key], undefined, key)
  const next = { ...metadata, photoId: 'new', localPath: '_doc/edited.png', uploadStatus: 'pending' }
  assert.deepEqual(replaceMedia([old, { photoId: 'other' }], old, next), [next, { photoId: 'other' }])
  assert.deepEqual(replaceMedia([old], { photoId: 'absent' }, next), [old])
})

/** Android 模板不可把导入的翻译函数当作 ref 解包调用，文案先在脚本中计算。 */
test('image editor template binds translated strings instead of invoking imported functions', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const template = editor.split('<script setup')[0]
  assert.doesNotMatch(template, /\bt\(/)
  assert.ok(editor.indexOf('const saving = ref(false)') < editor.indexOf('const saveLabel = computed('), '计算保存按钮文案前必须先声明保存状态')
  for (const label of ['cancelLabel', 'editorTitle', 'saveLabel', 'loadingLabel', 'loadFailedLabel', 'textPlaceholder', 'confirmLabel']) {
    assert.match(editor, new RegExp(`const ${label} = computed\\(\\(\\)(: string)? =>`))
    assert.match(template, new RegExp(`\\b${label}\\b`))
  }
})

/** 图片编辑器采用 CSS 覆盖层标注方案，仅在保存时使用 Canvas 合成导出。 */
test('photo editor uses CSS overlay annotation with canvas-only save', async () => {
  const checklist = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  const defect = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  const preview = await readFile('components/detail/PhotoEditorSheet.uvue', 'utf8')
  const detail = await readFile('pages/report/detail.uvue', 'utf8')
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')

  // 组件引用链
  assert.match(checklist, /photos: photo\?\.bizType === 'checkPoint' \? checkPointPhotos\.value : mediaPhotos\.value/)
  assert.match(defect, /photos: draft\.value\.photos/)
  assert.match(preview, /adjacentMedia\(/)
  assert.match(preview, /<ImageMarkupEditor/)
  assert.match(preview, /@edited="saveEditedImage"/)
  assert.match(preview, /if \(props\.saving\) return/)
  assert.match(preview, /uni\.getImageInfo\(/)
  assert.match(preview, /reportFileApi\.downloadInspectFile\(fileId, 'preview'\)/)
  assert.match(detail, /@edited="savePreviewEdit"/)
  assert.match(detail, /:saving="previewEditSaving"/)
  assert.match(detail, /if \(previewEditSaving\.value\) return/)
  assert.match(detail, /retainedPhotos = \(detail\.value\?\.photos \?\? \[\]\)\.filter/)

  // 画布架构：图片与标注都画在同一块 2D canvas 上，避免高密度折线用 view 拼装拖慢拖动
  assert.match(editor, /id="markup-canvas"/)
  assert.match(editor, /@touchstart="handleCanvasTouchStart"/)
  assert.match(editor, /@touchmove="handleCanvasTouchMove"/)
  assert.match(editor, /@touchend="handleCanvasTouchEnd"/)
  assert.match(editor, /@touchcancel="handleCanvasTouchCancel"/)
  assert.match(editor, /function renderEditor\(rc: CanvasRenderingContext2D/)

  // 工具列表：选择/画笔/橡皮/箭头/文字/矩形/圆形，外加旋转、撤销、重做、清空
  assert.match(editor, /id: 'select'/)
  assert.match(editor, /id: 'brush'/)
  assert.match(editor, /id: 'eraser'/)
  assert.match(editor, /id: 'arrow'/)
  assert.match(editor, /id: 'text'/)
  assert.match(editor, /id: 'rect'/)
  assert.match(editor, /id: 'ellipse'/)
  assert.match(editor, /function rotateImage\(/)
  assert.match(editor, /function undoEdit\(/)
  assert.match(editor, /function redoEdit\(/)
  assert.match(editor, /function clearAnnotations\(/)

  // Canvas 保存逻辑仅用于最终导出
  assert.match(editor, /id="markup-export-canvas"/)
})

/** 模板只绑定当前语言文案，不在模板里直接调用 t()，否则原生端渲染期无法重新翻译。 */
test('image editor keeps canvas rendering and export strongly typed', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  // Android Kotlin 要求画布上下文类型明确，坐标换算不得推断为 Any?
  assert.match(editor, /function renderEditor\(rc: CanvasRenderingContext2D, state: EditorState, display: EditorDisplay/)
  assert.match(editor, /function resolveSourceTouchPoint\(event: TouchEvent\): EditorPoint \| null/)
  // 触摸坐标必须显式转数字，画布位置用元素实测矩形同步获取
  assert.match(editor, /event\.touches\[0\]\?\.clientX \?\? event\.changedTouches\[0\]\?\.clientX \?\? 0/)
  assert.match(editor, /event\.touches\[0\]\?\.clientY \?\? event\.changedTouches\[0\]\?\.clientY \?\? 0/)
  assert.match(editor, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(editor, /createSelectorQuery/)
})

/** 手势提交后不保留旧草稿；离开弹层忽略旧异步回调。 */
test('image editor clears gestures and invalidates stale image loads', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /function resetEditorState\(\)[\s\S]*?loadRequestId \+= 1/)
  assert.match(editor, /function resetEditorState\(\)[\s\S]*?clearCanvasGesture\(\)/)
  assert.match(editor, /function clearCanvasGesture\(\) \{[\s\S]*?activeDraftStroke = null/)
  assert.match(editor, /function clearCanvasGesture\(\) \{[\s\S]*?lastBrushSourcePoint = null/)
  assert.match(editor, /function handleCanvasTouchMove\([\s\S]*?const draft = activeDraftStroke/)
  assert.doesNotMatch(editor, /currentDraft\.value\['(x|y|cx|cy|points)'\]/)
})

/** 旋转只改状态角度：预览与导出共用同一变换，标注坐标不随旋转重算。 */
test('image editor rotates through one shared canvas transform', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /function applyEditorRotation\(rc: CanvasRenderingContext2D, display: EditorDisplay, rotation: number\)/)
  // 图片与标注在同一旋转坐标系里绘制：drawImage 与 drawEditorStroke 都在 save/rotate 之后
  const render = editor.match(/function renderEditor\([\s\S]*?\n\t\}/)?.[0] ?? ''
  assert.ok(render.includes('applyEditorRotation(rc, display, state.rotation)'))
  assert.ok(render.indexOf('applyEditorRotation(rc, display, state.rotation)') < render.indexOf('rc.drawImage(targetImage'))
  assert.ok(render.indexOf('rc.drawImage(targetImage') < render.indexOf('drawEditorStroke(rc, strokes[index]'))
  // 导出画布尺寸必须按旋转交换宽高并限制单边像素，避免大图合成 OOM
  assert.match(editor, /resolveExportCanvasSize\(sourceImage\.value\.width, sourceImage\.value\.height, state\.rotation\)/)
})

/** 原生 2D canvas 的位图尺寸必须在 context 上显式设置，模板属性不保证重置像素缓冲。 */
test('image editor sets actual canvas bitmap dimensions before drawing the whole photo', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const bitmapFlow = editor.split('function ensureCanvasBitmap')[1]?.split('rc.setTransform')[0] ?? ''
  assert.match(bitmapFlow, /const ratio = pixelRatio/)
  assert.match(bitmapFlow, /rc\.canvas\.width = pixelWidth/)
  assert.match(bitmapFlow, /rc\.canvas\.height = pixelHeight/)
  const exportFlow = editor.split('function exportEditedImage(')[1]?.split('const display = resolveEditorDisplay')[0] ?? ''
  // 元素 CSS 尺寸按 dpr 折算（官方高清屏写法是 canvas.width = offsetWidth * dpr），位图才等于目标像素。
  assert.match(editor, /resolveEditorExportElementSize\(exportSize, pixelRatio\)/)
  assert.match(exportFlow, /rc\.canvas\.width = targetWidth/)
  assert.match(editor, /rc\.canvas\.height = targetHeight/)
  // App 平台宽高属性只读，渲染与校验必须以读回的位图尺寸为准。
  assert.match(exportFlow, /const bitmapWidth = rc\.canvas\.width > 0 \? rc\.canvas\.width : targetWidth/)
  assert.match(editor, /bitmapWidth < IMAGE_EDITOR_MIN_EXPORT_SIDE/)
  assert.match(editor, /rc\.drawImage\(targetImage, -drawWidth \/ 2, -drawHeight \/ 2, drawWidth, drawHeight\)/)
  // 导出画布显式复位变换，避免叠加显示用的 dpr 缩放导致只导出局部
  assert.match(editor, /rc\.setTransform\(1, 0, 0, 1, 0, 0\)/)
})

/** 保存后确认实际生成图片的宽高，防止只有默认画布左上角区域被导出仍误报成功。 */
test('image editor checks exported image dimensions before replacing the photo', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /function verifyExportedImage\(path: string, bitmapWidth: number, bitmapHeight: number,/)
  assert.match(editor, /isSameEditorAspectRatio\(width, height, bitmapWidth, bitmapHeight\)/)
  // 读不到尺寸说明落盘文件不可用，同样不能覆盖原图。
  assert.match(editor, /if \(!\(width > 0\) \|\| !\(height > 0\)\)/)
  assert.match(editor, /verifyExportedImage\(path, bitmapWidth, bitmapHeight, settle\)/)
})

/** 导出画布必须限制单边像素：大图按原分辨率合成会瞬间占用上百 MB，在 Android 上直接 OOM 闪退。 */
test('photo editor caps canvas export size to avoid out-of-memory crash on save', async () => {
  const editorModule = await readFile('domain/imageEditor.uts', 'utf8')
  const cap = editorModule.match(/IMAGE_EDITOR_MAX_EXPORT_SIDE\s*(?::\s*number)?\s*=\s*(\d+)/)
  assert.ok(cap != null, '导出画布必须声明单边像素上限')
  const maxSide = Number(cap[1])
  assert.ok(maxSide > 0 && maxSide <= 2048, `导出画布单边上限需处于安全内存范围，当前为 ${maxSide}`)
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /resolveExportCanvasSize\(/)
})

/** 解码回调必须在赋值 src 之前注册，否则原生解码回调早于监听注册会丢失，导出永不结束。 */
test('photo editor registers decode callbacks before assigning canvas image source', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const exportFlow = editor.split('function exportEditedImage(')[1] ?? ''
  const onloadIndex = exportFlow.indexOf('exportImage.onload =')
  const onerrorIndex = exportFlow.indexOf('exportImage.onerror =')
  const srcIndex = exportFlow.indexOf('exportImage.src = normalizeCanvasImagePath')
  assert.ok(onloadIndex >= 0 && onerrorIndex >= 0 && srcIndex >= 0, '导出流程必须注册解码回调并赋值图片源')
  assert.ok(onloadIndex < srcIndex, 'exportImage.onload 必须先于 exportImage.src 注册')
  assert.ok(onerrorIndex < srcIndex, 'exportImage.onerror 必须先于 exportImage.src 注册')
  // 预览解码同样先挂载回调：画布 Image 只认本地路径，file:// 前缀要去掉
  const previewFlow = editor.split('function refreshEditorWhenReady(')[1] ?? ''
  assert.ok(previewFlow.indexOf('image.onload =') < previewFlow.indexOf('image.src = normalizeCanvasImagePath'))
  assert.match(editor, /normalizeCanvasImagePath\(/)
})

/** Android Kotlin 的定时器回调须返回 void，匿名函数不支持默认参数。 */
test('image export uses Kotlin-compatible promise and completion callbacks', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /const settle = \(error: Error \| null, resultPath: string\) =>/)
  assert.doesNotMatch(editor, /const settle = \(error: Error \| null, resultPath: string =/)
  const exportFlow = editor.split('const settle = ')[1]?.split('\n\t\t\t})')[0] ?? ''
  assert.match(editor, /writeExportDataUrl\(context, bitmapWidth, bitmapHeight, settle\)/)
  assert.match(editor, /function verifyExportedImage[\s\S]*?settle\(null, path\)/)
  const errorCalls = exportFlow.split('\n').filter((line) => line.includes('settle(new Error('))
  assert.ok(errorCalls.length >= 2, '需覆盖画布、图片加载及文件写入错误')
  for (const line of errorCalls) assert.match(line, /settle\(new Error\(.*\), ''\)/)
  // 空 data URL 允许重试一次，避免原生还没刷完像素就判失败
  assert.match(editor, /function writeExportDataUrl[\s\S]*?setTimeout\(/)
})

/** 导出必须带看门狗：原生回调不触发时给出明确失败，而不是永久停留在"保存中"。 */
test('photo editor fails image export when native callback never fires', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /clearTimeout\(watchdog\)/)
  assert.match(editor, /图片导出超时/)
  assert.match(editor, /const settle = \(error: Error \| null/)
})

/** 编辑器与查看页必须共用同一套取景框：两边图片显示尺寸不一致用户会直接看出来。 */
test('image editor canvas box matches the viewer preview box', async () => {
  const zoom = await loadUtsModule('domain/mediaZoom.uts')
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const viewer = await readFile('components/camera/CapturePreview.uvue', 'utf8')

  // 标题栏高度与左右留白都来自同一组常量，任何一边改了立刻暴露。
  assert.match(editor, /MEDIA_PREVIEW_HEADER_HEIGHT_RPX, MEDIA_PREVIEW_SIDE_PADDING_RPX/)
  assert.match(editor, new RegExp(`\\.markup-header \\{[^}]*height: ${zoom.MEDIA_PREVIEW_HEADER_HEIGHT_RPX}rpx`))
  assert.match(viewer, new RegExp(`\\.preview-header \\{[^}]*height: ${zoom.MEDIA_PREVIEW_HEADER_HEIGHT_RPX}rpx`))
  assert.match(editor, new RegExp(`\\.editor-body \\{[^}]*margin-left: ${zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX}rpx[^}]*margin-right: ${zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX}rpx`))
  assert.match(viewer, new RegExp(`\\.preview-content \\{[^}]*padding-left: ${zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX}rpx[^}]*padding-right: ${zoom.MEDIA_PREVIEW_SIDE_PADDING_RPX}rpx`))

  // 工具条必须覆盖在图片下方而不是占位，否则图片可用高度变小、宽图会比查看页窄。
  assert.match(editor, /\.editor-toolbars \{ position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; \}/)
  // 画布铺满可绘制区：显示几何的居中偏移量是相对该区域左上角的，画布只有等于该区域图片才不会被推偏。
  assert.match(editor, /const canvasStyle = computed\(\(\): UTSJSONObject => \(\{ width: editorAreaWidth\.value \+ 'px', height: editorAreaHeight\.value \+ 'px' \}\)\)/)
  assert.match(editor, /rc\.canvas\.width = pixelWidth/)
  assert.match(editor, /Math\.round\(editorAreaWidth\.value \* ratio\)/)
  // 取景区必须扣掉工具条浮层高度：否则竖图底部会被底部操作区挡住。
  assert.match(editor, /id="markup-toolbars"/)
  assert.match(editor, /function resolveToolbarsHeight\(\): number \{/)
  assert.match(editor, /const fitArea = resolveEditorFitArea\(area, resolveToolbarsHeight\(\)\)/)
  assert.match(editor, /resolveEditorDisplay\(sourceWidth, sourceHeight, fitArea\.width, fitArea\.height, activeEditorState\(\)\.rotation\)/)
  // 画布大于图片显示区时必须整块清空，否则旋转/撤销会残留上一帧。
  assert.match(editor, /rc\.clearRect\(0, 0, Math\.max\(1, clearWidth\), Math\.max\(1, clearHeight\)\)/)
  assert.match(editor, /\.editor-body \{ position: relative; flex: 1;/)
  // 原生测量不可用时按查看页同款几何推算，避免取景框退化。
  assert.match(editor, /resolveEditorImageArea\(/)
  assert.match(editor, /isUsableEditorBox\(bodyRect, 40\)/)
})
