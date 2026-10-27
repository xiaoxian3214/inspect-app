import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const editor = await loadUtsModule('domain/imageEditor.uts')

test('normalizes editor rotation into quarter turns', () => {
  assert.deepEqual(editor.IMAGE_EDITOR_ROTATIONS, [0, 90, 180, 270])
  assert.equal(editor.IMAGE_EDITOR_ROTATION_STEP, 90)
  assert.equal(editor.normalizeEditorRotation(0), 0)
  assert.equal(editor.normalizeEditorRotation(90), 90)
  assert.equal(editor.normalizeEditorRotation(450), 90)
  assert.equal(editor.normalizeEditorRotation(-90), 270)
  assert.equal(editor.normalizeEditorRotation(360), 0)
  // 非法读数按不旋转处理，避免导出出现任意角度导致画面糊边。
  assert.equal(editor.normalizeEditorRotation(Number.NaN), 0)
  assert.equal(editor.isQuarterTurn(90), true)
  assert.equal(editor.isQuarterTurn(270), true)
  assert.equal(editor.isQuarterTurn(180), false)
})

test('rotating the editor keeps annotation coordinates in source space', () => {
  const state = editor.createEditorState()
  assert.equal(state.rotation, 0)
  assert.deepEqual(state.strokes, [])

  const withStroke = editor.appendEditorStroke(state, { tool: 'brush', points: [{ x: 10, y: 20 }] })
  const rotated = editor.rotateEditorState(withStroke)
  // 旋转只记录角度：标注坐标永远保存在未旋转的源图坐标系里，渲染时统一旋转。
  assert.equal(rotated.rotation, 90)
  assert.deepEqual(rotated.strokes[0].points, [{ x: 10, y: 20 }])
  assert.equal(editor.rotateEditorState(rotated, 270).rotation, 0)
  // 原状态不被改写。
  assert.equal(withStroke.rotation, 0)
})

test('editor history supports undo, redo, branch truncation and a snapshot limit', () => {
  assert.equal(editor.IMAGE_EDITOR_HISTORY_LIMIT, 50)
  let history = editor.createEditorHistory(editor.createEditorState())
  assert.equal(editor.canUndoEditorHistory(history), false)
  assert.equal(editor.canRedoEditorHistory(history), false)

  history = editor.recordEditorHistory(history, editor.appendEditorStroke(editor.createEditorState(), { tool: 'brush', points: [{ x: 1, y: 1 }] }))
  history = editor.recordEditorHistory(history, editor.rotateEditorState(editor.currentEditorState(history)))
  assert.equal(history.entries.length, 3)
  assert.equal(editor.canUndoEditorHistory(history), true)
  assert.equal(editor.currentEditorState(history).rotation, 90)

  history = editor.undoEditorHistory(history)
  assert.equal(editor.currentEditorState(history).rotation, 0)
  assert.equal(editor.currentEditorState(history).strokes.length, 1)
  assert.equal(editor.canRedoEditorHistory(history), true)

  history = editor.undoEditorHistory(history)
  assert.equal(editor.currentEditorState(history).strokes.length, 0)
  assert.equal(editor.canUndoEditorHistory(history), false)
  // 到底后继续撤销不能越界。
  history = editor.undoEditorHistory(history)
  assert.equal(editor.currentEditorState(history).strokes.length, 0)

  history = editor.redoEditorHistory(history)
  assert.equal(editor.currentEditorState(history).strokes.length, 1)

  // 撤销后再编辑要丢弃重做分支。
  history = editor.recordEditorHistory(history, editor.clearEditorStrokes(editor.currentEditorState(history)))
  assert.equal(history.entries.length, 3)
  assert.equal(editor.canRedoEditorHistory(history), false)

  // 超过上限时丢弃最旧的快照，只保留最近的 limit 步。
  let capped = editor.createEditorHistory(editor.createEditorState())
  for (let i = 0; i < 6; i++) {
    capped = editor.recordEditorHistory(capped, editor.appendEditorStroke(editor.currentEditorState(capped), { tool: 'brush', points: [{ x: i, y: i }] }), 3)
  }
  assert.equal(capped.entries.length, 3)
  assert.equal(capped.index, 2)
  // 上限只裁剪历史步数，笔迹本身仍全部保留。
  assert.equal(editor.currentEditorState(capped).strokes.length, 6)
  assert.equal(editor.canUndoEditorHistory(capped), true)
})

