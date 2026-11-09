import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'
import { readFile } from 'node:fs/promises'

const form = await loadUtsModule('domain/quickDefectForm.uts')

test('restores linked checkpoint and custom quantity without changing the association', () => {
  const draft = form.createDefectDraft({ quantity: 24, checkItemId: 'item-1', checkItemResultId: 'item-1_child', checkItemName: '外箱', sonPlanId: 'child' })
  assert.equal(draft.quantity, 'other')
  assert.equal(draft.customQuantity, '24')
  assert.equal(draft.checkItemResultId, 'item-1_child')
  assert.equal(draft.sonPlanId, 'child')
  assert.equal(form.selectDefectQuantity(draft, 3).customQuantity, '')
  assert.equal(form.createDefectDraft(draft).customQuantity, '24')
  assert.equal(form.createDefectDraft({ ...draft, customQuantity: '' }).quantity, 'other')
})

test('common defects have no affected quantity and switching off restores one', () => {
  const common = form.setDefectCommon(form.createDefectDraft({ quantity: 7 }), true)
  assert.equal(common.quantity, null)
  assert.equal(common.commonFlag, 1)
  assert.equal(form.getDefectQuantity(common), null)
  assert.equal(form.setDefectCommon(common, false).quantity, 1)
})

test('requires category and positive other quantity before saving', () => {
  const draft = form.createDefectDraft({ defectCode: 'C3', defectDesc: '破损', quantity: 20 })
  assert.equal(form.validateDefectDraft(draft), '')
  assert.equal(form.getDefectQuantity(draft), 20)
  assert.match(form.validateDefectDraft({ ...draft, customQuantity: '0' }), /数量/)
  assert.match(form.validateDefectDraft({ ...draft, defectCode: '' }), /类别/)
})

/** 已保存的三级编码能在分类树中反查名称时，编辑保存不应要求再次手选。 */
test('restores missing category name from the tree before validating an edited defect', async () => {
  const { resolveDefectCategoryPath } = await loadUtsModule('domain/defectCategoryPath.uts')
  const tree = [{ code: 'A', name: '外观', children: [{ code: 'A1', name: '表面', children: [{ code: 'A1-01', name: '污渍', isLeaf: true, children: [] }] }] }]
  const draft = form.createDefectDraft({ defectCode: 'A1-01', defectDesc: '', quantity: 1 })
  assert.match(form.validateDefectDraft(draft), /类别/)
  const resolved = form.restoreDefectDraftCategory(draft, tree, resolveDefectCategoryPath)
  assert.equal(resolved.defectCode, 'A1-01')
  assert.equal(resolved.defectDesc, '污渍')
  assert.equal(form.validateDefectDraft(resolved), '')
})

/** 拍照等异步父组件更新只同步媒体，已选类别与编辑中的备注不回滚。 */
test('merges an edited defect photo update without replacing selected category', async () => {
  const edited = { ...form.createDefectDraft({ defectId: 'one', defectCode: 'A1-01', defectDesc: '污渍', description: '新备注' }), photos: [] }
  const refreshed = form.mergeDefectDraftPhotos(edited, { defectId: 'one', defectCode: '', defectDesc: '', description: '旧备注', photos: [{ photoId: 'p1' }] })
  assert.equal(refreshed.defectCode, 'A1-01')
  assert.equal(refreshed.defectDesc, '污渍')
  assert.equal(refreshed.description, '新备注')
  assert.equal(refreshed.photos.length, 1)
  const sheet = await readFile('components/detail/QuickDefectSheet.uvue', 'utf8')
  assert.match(sheet, /mergeDefectDraftPhotos\(draft\.value as UTSJSONObject, defect\)/)
})

test('falls back to the tier3 code when a stored defect has no defect code', () => {
  const draft = form.createDefectDraft({ tier1Code: 'A', tier2Code: 'A1', tier3Code: 'A1-01', defectDesc: '污渍' })
  assert.equal(draft.defectCode, 'A1-01')
  assert.equal(draft.tier3Code, 'A1-01')
})
