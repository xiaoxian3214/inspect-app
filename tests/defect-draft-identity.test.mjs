import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const form = await loadUtsModule('domain/quickDefectForm.uts')

/**
 * 疵点弹层草稿身份与关联字段保留契约。
 *
 * QuickDefectSheet 的 draft 是 UTS 自定义类型 DefectDraft（UTSJSONObject as DefectDraft
 * 在 Kotlin 侧只保留类型声明过的字段）。若 DefectDraft 不声明 id/defectId/checkItemResultId/sonPlanId，
 * 拍照时写入照片 ownerId 的 defectId 与保存时 emit 出的对象会被裁掉 → saveDefext 重新生成新 id，
 * 疵点记录与照片 ownerId 对不上：上传成孤儿、同步回来照片从疵点上消失、itemResultId 关联丢失。
 */

/** DefectDraft 类型必须声明身份与关联字段，否则 UTS 类型转换会把这些字段裁掉。 */
test('QuickDefectSheet draft type declares identity and linkage fields', async () => {
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  const typeLine = sheet.split('type DefectDraft = ')[1].split('\n')[0]
  for (const field of ['id:', 'defectId:', 'checkItemResultId:', 'sonPlanId:']) {
    assert.ok(typeLine.includes(field), `DefectDraft 缺少字段 ${field}：${typeLine}`)
  }
})

/** createDefectDraft 必须原样保留身份与关联字段，供类型转换后仍可用。 */
test('createDefectDraft preserves defect identity and linkage fields', () => {
  const draft = form.createDefectDraft({
    id: 'defect-1', defectId: 'defect-1',
    type: 'MINOR', quantity: 2,
    checkItemId: 'ir-100', checkItemName: '外观',
    checkItemResultId: 'srv-child-9', sonPlanId: 'child-9',
    photos: [{ photoId: 'p1', localPath: '/local/p1.jpg', uploadStatus: 'draft' }]
  })
  assert.equal(draft.id, 'defect-1')
  assert.equal(draft.defectId, 'defect-1')
  assert.equal(draft.checkItemResultId, 'srv-child-9')
  assert.equal(draft.sonPlanId, 'child-9')
  assert.equal(draft.photos.length, 1)
})

/** 页面保存疵点时必须复用拍照时写入照片 ownerId 的 defectId，禁止重新生成。 */
test('page saveDefect reuses the photo ownerId defect id before generating a new one', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const saver = page.split('async function saveDefect(')[1].split('/** 打开删除疵点二次确认')[0]
  const idLine = saver.split('\n')[1]
  assert.match(idLine, /editingDefect\.value\?\.defectId/, `saveDefect 的 id 链缺少 editingDefect 回退：${idLine}`)
})

/** 新建疵点入口应在打开弹层时就生成并写入 defectId，让拍照与保存天然共用同一身份。 */
test('openNewDefect stamps a defect id so photos and the saved record share identity', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const opener = page.split('function openNewDefect(')[1].split('/** 打开已有疵点编辑弹层')[0]
  assert.match(opener, /defectId/)
  assert.match(opener, /id: defectId/)
})

/**
 * 疵点本地 ID 生成契约（对齐 H5 createDefectId）：
 * H5 用 crypto.randomUUID()（兜底 时间戳+随机串）保证每次唯一；
 * App 只用毫秒时间戳的话，同一毫秒内"取消→再新建"会生成相同 id，两个疵点的照片会错挂。
 */
test('createDefectId returns unique ids even within the same millisecond', () => {
  const ids = new Set()
  for (let index = 0; index < 200; index += 1) ids.add(form.createDefectId())
  assert.equal(ids.size, 200, '同一批调用出现了重复的疵点 ID')
  assert.ok([...ids][0].startsWith('defect-'), '保持 defect- 前缀便于排查')
})

/** 页面所有疵点 id 生成点必须统一走 createDefectId，禁止裸时间戳。 */
test('all defect id generation sites use createDefectId', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const opener = page.split('function openNewDefect(')[1].split('/** 打开已有疵点编辑弹层')[0]
  assert.ok(opener.includes('createDefectId()'), 'openNewDefect 未使用 createDefectId')
  for (const anchor of ['async function addDefectPhoto(', 'async function saveDefect(']) {
    const body = page.split(anchor)[1].split('\n\n')[0]
    assert.ok(body.includes('createDefectId()'), `${anchor} 未使用 createDefectId`)
    assert.ok(!body.includes('`defect-${Date.now()}`'), `${anchor} 仍存在裸时间戳 id`)
  }
})