test('editor state mutations return new states without touching the original', () => {
  const base = editor.createEditorState()
  const added = editor.appendEditorStroke(base, { tool: 'brush', width: 4, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] })
  assert.equal(base.strokes.length, 0)
  assert.equal(added.strokes.length, 1)

  const replaced = editor.replaceEditorStroke(added, 0, { tool: 'rect', startX: 5, startY: 5, endX: 25, endY: 25 })
  assert.equal(replaced.strokes[0].tool, 'rect')
  assert.equal(added.strokes[0].tool, 'brush')
  // 越界下标必须原样返回，不能破坏历史。
  assert.equal(editor.replaceEditorStroke(added, 9, { tool: 'rect' }).strokes.length, 1)
  assert.equal(editor.removeEditorStrokeAt(added, -1).strokes.length, 1)

  const cleared = editor.clearEditorStrokes(editor.rotateEditorState(added))
  assert.equal(cleared.strokes.length, 0)
  assert.equal(cleared.rotation, 90)
  assert.equal(editor.removeEditorStrokeAt(added, 0).strokes.length, 0)
})

test('resolves the displayed geometry of a rotated photo inside the canvas', () => {
  // 竖图 1000x2000 放进 400x800 的可用区：刚好铺满，无偏移。
  const portrait = editor.resolveEditorDisplay(1000, 2000, 400, 800, 0)
  assert.equal(portrait.scale, 0.4)
  assert.equal(portrait.rotatedWidth, 400)
  assert.equal(portrait.rotatedHeight, 800)
  assert.equal(portrait.offsetX, 0)
  assert.equal(portrait.offsetY, 0)

  // 横图 2000x1000 放进 400x800：按宽度适配，上下居中留白。
  const landscape = editor.resolveEditorDisplay(2000, 1000, 400, 800, 0)
  assert.equal(landscape.scale, 0.2)
  assert.equal(landscape.rotatedWidth, 400)
  assert.equal(landscape.rotatedHeight, 200)
  assert.equal(landscape.offsetY, 300)

  // 旋转 90 度后宽高互换：横图在方形可用区里必须按高度适配，左右居中留白。
  const turned = editor.resolveEditorDisplay(2000, 1000, 400, 400, 90)
  assert.equal(turned.rotatedWidth, 200)
  assert.equal(turned.rotatedHeight, 400)
  assert.equal(turned.scale, 0.2)
  assert.equal(turned.offsetX, 100)
  assert.equal(turned.offsetY, 0)

  // 非法可用区不能产生除零或 NaN。
  const safe = editor.resolveEditorDisplay(0, 0, 0, 0, 0)
  assert.equal(Number.isFinite(safe.scale), true)
  assert.equal(safe.scale, 1)
})

test('maps canvas touch points to source pixels and back for every rotation', () => {
  const source = { width: 1000, height: 2000 }
  const area = { width: 400, height: 800 }
  const rotations = [0, 90, 180, 270]
  for (const rotation of rotations) {
    const display = editor.resolveEditorDisplay(source.width, source.height, area.width, area.height, rotation)
    const cases = [
      { x: display.rotatedWidth / 2 + display.offsetX, y: display.rotatedHeight / 2 + display.offsetY },
      { x: display.offsetX + 1, y: display.offsetY + 1 },
      { x: display.offsetX + display.rotatedWidth - 1, y: display.offsetY + display.rotatedHeight - 1 }
    ]
    for (const stagePoint of cases) {
      const mapped = editor.mapStagePointToSource(stagePoint, display, source.width, source.height, rotation)
      const back = editor.mapSourcePointToStage(mapped, display, source.width, source.height, rotation)
      // 正反换算必须闭合，否则画笔落点会整体偏移。
      assert.ok(Math.abs(back.x - stagePoint.x) < 0.001, `rotation ${rotation} x: ${back.x} != ${stagePoint.x}`)
      assert.ok(Math.abs(back.y - stagePoint.y) < 0.001, `rotation ${rotation} y: ${back.y} != ${stagePoint.y}`)
    }
  }

  // 未旋转时左上角映射到源图左上角。
  const plain = editor.resolveEditorDisplay(source.width, source.height, area.width, area.height, 0)
  assert.deepEqual(editor.mapStagePointToSource({ x: 0, y: 0 }, plain, source.width, source.height, 0), { x: 0, y: 0 })
  // 旋转 90 度后，画布左上角落在源图的左下角。
  const quarter = editor.resolveEditorDisplay(source.width, source.height, area.width, area.height, 90)
  const corner = editor.mapStagePointToSource({ x: quarter.offsetX, y: quarter.offsetY }, quarter, source.width, source.height, 90)
  assert.ok(Math.abs(corner.x) < 0.001)
  assert.ok(Math.abs(corner.y - source.height) < 0.001)
  // 超出图片范围的点收敛到边缘，避免标注坐标飞出画布。
  const outside = editor.mapStagePointToSource({ x: -500, y: -500 }, plain, source.width, source.height, 0)
  assert.deepEqual(outside, { x: 0, y: 0 })
})

