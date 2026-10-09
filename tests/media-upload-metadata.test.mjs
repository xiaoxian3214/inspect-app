import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const metadataModule = await loadUtsModule('domain/mediaUploadMetadata.uts')

test('builds H5-compatible checklist media metadata for normal and merged inspections', () => {
  const detail = {
    plan: { subGoodsNo: 'SKU-100' },
    itemResults: [
      { id: 'result-child-1', standardItemId: 'standard-1', baseItemResultId: 'item-1', sonPlanId: 'plan-child-1' }
    ]
  }
  const item = { id: 'item-1', standardItemId: 'standard-1' }

  assert.deepEqual(metadataModule.buildChecklistMediaMetadata(detail, item, '', 1), {
    bizId: 'item-1',
    bizType: 'checkResult',
    subGoodsNo: 'SKU-100',
    sortNo: 1
  })
  assert.deepEqual(metadataModule.buildChecklistMediaMetadata(detail, item, 'plan-child-1', 3), {
    bizId: 'result-child-1',
    bizType: 'checkResult',
    subGoodsNo: 'SKU-100',
    sortNo: 3
  })
})

test('builds H5-compatible defect media metadata', () => {
  assert.deepEqual(metadataModule.buildDefectMediaMetadata({ plan: { subGoodsNo: 'SKU-200' } }, 'defect-1', 2), {
    bizId: 'defect-1',
    bizType: 'defect',
    subGoodsNo: 'SKU-200',
    sortNo: 2
  })
})
