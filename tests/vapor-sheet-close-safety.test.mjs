import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 弹层类组件（声明了 visible 布尔属性）在 vapor 蒸汽模式下关闭时，父页面仍会持续推送新数据，
 * 而弹层实例依旧挂载、只有内部 v-if 子树被销毁。此时任何未加可见性守卫的内部状态写入都会驱动
 * 已销毁的渲染子树在原生 UNIAPP_DOM 线程重新渲染，触发共享数据字段追踪野指针崩溃（EXC_BAD_ACCESS）。
 * 本测试锁定这类崩溃的修复约束，避免回归。
 */

/** 逐字去掉字符串、模板字符串与注释，避免其中的括号/关键字干扰静态解析。 */
function stripLiteralsAndComments(source) {
  let output = ''
  let quote = ''
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (quote !== '') {
      if (char === '\\') { index += 1; continue }
      if (char === quote) quote = ''
      continue
    }
    if (char === '//' || char === '/*') {
      const terminator = char === '//' ? '\n' : '*/'
      const end = source.indexOf(terminator, index + 2)
      index = end === -1 ? source.length : end + terminator.length - 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue }
    output += char
  }
  return output
}

/** 用括号配平提取源码中全部 watch(...) 调用文本。 */
function extractWatchCalls(source) {
  const calls = []
  let index = source.indexOf('watch(')
  while (index !== -1) {
    let depth = 0
    let cursor = index + 'watch'.length
    for (; cursor < source.length; cursor += 1) {
      const char = source[cursor]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) { cursor += 1; break }
      }
    }
    calls.push(source.slice(index, cursor))
    index = source.indexOf('watch(', cursor)
  }
  return calls
}

/** 递归列出 pages/ 与 components/ 下的全部 uvue 页面与组件。 */
async function listUvueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listUvueFiles(path))
    else if (entry.name.endsWith('.uvue')) files.push(path)
  }
  return files
}

/** 所有声明 visible 属性的弹层组件，其 watch 回调必须包含可见性守卫（props.visible 或 isSheetVisible()）。 */
test('vapor sheet components guard every watcher with the visibility flag', async () => {
  const files = [...await listUvueFiles('pages'), ...await listUvueFiles('components')]
  let checkedFiles = 0
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (!/visible:\s*\{\s*type:\s*Boolean/.test(source)) continue
    checkedFiles += 1
    for (const call of extractWatchCalls(stripLiteralsAndComments(source))) {
      const guarded = call.includes('props.visible') || call.includes('isSheetVisible()')
      assert.ok(guarded, `${file} 的 watcher 缺少可见性守卫，关闭弹层后会驱动已销毁子树渲染：${call.slice(0, 120)}`)
    }
  }
  assert.ok(checkedFiles >= 15, `应覆盖全部弹层组件，实际只检查了 ${checkedFiles} 个`)
})

/** 检查项弹层：关闭期间不得重建草稿，重新打开时必须按最新检查项重建。 */
test('check item sheet skips draft resets while hidden and rebuilds on open', async () => {
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(source, /function isSheetVisible\(\): boolean \{ return props\.visible === true \}/)
  assert.match(source, /watch\(\(\): UTSJSONObject => itemData\.value, \(item: UTSJSONObject\) => \{ if \(isSheetVisible\(\)\) resetDraft\(item, !isSameEditingItem\(item\)\) \}\)/)
  assert.match(source, /watch\(\(\): boolean => props\.visible, \(visible: boolean\) => \{ if \(visible\) resetDraft\(itemData\.value, true\) \}, \{ immediate: true \}\)/)
  assert.doesNotMatch(source, /resetDraft\(item\), \{ immediate: true, deep: true \}/)
  assert.match(source, /watch\(\(\): number => props\.sortSavedRevision, \(\) => \{ if \(isSheetVisible\(\)\) completePhotoSort\(\) \}\)/)
})

