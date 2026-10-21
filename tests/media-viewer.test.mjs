import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const { findMediaIndex, adjacentMedia, replaceMedia, editedMediaMetadata, canvasImageSource, editorTimeoutMessage } = await loadUtsModule('domain/mediaViewer.uts')

/** 原生图片信息提供可解码的本地路径时，画布不得继续使用可能是临时 URI 的原始地址。 */
test('canvas loads the resolved local image path', () => {
  assert.equal(canvasImageSource({ path: '/private/resolved.jpg' }, '_doc/original.jpg'), '/private/resolved.jpg')
  assert.equal(canvasImageSource({ path: '' }, '_doc/original.jpg'), '_doc/original.jpg')
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
    assert.match(editor, new RegExp(`const ${label} = computed\\(\\(\\) =>`))
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

  // CSS 覆盖层架构：标注用 view/text CSS 定位，不使用 Canvas 实时绘制
  assert.match(editor, /class="annotation-layer"/)
  assert.match(editor, /class="annotation-line"/)
  assert.match(editor, /class="annotation-rect"/)
  assert.match(editor, /class="annotation-ellipse"/)
  assert.match(editor, /class="annotation-text"/)
  assert.match(editor, /@touchstart="handleStageTouchStart"/)
  assert.match(editor, /@touchmove="handleStageTouchMove"/)
  assert.match(editor, /@touchend="handleStageTouchEnd"/)

  // 工具列表：选择/箭头/画笔/文字/矩形/圆形/旋转/撤销/删除
  assert.match(editor, /id: 'select'.*icon: '☝'/)
  assert.match(editor, /id: 'arrow'.*icon: '➤'/)
  assert.match(editor, /id: 'draw'.*icon: '✏'/)
  assert.match(editor, /id: 'text'.*icon: 'T'/)
  assert.match(editor, /id: 'rect'.*icon: '□'/)
  assert.match(editor, /id: 'ellipse'.*icon: '○'/)
  assert.match(editor, /id: 'rotate'.*icon: '↻'/)
  assert.match(editor, /id: 'undo'.*icon: '↩'/)
  assert.match(editor, /id: 'delete'.*icon: '🗑'/)

  // Canvas 保存逻辑仅用于最终导出
  assert.match(editor, /id="markup-save-canvas"/)
  assert.match(editor, /type="2d"/)
  assert.match(editor, /createCanvasContextAsync/)
  assert.match(editor, /canvasImageSource\(/)
  assert.match(editor, /toDataURL\(/)
  assert.match(editor, /writeFile\(/)

  // 图片加载
  assert.match(editor, /uni\.getImageInfo\(\{/)
  assert.match(editor, /class="image-stage"/)
  assert.match(editor, /class="edit-image"/)

  // 不依赖浏览器 DOM/SVG 等
  assert.doesNotMatch(editor, /document\.|window\.|<svg\b|localStorage/)
})

/** Android Kotlin 画布参数要求 Number，舞台引用及标注映射不能推断为 Any?。 */
test('image editor keeps native stage and canvas coordinates strongly typed', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /const stageRect = ref<StageOffset>\(\{ left: 0, top: 0 \}\)/)
  assert.match(editor, /const map = \(x: number, y: number\): Point =>/)
  assert.doesNotMatch(editor, /const map = \(x: number, y: number\) =>/)
})

/** 原生触摸坐标必须显式转数字，拖动回调使用局部快照避免 Kotlin 智能转换失效。 */
test('image editor normalizes native touch coordinates and snapshots drag state', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /const touchX: number = parseFloat\(\(touch\.clientX \?\? 0\)\.toString\(\)\)/)
  assert.match(editor, /const touchY: number = parseFloat\(\(touch\.clientY \?\? 0\)\.toString\(\)\)/)
  assert.match(editor, /const original = dragOriginal/)
  assert.match(editor, /const start = dragStartPoint/)
  assert.match(editor, /original != null && start != null/)
  assert.doesNotMatch(editor, /moveObject\(selectedObj\.value, dragOriginal,/)
})

/** 触摸状态结束后不保留旧选中/拖动数据；离开弹层忽略旧异步加载回调。 */
test('image editor clears drag and invalidates stale image loads', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /function resetEditorState\(\)[\s\S]*?loadRequestId \+= 1/)
  assert.match(editor, /function resetEditorState\(\)[\s\S]*?dragStartPoint = null/)
  assert.match(editor, /function resetEditorState\(\)[\s\S]*?dragOriginal = null/)
  assert.match(editor, /function handleStageTouchMove\([\s\S]*?const draft = currentDraft\.value/)
  assert.doesNotMatch(editor, /currentDraft\.value\['(x|y|cx|cy|points)'\]/)
})

/** Android UTS 转 Kotlin 时不同回调中的同名局部变量可能冲突，布局与导出须使用不同名称。 */
test('image editor uses distinct rotation flags for Android Kotlin scopes', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const layout = editor.match(/function layoutStage\([\s\S]*?\n\t\}/)?.[0] ?? ''
  const exportImage = editor.match(/img\.onload = \(\) => \{[\s\S]*?rc\.drawImage\(img,/)?.[0] ?? ''
  const layoutFlag = layout.match(/const (\w+) = rotation\.value === 90 \|\| rotation\.value === 270/)?.[1]
  const exportFlag = exportImage.match(/const (\w+) = rotation\.value === 90 \|\| rotation\.value === 270/)?.[1]
  assert.ok(layoutFlag && exportFlag, '布局和导出都应判断旋转状态')
  assert.notEqual(layoutFlag, exportFlag, 'Kotlin 生成代码中不可重复声明同名旋转标志')
})

/** 旋转后舞台宽高与导出像素保持一致，避免原图旋转时被画布裁切。 */
test('image editor rotates stage dimensions and draws source with original aspect ratio', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /const displayWidth = stageRotated \? imageHeight : imageWidth/)
  assert.match(editor, /const displayHeight = stageRotated \? imageWidth : imageHeight/)
  assert.match(editor, /const imageRatio = displayWidth \/ Math\.max\(1, displayHeight\)/)
  assert.match(editor, /const drawWidth = exportRotated \? ch : cw/)
  assert.match(editor, /const drawHeight = exportRotated \? cw : ch/)
  assert.match(editor, /rc\.drawImage\(img, -drawWidth \/ 2, -drawHeight \/ 2, drawWidth, drawHeight\)/)
})