test('thins brush points and converts brush width into source pixels', () => {
  assert.deepEqual(editor.IMAGE_EDITOR_BRUSH_WIDTHS, [3, 6, 12])
  assert.equal(editor.IMAGE_EDITOR_BRUSH_MIN_DISTANCE_PX, 2)
  assert.equal(editor.shouldAppendEditorPoint(null, { x: 0, y: 0 }), true)
  assert.equal(editor.shouldAppendEditorPoint({ x: 0, y: 0 }, { x: 1, y: 0 }), false)
  assert.equal(editor.shouldAppendEditorPoint({ x: 0, y: 0 }, { x: 3, y: 4 }), true)

  // 抽稀保留首尾点，中间按间距过滤。
  const thinned = editor.simplifyEditorPoints([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 40, y: 0 }])
  assert.deepEqual(thinned, [{ x: 0, y: 0 }, { x: 40, y: 0 }])
  assert.deepEqual(editor.simplifyEditorPoints([{ x: 1, y: 1 }]), [{ x: 1, y: 1 }])

  // 画笔宽度按缩放换算：缩到一半时同样视觉粗细需要两倍源图像素。
  assert.equal(editor.resolveEditorStrokeWidth(6, 0.5), 12)
  assert.equal(editor.resolveEditorStrokeWidth(6, 1), 6)
  assert.equal(editor.resolveEditorStrokeWidth(6, 0), 6)
  // 最小 1 像素，避免大图上缩小后笔迹消失。
  assert.equal(editor.resolveEditorStrokeWidth(3, 10), 1)

  assert.equal(editor.distanceToEditorSegment({ x: 0, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3)
  assert.equal(editor.distanceToEditorSegment({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 4)
})

test('hit tests the topmost annotation and counts stroke width', () => {
  assert.equal(editor.IMAGE_EDITOR_HIT_TOLERANCE_PX, 20)
  const brush = { tool: 'brush', width: 4, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
  const rect = { tool: 'rect', startX: 10, startY: 10, endX: 60, endY: 60 }
  const strokes = [brush, rect]
  // 折线按点到线段距离判定：贴近笔迹命中，离笔迹很远就不命中。
  assert.equal(editor.hitTestEditorStrokes([brush], { x: 50, y: 5 }, 20), 0)
  assert.equal(editor.hitTestEditorStrokes([brush], { x: 50, y: 60 }, 20), -1)
  assert.equal(editor.hitTestEditorStrokes(strokes, { x: 500, y: 500 }, 20), -1)
  // 从上到下取最上层：落在矩形覆盖范围内时返回后绘制的对象。
  assert.equal(editor.hitTestEditorStrokes(strokes, { x: 30, y: 30 }, 5), 1)
  assert.equal(editor.hitTestEditorStrokes([rect], { x: 30, y: 30 }, 5), 0)

  assert.deepEqual(editor.resolveEditorStrokeBox(rect), { left: 10, top: 10, width: 50, height: 50 })
  assert.deepEqual(editor.resolveEditorStrokeBox({ tool: 'ellipse', startX: 100, startY: 100, endX: 130, endY: 120 }), { left: 70, top: 80, width: 60, height: 40 })
  assert.deepEqual(editor.resolveEditorStrokeBox({ tool: 'arrow', startX: 5, startY: 9, endX: 25, endY: 4 }), { left: 5, top: 4, width: 20, height: 5 })
  assert.deepEqual(editor.resolveEditorStrokeBox({ tool: 'brush', points: [{ x: 2, y: 3 }, { x: 8, y: 1 }] }), { left: 2, top: 1, width: 6, height: 2 })
  // 文本按字号估算包围盒。
  const textBox = editor.resolveEditorStrokeBox({ tool: 'text', startX: 10, startY: 40, width: 20, text: 'abc' })
  assert.equal(textBox.left, 10)
  assert.equal(textBox.top, 20)
  assert.ok(textBox.width >= 20)

  // 工具名与数值字段要能容忍原生 JSON 的字符串读数。
  assert.equal(editor.editorStrokeTool({}), 'brush')
  assert.equal(editor.editorStrokeTool({ tool: 'rect' }), 'rect')
  assert.equal(editor.editorStrokeNumber({ width: '6' }, 'width', 2), 6)
  assert.equal(editor.editorStrokeNumber({ width: 'bad' }, 'width', 2), 2)
  assert.deepEqual(editor.editorStrokePoints({}), [])
})

test('translates an annotation copy and drops accidental tiny marks', () => {
  const brush = { tool: 'brush', width: 4, points: [{ x: 10, y: 10 }, { x: 40, y: 10 }] }
  const moved = editor.translateEditorStroke(brush, 5, -3)
  assert.deepEqual(moved.points, [{ x: 15, y: 7 }, { x: 45, y: 7 }])
  // 原对象保持不动，历史快照不会被拖动改写。
  assert.deepEqual(brush.points, [{ x: 10, y: 10 }, { x: 40, y: 10 }])
  assert.deepEqual(editor.translateEditorStroke({ tool: 'rect', startX: 0, startY: 0, endX: 20, endY: 30 }, 2, 4), { tool: 'rect', startX: 2, startY: 4, endX: 22, endY: 34 })
  // 文字只有落点，平移不应凭空补出终点。
  const movedText = editor.translateEditorStroke({ tool: 'text', startX: 8, startY: 9, text: 'A' }, 1, 1)
  assert.equal(movedText.startX, 9)
  assert.equal(movedText.startY, 10)
  assert.equal(movedText.endX, undefined)
  // 数值字段是字符串时也要能平移。
  assert.equal(editor.translateEditorStroke({ tool: 'arrow', startX: '1', startY: '2', endX: '3', endY: '4' }, 1, 1).endX, 4)

  // 轻点产生的极小标注不保留，正常大小的标注保留。
  assert.equal(editor.isMeaningfulEditorStroke({ tool: 'brush', points: [{ x: 0, y: 0 }] }, 6), false)
  assert.equal(editor.isMeaningfulEditorStroke({ tool: 'brush', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }, 6), true)
  assert.equal(editor.isMeaningfulEditorStroke({ tool: 'rect', startX: 0, startY: 0, endX: 2, endY: 2 }, 6), false)
  assert.equal(editor.isMeaningfulEditorStroke({ tool: 'text', startX: 0, startY: 0, text: 'A' }, 6), true)
})

test('caps export canvas size and swaps sides for quarter turns', () => {
  assert.equal(editor.IMAGE_EDITOR_MAX_EXPORT_SIDE, 2048)
  assert.deepEqual(editor.resolveExportCanvasSize(1000, 2000, 0), { width: 1000, height: 2000 })
  assert.deepEqual(editor.resolveExportCanvasSize(1000, 2000, 90), { width: 2000, height: 1000 })
  // 超大原图按长边收敛，比例保持，避免导出时 OOM。
  assert.deepEqual(editor.resolveExportCanvasSize(4000, 3000, 0), { width: 2048, height: 1536 })
  assert.deepEqual(editor.resolveExportCanvasSize(4000, 3000, 90), { width: 1536, height: 2048 })
  assert.equal(editor.resolveExportCanvasSize(0, 0, 0).width >= 1, true)
})

test('image editor renders annotations through one canvas pipeline', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')

  // 标注全部画在同一块 2D canvas 上，不再用成百上千个 view 拼笔画（旧实现卡顿的根因）。
  assert.match(source, /<canvas[\s\S]{0,80}id="markup-canvas"[\s\S]{0,60}type="2d"/)
  assert.doesNotMatch(source, /annotation-line|annotation-layer|pathSegments\(/)
  assert.match(source, /function renderEditor\(rc: CanvasRenderingContext2D/)
  assert.match(source, /@touchstart="handleCanvasTouchStart"/)
  assert.match(source, /@touchmove="handleCanvasTouchMove"/)
  assert.match(source, /@touchend="handleCanvasTouchEnd"/)
  assert.match(source, /@touchcancel="handleCanvasTouchCancel"/)
  // 触摸坐标必须来自元素实测矩形；异步查询会拿到上一帧的旧坐标导致落笔偏移。
  assert.doesNotMatch(source, /queryStageRect|createSelectorQuery/)
  assert.match(source, /getBoundingClientRect\(\)/)
  // 触屏端不允许依赖浏览器专属能力。
  assert.doesNotMatch(source, /document\.|window\.|<svg\b|localStorage/)
})

test('image editor exposes brush, eraser, shapes, text, select, rotate, undo, redo and clear', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  for (const tool of ['brush', 'eraser', 'arrow', 'rect', 'ellipse', 'text', 'select']) {
    assert.match(source, new RegExp(`id: '${tool}'`), `工具栏缺少 ${tool}`)
  }
  assert.match(source, /function selectTool\(/)
  assert.match(source, /function undoEdit\(/)
  assert.match(source, /function redoEdit\(/)
  assert.match(source, /function clearAnnotations\(/)
  assert.match(source, /function rotateImage\(/)
  assert.match(source, /undoEditorHistory|redoEditorHistory/)
  assert.match(source, /:class="\{ disabled: !canRedo \}"/)
  // 画笔粗细与颜色都要能选。
  assert.match(source, /IMAGE_EDITOR_BRUSH_WIDTHS/)
  assert.match(source, /colorOptions/)
})

test('image editor exports through the same render function and keeps native guards', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const exportFlow = source.split('function exportEditedImage(')[1] ?? ''

  // 导出与预览共用渲染函数，保证所见即所得。
  assert.match(exportFlow, /renderEditor\(rc, state, display,/)
  // 原生 2D 位图尺寸必须在 context 上显式设置，模板属性不保证重置缓冲。
  assert.match(exportFlow, /rc\.canvas\.width = targetWidth/)
  assert.match(exportFlow, /rc\.canvas\.height = targetHeight/)
  assert.match(source, /isSameEditorAspectRatio\(width, height, bitmapWidth, bitmapHeight\)/)
  // 解码回调先注册再赋值 src。
  const onloadIndex = exportFlow.indexOf('exportImage.onload =')
  const onerrorIndex = exportFlow.indexOf('exportImage.onerror =')
  const srcIndex = exportFlow.indexOf('exportImage.src = normalizeCanvasImagePath')
  assert.ok(onloadIndex >= 0 && onerrorIndex >= 0 && srcIndex >= 0, '导出流程必须注册解码回调并赋值图片源')
  assert.ok(onloadIndex < srcIndex, 'exportImage.onload 必须先于 exportImage.src 注册')
  assert.ok(onerrorIndex < srcIndex, 'exportImage.onerror 必须先于 exportImage.src 注册')
  // 导出看门狗：原生回调不触发时给出明确失败，而不是永久停在"保存中"。
  assert.match(exportFlow, /clearTimeout\(watchdog\)/)
  assert.match(exportFlow, /图片导出超时/)
  assert.match(source, /function verifyExportedImage\(/)
  assert.match(source, /resolveExportCanvasSize\(/)
  // 画布渲染模块缺失时给出可定位的失败提示。
  assert.match(exportFlow, /settle\(new Error\(/)
})

test('image editor records history for every committed edit action', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  // 落笔、拖动、旋转、删除、清空都要能撤销。
  assert.match(source, /function commitEditorState\(/)
  assert.match(source, /commitEditorState\(/)
  const commitCalls = source.split('commitEditorState(').length - 1
  assert.ok(commitCalls >= 5, `提交历史的入口过少：${commitCalls}`)
  // 拖动前先深拷贝，避免撤销快照被原地修改污染。
  assert.match(source, /snapshotEditorStroke\(/)
  assert.match(source, /getBoundingClientRect/)
})
test('image editor re-measures the canvas box after the photo is decoded', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const previewFlow = source.split('function refreshEditorWhenReady(')[1] ?? ''

  // 首次进入时工具栏可能还没撑开，解码回调里必须按最终布局重排画布，否则画布尺寸与实际可用区不符。
  const onloadIndex = previewFlow.indexOf('image.onload =')
  const layoutIndex = previewFlow.indexOf('layoutEditor()', onloadIndex)
  const repaintIndex = previewFlow.indexOf('repaint()', onloadIndex)
  assert.ok(onloadIndex >= 0, '原图解码回调必须存在')
  assert.ok(layoutIndex > onloadIndex, '解码完成后要重新测量可用区')
  assert.ok(repaintIndex > layoutIndex, '先重排画布再重绘，避免按旧布局绘制')
})

test('image editor keeps one load request id across canvas and image init', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const loadFlow = source.split('function loadEditorImage(')[1] ?? ''

  // 画布初始化与原图读取在同一次打开里必须共用请求号：
  // 读取原图时自增会让还在异步等待的画布回调被判为过期，画布永远初始化不了。
  const resetFlow = source.split('function resetEditorState(')[1] ?? ''
  const retryFlow = source.split('function retryLoad(')[1] ?? ''
  assert.match(loadFlow, /const requestId = loadRequestId/)
  assert.doesNotMatch(loadFlow, /\+\+loadRequestId/)
  assert.match(resetFlow, /loadRequestId \+= 1/, '每次打开编辑器都要作废上一次的异步回调')
  assert.match(retryFlow, /loadRequestId \+= 1/, '重试要换新的请求号，避免旧失败回调覆盖重试结果')
})

test('editor image area matches the viewer preview geometry', () => {
  // 查看页 .preview-content：状态栏 + 100rpx 标题栏之下铺到底，左右各留 32rpx。
  const area = editor.resolveEditorImageArea(393, 852, 24, 16, 50)
  assert.deepEqual(area, { left: 16, top: 74, width: 361, height: 778 })
  // 极端窗口也要保留可用尺寸，避免除零和无意义画布。
  const tiny = editor.resolveEditorImageArea(0, 0, 0, 0, 0)
  assert.equal(tiny.width, 1)
  assert.equal(tiny.height, 1)
})

test('editor canvas rect centers the fitted box inside the image area', () => {
  const area = { left: 16, top: 74, width: 361, height: 778 }
  const rect = editor.resolveEditorCanvasRect(area, 361, 270)
  // 宽度铺满时左右偏移为 0，高度按剩余空间上下居中。
  assert.deepEqual(rect, { left: 16, top: 74 + (778 - 270) / 2, width: 361, height: 270 })
})

test('export element size divides the target bitmap by the device pixel ratio', () => {
  // 官方高清屏写法是 canvas.width = offsetWidth * dpr，元素 CSS 尺寸必须按 dpr 折算，位图才等于目标像素。
  assert.deepEqual(editor.resolveEditorExportElementSize({ width: 2048, height: 1536 }, 2), { width: 1024, height: 768 })
  assert.deepEqual(editor.resolveEditorExportElementSize({ width: 2048, height: 1536 }, 1), { width: 2048, height: 1536 })
  // dpr 读数异常时按 1 处理，且尺寸至少为 1。
  assert.deepEqual(editor.resolveEditorExportElementSize({ width: 2048, height: 1536 }, 0), { width: 2048, height: 1536 })
  assert.deepEqual(editor.resolveEditorExportElementSize({ width: 1, height: 1 }, 4), { width: 1, height: 1 })
})

test('export verification compares the aspect ratio instead of exact pixels', () => {
  // 位图口径（物理像素/逻辑像素）各端不同，比例一致就说明整张图都导出了。
  assert.equal(editor.isSameEditorAspectRatio(2048, 1536, 2048, 1536), true)
  assert.equal(editor.isSameEditorAspectRatio(1024, 768, 2048, 1536), true)
  assert.equal(editor.isSameEditorAspectRatio(5632, 4224, 2048, 1536), true)
  // 旋转 90 度后长宽互换、或只导出了局部，必须判失败。
  assert.equal(editor.isSameEditorAspectRatio(1536, 2048, 2048, 1536), false)
  assert.equal(editor.isSameEditorAspectRatio(2048, 400, 2048, 1536), false)
  assert.equal(editor.isSameEditorAspectRatio(0, 0, 2048, 1536), false)
  assert.equal(editor.isSameEditorAspectRatio(2048, 1536, 0, 0), false)
})

test('editor treats unusable native measurements as missing', () => {
  // 测量 API 不可用时返回全 0，此时必须回退到推算几何。
  assert.equal(editor.isUsableEditorBox({ left: 0, top: 0, width: 0, height: 0 }, 40), false)
  assert.equal(editor.isUsableEditorBox(null, 40), false)
  assert.equal(editor.isUsableEditorBox({ left: 16, top: 74, width: 361, height: 778 }, 40), true)
})

test('editor reserves the floating toolbars so the photo is never covered', () => {
  const area = { left: 16, top: 74, width: 361, height: 778 }
  // 工具条是浮层，取景必须扣掉它的高度，图片才完整显示在操作区上方。
  assert.deepEqual(editor.resolveEditorFitArea(area, 180), { left: 16, top: 74, width: 361, height: 598 })
  // 没有浮层时取景区等于可绘制区。
  assert.deepEqual(editor.resolveEditorFitArea(area, 0), area)
  // 浮层高度异常（大于可用高度）时至少保留 1px，避免出现零高度取景区。
  assert.equal(editor.resolveEditorFitArea(area, 900).height, 1)
  assert.equal(editor.resolveEditorFitArea(area, -20).height, 778)
})

test('ellipse is approximated by sampled polyline points instead of the native ellipse API', () => {
  // uni-app x App 原生平台（Android/iOS）的 CanvasRenderingContext2D.ellipse 未实现（unixVer 为 x），
  // 直接调用会在运行时抛错并中断整帧重绘：圆形画不出来，还连带拖垮工具切换与文字标注。
  assert.equal(editor.IMAGE_EDITOR_ELLIPSE_SEGMENTS, 64)
  const points = editor.resolveEllipseSamplePoints(0, 0, 10, 5, 8)
  // 首尾闭合：段数 + 1 个点，末点回到起点。
  assert.equal(points.length, 9)
  assert.deepEqual(points[0], { x: 10, y: 0 })
  assert.ok(Math.abs(points[2].x) < 0.001 && Math.abs(points[2].y - 5) < 0.001)
  assert.deepEqual(points[8], points[0])
  // 半径取绝对值，拖动方向不影响形状。
  const mirrored = editor.resolveEllipseSamplePoints(0, 0, -10, -5, 8)
  assert.deepEqual(mirrored, points)
  // 段数收敛到下限 3，避免退化为直线。
  assert.equal(editor.resolveEllipseSamplePoints(0, 0, 10, 5, 1).length, 4)
  // 零半径退化为重合点序列，绘制无害。
  assert.deepEqual(editor.resolveEllipseSamplePoints(3, 4, 0, 0, 4)[0], { x: 3, y: 4 })
})

test('editor text font keeps only App-platform supported font tokens', () => {
  // App 平台的 canvas font 只支持 font-size 与 font-family，统一从纯函数生成避免拼出不识别的写法。
  assert.equal(editor.resolveEditorTextFont(20), '20px sans-serif')
  assert.equal(editor.resolveEditorTextFont(14.6), '15px sans-serif')
  // 字号至少 10：更小的字在照片标注上几乎不可见，等于"操作不生效"。
  assert.equal(editor.resolveEditorTextFont(4), '10px sans-serif')
  assert.equal(editor.resolveEditorTextFont(0), '10px sans-serif')
})

test('image editor never calls the unsupported native ellipse API', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  // 核心复现：rc.ellipse 在 App 原生平台未实现，任何调用都会抛错。
  assert.doesNotMatch(source, /rc\.ellipse\(/, '不得调用 App 平台未实现的 rc.ellipse')
  // 椭圆必须用采样折线绘制（moveTo/lineTo/closePath 全平台可用）。
  assert.match(source, /resolveEllipseSamplePoints\(/)
  const ellipseBranch = source.split("tool === 'ellipse'")[1] ?? ''
  assert.ok(ellipseBranch.length > 0, '必须保留 ellipse 绘制分支')
  const branchBody = ellipseBranch.split('} else if')[0]
  assert.match(branchBody, /rc\.moveTo\(/)
  assert.match(branchBody, /rc\.lineTo\(/)
})

test('image editor isolates canvas repaint failures from interaction state', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  const repaintBody = source.split('function repaint(')[1]?.split('\n\t}')[0] ?? ''
  // 画布重绘异常必须被隔离：一旦异常冒泡到事件处理器，vapor 渲染管线会中断，
  // 工具选中态、撤销按钮等 UI 状态全部停在原地——即"选中状态没有落到选中项"的根因。
  assert.match(repaintBody, /try \{/)
  assert.match(repaintBody, /catch/)
})

test('image editor centers text on the tap point with a shared font helper', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  // 默认基线让文字悬在落点上方，落点贴近图片上缘时文字画出图外，看起来像"没有生效"。
  assert.match(source, /textBaseline = 'middle'/)
  // 字体字符串统一由纯函数生成，杜绝各处拼接出 App 平台不支持的 font 写法。
  assert.match(source, /resolveEditorTextFont\(/)
})

test('text input dialog stops click propagation and auto-focuses the input', async () => {
  const source = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  // 复现"点了画布弹层闪一下就关"：内层弹层用内联空箭头函数阻止冒泡在 App 端不生效，
  // 点击输入框区域的冒泡会直达遮罩层的 cancelTextInput，弹层刚打开就被关闭。
  assert.doesNotMatch(source, /@click\.stop="\(\) => \{\}"/)
  assert.match(source, /@click\.stop="stopEvent"/)
  // 弹层打开即聚焦：App 端不自动弹键盘，用户以为"点了没反应"。
  assert.match(source, /<input[^>]*:focus="showTextInput"/)
})

/**
 * 上传链路只接受 jpg：H5 基准编辑器导出 fileType:'jpg'、iOS 基准编辑器导出 toDataURL('image/jpeg')，
 * 本仓库所有能上传成功的照片也都是 jpg（相机/相册原图，或 compressImage 回正后的 JPEG）。
 * 因此编辑结果必须落盘成 .jpg，PNG 只能作为转码中间文件，否则上传接口会直接报错。
 */
test('editor export must produce an uploadable JPEG instead of a PNG', async () => {
  const component = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')

  // PNG 只是转码输入，写到缓存目录，不混进需要上传的媒体文件，也不能作为编辑结果交给上传队列。
  assert.match(component, /\$\{uni\.env\.CACHE_PATH\}\/inspection-edit-\$\{Date\.now\(\)\}\.png/)
  assert.doesNotMatch(component, /settle\(null, pngPath\)/, 'PNG 不能作为编辑结果交给上传队列')
  // 转码复用 App 端已验证的 uni.compressImage（Android 会把非 JPG 输入压成 JPG）。
  assert.match(component, /uni\.compressImage\(\{/)
  assert.match(component, /quality: IMAGE_EDITOR_JPEG_QUALITY/)
  // 候选路径重试沿用媒体回正服务的既有实现，避免沙盒路径缺少 file:// 前缀。
  assert.match(component, /nativeImageSourceCandidates/)
  // 落盘复用相机/相册同一条持久化链路，保证离线重试上传时文件还在。
  assert.match(component, /mediaPersistenceService\.persistMediaPath\(jpegPath, false\)/)

  const quality = editor.IMAGE_EDITOR_JPEG_QUALITY
  assert.ok(Number.isInteger(quality) && quality > 0 && quality <= 100, 'JPEG 质量必须在 compressImage 允许的 0~100 区间')
})