/** 检查项弹层：关闭只提交备注，不在关闭阶段改写内部草稿。 */
test('check item sheet closes without rewriting its own draft', async () => {
  const source = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(source, /function closeSheet\(\) \{ flushNotesOnClose\(\); emit\('close'\) \}/)
  assert.doesNotMatch(source, /function closeSheet\(\) \{ saveNotesOnBlur\(\)/)
  assert.match(source, /function flushNotesOnClose\(\) \{ if \(draft\.value\.comment === noteDraft\.value\) return; emit\('auto-save', \{ item: props\.item, data: \{ \.\.\.buildDraftData\(\), comment: noteDraft\.value \} \}\) \}/)
  /* 选择结果同样不得改写草稿，completed 通过纯计算得出。 */
  assert.doesNotMatch(source, /draft\.value = \{ \.\.\.draft\.value, comment: noteDraft\.value, result \}/)
  assert.match(source, /function isCompletedWithResult\(result: string\): boolean \{ if \(itemType\.value === 'Standard'\) return result !== ''; return isDraftCompleted\(\) \}/)
  assert.match(source, /emit\('select-result', \{ item: props\.item, result, data: \{ \.\.\.draft\.value, comment: noteDraft\.value, result, completed: isCompletedWithResult\(result\) \} \}\)/)
})

/** 疵点弹层：同样只在可见时重建草稿，分类弹层复位移到打开阶段。 */
test('quick defect sheet skips draft resets while hidden and closes without writes', async () => {
  const source = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(source, /watch\(\(\): UTSJSONObject => props\.defect as UTSJSONObject, \(defect: UTSJSONObject\) => \{\s*if \(!isSheetVisible\(\)\) return/)
  assert.match(source, /draft\.value = mergeDefectDraftPhotos\(draft\.value as UTSJSONObject, defect\) as DefectDraft/)
  assert.match(source, /watch\(\(\): boolean => props\.visible, \(visible: boolean\) => \{ if \(visible\) \{ showCategorySheet\.value = false; resetDraft\(props\.defect as UTSJSONObject\) \} \}, \{ immediate: true \}\)/)
  assert.match(source, /function closeSheet\(\): void \{ emit\('close'\) \}/)
})

/** 图片排序、媒体预览与画布编辑弹层：关闭阶段不写回内部状态。 */
test('photo sort, preview and markup sheets avoid writes after closing', async () => {
  const sortSheet = await readFile('components/detail/PhotoSortSheet.uvue', 'utf8')
  assert.match(sortSheet, /watch\(\(\): boolean => props\.visible, \(visible: boolean\) => \{\s*if \(!visible\) return/)
  const previewSheet = await readFile('components/detail/PhotoEditorSheet.uvue', 'utf8')
  assert.match(previewSheet, /watch\(\(\): UTSJSONObject => photoData\.value, \(\) => \{ if \(props\.visible\) closeImageEditor\(\) \}\)/)
  assert.match(previewSheet, /watch\(\(\): boolean => props\.visible, \(visible: boolean\) => \{ if \(visible\) \{ openingEditor\.value = false; closeImageEditor\(\) \} \}\)/)
  assert.doesNotMatch(previewSheet, /if \(!visible\) closeImageEditor\(\)/)
  /* 下载/校验预览图的 await 之后必须重新校验可见性，否则关闭弹层后仍会打开标注编辑器。 */
  assert.match(previewSheet, /await reportFileApi\.downloadInspectFile\(fileId, 'preview'\) : ''\)\s*if \(!props\.visible\) return/)
  assert.match(previewSheet, /finally \{ if \(props\.visible\) openingEditor\.value = false \}/)
  const markupEditor = await readFile('components/detail/ImageMarkupEditor.uvue', 'utf8')
  assert.match(markupEditor, /watch\(\(\): string => `\$\{props\.visible\}:\$\{props\.source\}`, \(\) => \{\s*if \(!props\.visible\) return/)
  /* 画布初始化与原图读取的异步回调同样先校验可见性，避免关闭后写回已销毁的子树。 */
  assert.match(markupEditor, /function refreshEditorWhenReady\(\) \{\s*if \(!props\.visible/)
  /* 导出结束后的回写同样带守卫；保存态改为在重置时解除，避免重新打开后按钮失效。 */
  assert.match(markupEditor, /if \(props\.visible\) emit\('edited', resultPath\)/)
  assert.match(markupEditor, /\} finally \{\s*if \(props\.visible\) saving\.value = false/)
  assert.match(markupEditor, /saving\.value = false\s*\n\t\}/)
})

/** 扫码与上传动画：异步回调/@prop 变化不得写入已经销毁的子树。 */
test('async callbacks recheck visibility before writing sheet state', async () => {
  const sheet = await readFile('components/detail/CheckItemSheet.uvue', 'utf8')
  assert.match(sheet, /success: \(result: ScanCodeSuccess\) => \{ if \(!isSheetVisible\(\) \|\| String\(itemData\.value\['itemId'\] \?\? ''\) !== scannedItemId\) return;/)
  const syncBar = await readFile('components/sync/OfflineSyncStatus.uvue', 'utf8')
  assert.match(syncBar, /if \(!uploading\) return\s*arrowLit\.value = true/)
  assert.doesNotMatch(syncBar, /clearInterval\(timer\); uploadAnimationTimer = null \}\s*arrowLit\.value = true\s*if \(uploading\)/)
})

/** 图片单元：原生 @error 回调与鉴权下载都可能在弹层关闭后才返回，销毁后不得再写回状态。 */
test('media image cells stop writing state after teardown', async () => {
  const cell = await readFile('components/detail/InspectionMediaImage.uvue', 'utf8')
  assert.match(cell, /import \{ computed, onBeforeUnmount, onUnmounted, ref, watch \} from 'vue'/)
  assert.match(cell, /onBeforeUnmount\(\(\) => \{ disposed = true \}\)/)
  assert.match(cell, /onUnmounted\(\(\) => \{ disposed = true \}\)/)
  assert.match(cell, /async function handleImageError\(\) \{\s*if \(disposed\) return/)
  assert.match(cell, /await reportFileApi\.downloadInspectFile\(fileId, mode\)\s*if \(disposed\) return/)
  assert.doesNotMatch(cell, /watch\(\(\): UTSJSONObject => mediaData\.value, \(_: UTSJSONObject\) => \{ fallbackSource\.value = ''/)
  assert.doesNotMatch(cell, /watch\(\(\): string => props\.viewMode, \(_: string\) => \{ fallbackSource\.value = ''/)
})

/** 详情页关闭弹层时只切换可见性，不在同一渲染周期内改写弹层入参。 */
test('detail page closes sheets by visibility only', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(page, /function closeItemSheet\(\) \{ if \(sortSubmitting\.value\) return; showItemSheet\.value = false \}/)
  assert.doesNotMatch(page, /showItemSheet\.value = false; editingItemId\.value = ''/)
  assert.match(page, /function closeDefectSheet\(\) \{ showDefectSheet\.value = false \}/)
  assert.doesNotMatch(page, /showDefectSheet\.value = false; isEditingDefect\.value = false; editingDefect\.value = \{\}/)
  assert.match(page, /function closePhotoEditor\(\) \{ showPhotoEditor\.value = false \}/)
  assert.doesNotMatch(page, /previewPhoto\.value = \{\}; previewPhotos\.value = \[\]/)
  /* 保存编辑的异步回写同样要先确认预览弹层仍然打开。 */
  assert.match(page, /if \(showPhotoEditor\.value\) \{\s*previewPhotos\.value = replaceMedia/)
})