/** 原生 2D canvas 的 width/height 模板属性未必重置底层像素缓冲，必须从实际 context 显式设置位图尺寸。 */
test('image editor sets actual canvas bitmap dimensions before drawing the whole photo', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const exportFlow = editor.split("const rc = ctx.getContext('2d')")[1]?.split('rc.clearRect')[0] ?? ''
  assert.match(exportFlow, /const cw = saveCanvasWidth\.value; const ch = saveCanvasHeight\.value/)
  assert.match(exportFlow, /rc\.canvas\.width = cw/)
  assert.match(exportFlow, /rc\.canvas\.height = ch/)
  assert.ok(exportFlow.indexOf('rc.canvas.width = cw') < exportFlow.indexOf('rc.canvas.height = ch'))
  assert.match(editor, /rc\.drawImage\(img, -drawWidth \/ 2, -drawHeight \/ 2, drawWidth, drawHeight\)/)
})

/** 保存后确认实际生成图片的宽高，防止只有默认画布左上角区域被导出仍误报成功。 */
test('image editor checks exported image dimensions before replacing the photo', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /function verifyExportedImage\(path: string, width: number, height: number,/)
  assert.match(editor, /Math\.round\(Number\(info\.width\)\) !== width/)
  assert.match(editor, /Math\.round\(Number\(info\.height\)\) !== height/)
  assert.match(editor, /verifyExportedImage\(path, cw, ch, settle\)/)
})

/** 导出画布必须限制单边像素：大图按原分辨率合成会瞬间占用上百 MB，在 Android 上直接 OOM 闪退。 */
test('photo editor caps canvas export size to avoid out-of-memory crash on save', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const cap = editor.match(/MAX_SAVE_CANVAS_SIDE\s*=\s*(\d+)/)
  assert.ok(cap != null, '导出画布必须声明单边像素上限')
  const maxSide = Number(cap[1])
  assert.ok(maxSide > 0 && maxSide <= 2048, `导出画布单边上限需处于安全内存范围，当前为 ${maxSide}`)
})

/** 解码回调必须在赋值 src 之前注册，否则原生解码回调早于监听注册会丢失，导出永不结束。 */
test('photo editor registers decode callbacks before assigning canvas image source', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const onloadIndex = editor.indexOf('img.onload =')
  const onerrorIndex = editor.indexOf('img.onerror =')
  const srcIndex = editor.indexOf('img.src = canvasImageSource(')
  assert.ok(onloadIndex >= 0 && onerrorIndex >= 0 && srcIndex >= 0, '导出流程必须注册解码回调并赋值图片源')
  assert.ok(onloadIndex < srcIndex, 'img.onload 必须先于 img.src 注册')
  assert.ok(onerrorIndex < srcIndex, 'img.onerror 必须先于 img.src 注册')
})

/** Android Kotlin 的定时器回调须返回 void，匿名函数不支持默认参数。 */
test('image export uses Kotlin-compatible promise and completion callbacks', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /await new Promise<void>\(resolve => \{\s*setTimeout\(\(\) => \{ resolve\(\) \}, 80\)\s*\}\)/)
  assert.match(editor, /const settle = \(error: Error \| null, resultPath: string\) =>/)
  assert.doesNotMatch(editor, /const settle = \(error: Error \| null, resultPath: string =/)
  const exportFlow = editor.split('const settle = ')[1]?.split('\n\t\t\t})')[0] ?? ''
  assert.match(exportFlow, /verifyExportedImage\(path, cw, ch, settle\)/)
  assert.match(editor, /function verifyExportedImage[\s\S]*?settle\(null, path\)/)
  const errorCalls = exportFlow.split('\n').filter((line) => line.includes('settle(new Error('))
  assert.ok(errorCalls.length >= 5, '需覆盖画布、图片加载及文件写入错误')
  for (const line of errorCalls) assert.match(line, /settle\(new Error\(.*\), ''\)/)
})

/** 导出必须带看门狗：原生回调不触发时给出明确失败，而不是永久停留在“保存中”。 */
test('photo editor fails image export when native callback never fires', async () => {
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(editor, /clearTimeout\(watchdog\)/)
  assert.match(editor, /图片导出超时/)
  assert.match(editor, /const settle = \(error: Error \| null/)
})