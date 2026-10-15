import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('plan API avoids TypeScript truthy fallbacks rejected by UTS', async () => {
  const source = await readFile('api/planApi.uts', 'utf8')
  assert.doesNotMatch(source, /String\([^\n]*\|\|/)
  assert.doesNotMatch(source, /Number\([^)]*\|\|/)
  assert.doesNotMatch(source, /\.filter\(Boolean\)/)
})

test('report file API uses explicit UTS-safe fallbacks and token checks', async () => {
  const source = await readFile('api/reportFileApi.uts', 'utf8')
  assert.doesNotMatch(source, /String\([^\n]*\|\|/)
  assert.doesNotMatch(source, /Number\([^)]*\|\|/)
  assert.doesNotMatch(source, /if \(session\?\.token\)/)
  assert.doesNotMatch(source, /options\.(uploadTransport|downloadTransport) \|\|/)
})

/** 检查项必传照片标志使用 UTS 可编译的转换，避免 Kotlin String 构造函数报错。 */
test('checklist photo-required flags avoid Kotlin String constructor calls', async () => {
  for (const file of ['components/detail/CheckItemSheet.uvue', 'components/detail/ChecklistTab.uvue']) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /parseInt\(String\([^)]*\['isPhotoRequired'\]/, file)
    assert.match(source, /parseInt\(\([^)]*\['isPhotoRequired'\] \?\? 0\)\.toString\(\)\) === 1/, file)
  }
})

/** 复制弹层与图片标注编辑器不能调用 Kotlin 不支持的动态 String 构造函数。 */
test('detail native components avoid JavaScript String constructors', async () => {
  for (const file of ['components/detail/CopyCheckItemsSheet.uvue', 'components/detail/ImageMarkupEditor.uvue']) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /\bString\s*\(/, file)
  }
})

/** 原生 setup 脚本先声明被调用函数，规避 UTS 编译器的函数前向引用限制。 */
test('detail components declare referenced functions before calling them', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.ok(sheet.indexOf('function saveNotesOnBlur()') < sheet.indexOf('function confirmResult(result: string)'))
  const editor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  for (const [dependency, caller] of [
    ['function layoutStage(', 'function loadImage('],
    ['function queryStageRect(', 'function loadImage('],
    ['function clampPoint(', 'function getEventPoint('],
  ]) assert.ok(editor.indexOf(dependency) < editor.indexOf(caller), `${dependency} must precede ${caller}`)
})

/** 原生拍照页回调依赖先声明且动态路径不调用 Kotlin String 构造函数。 */
test('native camera declares callback and converts paths safely', async () => {
  const source = await readFile('pages/report/simple-camera.uvue', 'utf8')
  assert.ok(source.indexOf('function goBackWithResult(') < source.indexOf('function handlePhotoTaken('))
  assert.doesNotMatch(source, /\bString\s*\(/)
})

/** 相机页先声明录像与相册操作，防止原生 setup 中调用尚未定义的方法。 */
test('camera declares capture and album dependencies before handlers', async () => {
  const source = await readFile('pages/report/camera.uvue', 'utf8')
  for (const [dependency, caller] of [
    ['function stopVideoRecording(', 'function handleVideoStarted('],
    ['function stopVideoRecording(', 'function handleShutterPress('],
    ['function startVideoRecording(', 'function handleShutterPress('],
    ['function takePhoto(', 'function handleShutterPress('],
    ['function chooseVideoFromAlbum(', 'function chooseMediaFromAlbum('],
    ['function chooseFromAlbum(', 'function chooseMediaFromAlbum('],
  ]) assert.ok(source.indexOf(dependency) < source.indexOf(caller), `${dependency} must precede ${caller}`)
})

/** 评论和图片编辑弹层在原生端不依赖 JS String(value) 构造函数。 */
test('detail comment and photo sheets avoid Kotlin String constructor errors', async () => {
  for (const file of ['components/detail/CommentsSheet.uvue', 'components/detail/PhotoEditorSheet.uvue']) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /\bString\s*\(/, file)
  }
})

/** 校验清单页使用显式布尔条件，而不误报空值合并表达式。 */
test('checklist component avoids non-boolean UTS fallback expressions', async () => {
  const source = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.doesNotMatch(source, /String\([^)]*\|\|/)
  assert.doesNotMatch(source, /\?\.[A-Za-z0-9_]+\s*\|\|/)
  assert.doesNotMatch(source, /sonPlanId\s*\?(?!\?)/)
  assert.doesNotMatch(source, /v-if="getItem(Result|Comment|FirstPhoto|PhotoCount|Defects|defectThumb)\([^"\n]*\)"/)
})
