import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

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
