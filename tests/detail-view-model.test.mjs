import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/detailViewModel.uts')

test('normalizes H5 standard items and item results into editable checklist data', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', inspectorName: '张三' },
    report: { id: 'report-1' },
    standardItems: [{
      id: 'section-1',
      itemName: '包装',
      children: [
        { id: 'item-1', standardItemId: 'std-1', itemName: '外箱', itemType: 'Standard' },
        { id: 'item-2', standardItemId: 'std-2', itemName: '标签', itemType: 'Text' }
      ]
    }],
    itemResults: [
      { id: 'item-1', standardItemId: 'std-1', resultStatus: 'APPROVED', remarks: '正常', fileList: [{ fileId: 'file-1' }] },
      { id: 'item-2', standardItemId: 'std-2', resultStatus: 'REJECTED', textContent: '[{"value":"错误"}]' }
    ]
  }, 'plan-1')

  assert.equal(detail.checklistItems.length, 2)
  assert.equal(detail.checklistData['item-1'].result, 'pass')
  assert.equal(detail.checklistData['item-2'].result, 'fail')
  assert.equal(detail.progress, 100)
  assert.equal(detail.photos[0].fileId, 'file-1')
})

test('rebuilds the H5 checklist tree when the detail API only returns itemResults', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', goodsName: '产品一' },
    standardItems: null,
    itemResults: [
      {
        id: 'section-result',
        standardItemId: 'section-standard',
        parentItemId: null,
        itemName: { zh: '包装检查', en: 'Packaging' },
        localizedItemName: '包装检查',
        sortOrder: 1
      },
      {
        id: 'item-result-1',
        standardItemId: 'item-standard-1',
        parentItemId: 'section-result',
        itemName: { zh: '外箱检查' },
        localizedItemName: '外箱检查',
        itemType: 'Measurements',
        specAttributes: [{ attrId: 'length', displayName: '长度' }],
        sortOrder: 2,
        isRequired: 1,
        isPhotoRequired: 1
      },
      {
        id: 'item-result-2',
        standardItemId: 'item-standard-2',
        parentItemId: 'section-standard',
        itemName: { zh: '标签检查' },
        localizedItemName: '标签检查',
        itemType: 'Text',
        sortOrder: 1
      }
    ]
  }, 'plan-1')

  assert.equal(detail.standardItems.length, 1)
  assert.equal(detail.standardItems[0].itemName, '包装检查')
  assert.deepEqual(detail.standardItems[0].children.map((item) => item.id), ['item-result-2', 'item-result-1'])
  assert.equal(detail.standardItems[0].children[1].specAttributes[0].attrName, '长度')
  assert.equal(detail.checklistItems.length, 2)
})

test('updates checklist results and calculates completion progress', () => {
  const base = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1' }, { id: 'item-2' }] }]
  }, 'plan-1')

  const updated = viewModel.updateChecklistItem(base, 'item-1', { result: 'na', comment: '不适用' })

  assert.equal(updated.checklistData['item-1'].completed, true)
  assert.equal(updated.progress, 50)
})

test('builds H5-compatible draft payload using only uploaded media', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', inspectorName: '李四' },
    report: { id: 'report-1' },
    standardItems: [{ children: [{ id: 'item-1', standardItemId: 'std-1', itemType: 'Standard' }] }],
    checklistData: {
      'item-1': {
        result: 'fail',
        comment: '破损',
        completed: true,
        photos: [
          { photoId: 'local', localPath: '/local.jpg', uploadStatus: 'pending' },
          { photoId: 'remote', fileId: 'file-1', filePath: '/remote.jpg', uploadStatus: 'done' }
        ]
      }
    },
    defects: [{ defectId: 'defect-1', type: 'MAJOR', quantity: 2, defectDesc: '破损' }]
  }, 'plan-1')

  const payload = viewModel.buildGeneratePayload(detail)

  assert.equal(payload.finishFlag, '0')
  assert.equal(payload.itemResults[0].resultStatus, 'REJECTED')
  assert.deepEqual(payload.itemResults[0].fileList, [{ fileId: 'file-1', filePath: '/remote.jpg', thumbnailPath: '' }])
  assert.equal(payload.defectRecords[0].defectType, 'major')
})

test('keeps check point photo business type in the offline draft payload', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1', itemType: 'Standard' }] }],
    checklistData: { 'item-1': { photos: [
      { fileId: 'check-result', filePath: '/result.jpg' },
      { fileId: 'check-point', filePath: '/point.jpg', bizType: 'checkPoint' }
    ] } }
  }, 'plan-1')
  const files = viewModel.buildGeneratePayload(detail).itemResults[0].fileList
  assert.equal(files[1].bizType, 'checkPoint')
  assert.equal(files[0].bizType, undefined)
})

test('check point photos do not satisfy required inspection result photos', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1', isPhotoRequired: 1 }] }],
    checklistData: { 'item-1': { result: 'pass', photos: [{ fileId: 'point-1', filePath: '/point.jpg', bizType: 'checkPoint' }] } }
  }, 'plan-1')
  assert.equal(viewModel.validateFinalSubmission(detail, { overallResult: 'pass' }).reason, 'missing-photos')
})

test('validates H5 required results required photos and overall result before final submit', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1', isRequired: 1 }, { id: 'item-2', isPhotoRequired: 1 }] }],
    checklistData: {
      'item-1': { result: 'pass', completed: true, photos: [] },
      'item-2': { result: 'fail', completed: true, photos: [] }
    }
  }, 'plan-1')

  assert.match(viewModel.validateFinalSubmission(detail, { overallResult: '' }).message, /必传图片/)
  assert.equal(viewModel.validateFinalSubmission(detail, { overallResult: '' }).reason, 'missing-photos')
  assert.match(viewModel.validateFinalSubmission(detail, { overallResult: 'FAIL' }).message, /必传图片/)

  const withPhoto = viewModel.updateChecklistItem(detail, 'item-2', {
    photos: [{ photoId: 'photo-1', fileId: 'file-1', uploadStatus: 'done' }]
  })
  assert.equal(viewModel.validateFinalSubmission(withPhoto, { overallResult: 'FAIL' }).valid, true)
})

test('keeps pending checklist rows incomplete when completion is explicitly false', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1' }] }]
  }, 'plan-1')
  const updated = viewModel.updateChecklistItem(detail, 'item-1', { result: 'pending', completed: false })
  assert.equal(updated.checklistData['item-1'].completed, false)
  assert.equal(updated.progress, 0)
})

test('normalizes server defects into H5 checklist associations', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'parent' },
    standardItems: [{ children: [{ id: 'item-1' }] }],
    defectRecords: [{ id: 'd1', itemResultId: 'item-1_son-1', sonPlanId: 'son-1', defectType: 'major', defectCount: 2, remark: '破损' }]
  }, 'parent')
  assert.equal(detail.defects[0].checkItemId, 'item-1')
  assert.equal(detail.defects[0].checkItemResultId, 'item-1_son-1')
  assert.equal(detail.defects[0].quantity, 2)
  assert.equal(detail.defects[0].description, '破损')
})

test('preserves null affected quantity for common defects across local detail and generate payload', () => {
  const detail = viewModel.normalizeInspectionDetail({ plan: { id: 'plan-1' }, defectRecords: [{ id: 'common-1', commonFlag: 1, defectCount: null }] }, 'plan-1')
  assert.equal(detail.defects[0].quantity, null)
  assert.equal(viewModel.buildGeneratePayload(detail).defectRecords[0].defectCount, null)
})

test('omits untouched merged child rows from the H5 generate payload', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'parent', mergeType: 2 },
    standardItems: [{ children: [{ id: 'item-1', standardItemId: 'std-1' }] }],
    itemResults: [
      { id: 'item-1', standardItemId: 'std-1' },
      { id: 'item-1_son-1', baseItemResultId: 'item-1', standardItemId: 'std-1', sonPlanId: 'son-1' }
    ]
  }, 'parent')
  assert.deepEqual(viewModel.buildGeneratePayload(detail).itemResults.map((row) => row.id), ['item-1'])
})

test('removes deleted checklist photos from the flattened local photo collection', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [{ id: 'item-1' }] }],
    checklistData: {
      'item-1': { result: 'pass', completed: true, photos: [{ photoId: 'photo-1', localPath: '/one.jpg', ownerType: 'checklist', ownerId: 'item-1' }] }
    }
  }, 'plan-1')

  const updated = viewModel.updateChecklistItem(detail, 'item-1', { photos: [] })

  assert.equal(updated.photos.length, 0)
})

test('expands merged child checklist rows and preserves son plan ids in payload', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'parent' },
    standardItems: [{ children: [{ id: 'item-1', standardItemId: 'std-1', itemName: '外观' }] }],
    itemResults: [
      { id: 'item-1', standardItemId: 'std-1', resultStatus: 'APPROVED' },
      { id: 'item-1_child-1', baseItemResultId: 'item-1', sonPlanId: 'child-1', standardItemId: 'std-1', resultStatus: 'REJECTED' }
    ]
  }, 'parent')

  assert.equal(detail.checklistItems.some((item) => item.itemId === 'item-1__child-1'), true)
  const payload = viewModel.buildGeneratePayload(detail)
  const child = payload.itemResults.find((item) => item.sonPlanId === 'child-1')
  assert.equal(child.id, 'item-1_child-1')
  assert.equal(child.resultStatus, 'REJECTED')
})

test('serializes measurements text and barcode checklist values like H5', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ children: [
      { id: 'measure', itemType: 'Measurements' },
      { id: 'text', itemType: 'Text' },
      { id: 'barcode', itemType: 'Barcodes' }
    ] }],
    checklistData: {
      measure: { result: 'pass', completed: true, measurements: [{ name: '长度', value: '12' }] },
      text: { result: 'pass', completed: true, textGroups: [{ value: '颜色正确' }] },
      barcode: { result: 'pass', completed: true, barcodeItems: [{ name: 'EAN', code: '12345', format: 'EAN13' }] }
    }
  }, 'plan-1')

  const payload = viewModel.buildGeneratePayload(detail)

  assert.equal(payload.itemResults.find((item) => item.id === 'measure').specResult, '[{"name":"长度","value":"12"}]')
  assert.equal(payload.itemResults.find((item) => item.id === 'text').textContent, '[{"value":"颜色正确"}]')
  assert.equal(payload.itemResults.find((item) => item.id === 'barcode').barcodeValue, '[{"name":"EAN","code":"12345","format":"EAN13"}]')
})

test('selects the current plan from the H5 inspectionPlans detail bundle', () => {
  const detail = viewModel.normalizeInspectionDetail({
    inspectionPlans: [
      { id: 'plan-1', goodsName: '产品一', subGoodsNo: 'SKU-1' },
      { id: 'plan-2', goodsName: '产品二', subGoodsNo: 'SKU-2' }
    ],
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    itemResults: []
  }, 'plan-2')

  assert.equal(detail.plan.id, 'plan-2')
  assert.equal(detail.plan.goodsName, '产品二')
  assert.equal(detail.plan.subGoodsNo, 'SKU-2')
  assert.equal(detail.checklistItems.length, 1)
})

test('uses H5 checklist keys for normal and merged inspection rows', () => {
  assert.equal(viewModel.makeChecklistDataKey('item-1'), 'item-1')
  assert.equal(viewModel.makeChecklistDataKey('item-1', 'plan-2'), 'item-1__plan-2')
  assert.equal(viewModel.makeItemResultId('item-1', 'plan-2'), 'item-1_plan-2')
})

test('builds merged inspection payload with main rows and edited child rows only', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'parent', mergeType: 2 },
    inspectionPlans: [
      { id: 'son-1', clientOrderNo: 'SO-1', subGoodsNo: 'SKU-1', batchNo: 'B1' },
      { id: 'son-2', clientOrderNo: 'SO-2', subGoodsNo: 'SKU-2', batchNo: 'B2' }
    ],
    standardItems: [{
      id: 'section-1',
      itemName: '包装',
      children: [{ id: 'item-1', standardItemId: 'std-1', itemName: '外箱', itemType: 'Standard' }]
    }],
    itemResults: [{ id: 'item-1', standardItemId: 'std-1', itemType: 'Standard' }],
    checklistData: {
      'item-1': { result: 'pass', completed: true, photos: [] },
      'item-1__son-1': { result: 'fail', comment: '破损', completed: true, photos: [] }
    }
  }, 'parent')

  const payload = viewModel.buildGeneratePayload(detail)
  assert.deepEqual(payload.itemResults.map((row) => row.id), ['item-1', 'item-1_son-1'])
  assert.equal(payload.itemResults[1].sonPlanId, 'son-1')
  assert.equal(payload.itemResults[1].resultStatus, 'REJECTED')
})

test('builds H5 defect counts and severity groups including affected totals', () => {
  const summary = viewModel.buildDefectViewModel([
    { id: 'd1', type: 'CRITICAL', quantity: 2 },
    { id: 'd2', type: 'major', quantity: 3 },
    { id: 'd3', typeLabel: '轻微', quantity: 1, commonFlag: 1 }
  ], [
    { value: 'CRITICAL', label: '致命缺陷', sortOrder: 1 },
    { value: 'MAJOR', label: '主要缺陷', sortOrder: 2 },
    { value: 'MINOR', label: '次要缺陷', sortOrder: 3 }
  ])

  assert.deepEqual(summary.counts, { critical: 1, major: 1, minor: 1 })
  assert.deepEqual(summary.groups.map((group) => group.key), ['CRITICAL', 'MAJOR', 'MINOR'])
  assert.equal(summary.groups[1].affectedTotal, 3)
})

test('builds complete H5 plan fields and merged quantity totals', () => {
  const fields = viewModel.buildPlanInfoFields({
    goodsName: '产品', requiredQuantity: 10, sampleSize: 2, factoryName: '工厂',
    deliveryDate: '2026-09-17', templateName: '清单A', inspectType: '终检',
    inspectionLevel: 'II', criticalAql: 0, majorAql: 2.5, minorAql: 4,
    factoryNo: 'F1', clientName: '客户', clientNo: 'C1', subGoodsNo: 'SKU',
    clientOrderNo: 'SO', domeNo: 'PO', produceNo: 'MO', modelNo: 'M1',
    batchNo: 'B1', inspectorName: '张三'
  })
  const merged = viewModel.buildMergedPlanSummary([
    { requiredQuantity: 10, sampleSize: 2 },
    { requiredQuantity: 20, sampleSize: 3 }
  ])

  assert.equal(fields.length, 18)
  assert.equal(fields.find((row) => row.label === '抽样标准').value, 'II 0/2.5/4')
  assert.deepEqual(merged, { requiredQuantity: 30, sampleSize: 5 })
})

test('merges uploaded repository photos back into checklist and defect drafts before synchronization', () => {
  const merged = viewModel.mergeDetailPhotos({
    planId: 'plan-1',
    checklistData: { 'item-1': { result: 'pass', photos: [] } },
    defects: [{ defectId: 'defect-1', photos: [] }],
    photos: []
  }, [
    { photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', fileId: 'file-1', uploadStatus: 'done' },
    { photoId: 'photo-2', ownerType: 'defect', ownerId: 'defect-1', fileId: 'file-2', uploadStatus: 'done' }
  ])

  assert.equal(merged.checklistData['item-1'].photos[0].fileId, 'file-1')
  assert.equal(merged.defects[0].photos[0].fileId, 'file-2')
  assert.equal(merged.photos.length, 2)
})

/** 新拍照片落入独立 photo 表时，保留仅存在于已下载详情中的原有检查点和疵点图片。 */
test('keeps downloaded checkpoint and defect photos when merging newly captured local photos', () => {
  const downloaded = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', goodsName: '产品一' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    itemResults: [{ id: 'item-1', fileList: [{ fileId: 'remote-check', filePath: '/remote/check.jpg' }] }],
    defects: [{ defectId: 'defect-1', fileList: [{ fileId: 'remote-defect', filePath: '/remote/defect.jpg' }] }]
  }, 'plan-1')

  const merged = viewModel.mergeDetailPhotos(downloaded, [
    { photoId: 'local-check', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/check.jpg', uploadStatus: 'pending' },
    { photoId: 'local-defect', ownerType: 'defect', ownerId: 'defect-1', localPath: '/local/defect.jpg', uploadStatus: 'pending' }
  ])

  assert.deepEqual(merged.checklistData['item-1'].photos.map((photo) => photo.photoId), ['remote-check', 'local-check'])
  assert.deepEqual(merged.defects[0].photos.map((photo) => photo.photoId), ['remote-defect', 'local-defect'])
  assert.equal(merged.photos.length, 4)
})

/** photo 表中的最新上传结果应回填同一图片，而非追加一张重复图片。 */
test('updates an existing checkpoint photo from the photo table without duplication', () => {
  const downloaded = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1' }] }],
    itemResults: [{ id: 'item-1', fileList: [{ fileId: 'remote-1', filePath: '/remote/old.jpg' }] }]
  }, 'plan-1')

  const merged = viewModel.mergeDetailPhotos(downloaded, [
    { photoId: 'remote-1', ownerType: 'checklist', ownerId: 'item-1', fileId: 'remote-1', filePath: '/remote/new.jpg', uploadStatus: 'done' }
  ])

  assert.equal(merged.checklistData['item-1'].photos.length, 1)
  assert.equal(merged.checklistData['item-1'].photos[0].filePath, '/remote/new.jpg')
})

/** 服务端只提供路径而没有文件 ID 的旧图片也应获得稳定主键并在新拍照片后保留。 */
test('preserves downloaded path-only checkpoint photos after adding a local photo', () => {
  const downloaded = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1' }] }],
    itemResults: [{ id: 'item-1', fileList: [{ filePath: '/remote/legacy.jpg' }] }]
  }, 'plan-1')
  const merged = viewModel.mergeDetailPhotos(downloaded, [
    { photoId: 'local-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg' }
  ])

  assert.equal(merged.checklistData['item-1'].photos.length, 2)
  assert.equal(merged.photos.length, 2)
  assert.notEqual(merged.checklistData['item-1'].photos[0].photoId, '')
})

test('includes finish and sample quantities in the normal offline draft payload', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', finishQuantity: 18, sampleQuantity: 6 },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistData: { 'item-1': { result: 'pass', completed: true, photos: [] } }
  }, 'plan-1')

  const payload = viewModel.buildGeneratePayload(detail)

  assert.equal(payload.finishQuantity, 18)
  assert.equal(payload.sampleQuantity, 6)
  assert.equal(payload.finishFlag, '0')
})

test('copies checklist fields and local photos into the target local detail before synchronization', () => {
  const source = viewModel.normalizeInspectionDetail({
    plan: { id: 'source-plan', subGoodsNo: 'SRC' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', standardItemId: 'std-1', itemName: '外观' }] }],
    checklistData: {
      'item-1': {
        result: 'fail',
        comment: '划痕',
        photos: [{ photoId: 'photo-1', localPath: '/saved/source.jpg', ownerType: 'checklist', ownerId: 'item-1', uploadStatus: 'pending' }]
      }
    }
  }, 'source-plan')
  const target = viewModel.normalizeInspectionDetail({
    plan: { id: 'target-plan', subGoodsNo: 'TARGET' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', standardItemId: 'std-1', itemName: '外观' }] }],
    checklistData: { 'item-1': { result: '', comment: '', photos: [] } }
  }, 'target-plan')

  const copied = viewModel.copyChecklistItemToDetail(source, target, {
    sourceItemId: 'item-1',
    targetItemIds: ['std-1'],
    copyStatus: true,
    copyRemarks: true,
    copyPhotos: true
  }, {
    createPhotoId: () => 'photo-copy-1'
  })

  assert.equal(copied.checklistData['item-1'].result, 'fail')
  assert.equal(copied.checklistData['item-1'].comment, '划痕')
  assert.equal(copied.checklistData['item-1'].photos[0].photoId, 'photo-copy-1')
  assert.equal(copied.checklistData['item-1'].photos[0].localPath, '/saved/source.jpg')
  assert.equal(copied.checklistData['item-1'].photos[0].ownerId, 'item-1')
  assert.equal(copied.checklistData['item-1'].photos[0].subGoodsNo, 'TARGET')
  assert.equal(copied.checklistData['item-1'].photos[0].uploadStatus, 'pending')
})

test('copies an uploaded photo locally and prevents duplicate target file records', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', subGoodsNo: 'SKU-1' },
    standardItems: [{
      id: 'section-1',
      children: [
        { id: 'item-1', standardItemId: 'std-1', itemName: '源检查项' },
        { id: 'item-2', standardItemId: 'std-2', itemName: '目标检查项' }
      ]
    }],
    checklistData: {
      'item-1': { photos: [{ photoId: 'photo-1', fileId: 'file-1', ownerType: 'checklist', ownerId: 'item-1', uploadStatus: 'done' }] },
      'item-2': { photos: [] }
    }
  }, 'plan-1')
  const photo = detail.checklistData['item-1'].photos[0]
  const targetItem = detail.checklistItems.find((item) => item.itemId === 'item-2')

  const copied = viewModel.copyChecklistPhotoToItem(detail, photo, targetItem, { createPhotoId: () => 'photo-copy-2' })
  const copiedAgain = viewModel.copyChecklistPhotoToItem(copied, photo, targetItem, { createPhotoId: () => 'photo-copy-3' })

  assert.equal(copiedAgain.checklistData['item-2'].photos.length, 1)
  assert.equal(copiedAgain.checklistData['item-2'].photos[0].photoId, 'photo-copy-2')
  assert.equal(copiedAgain.checklistData['item-2'].photos[0].fileId, 'file-1')
  assert.equal(copiedAgain.checklistData['item-2'].photos[0].ownerId, 'item-2')
})

test('updates local plan quantities without requiring a direct network request', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', finishQuantity: 1, sampleQuantity: 2 },
    inspectionPlans: [
      { id: 'plan-1', finishQuantity: 1, sampleQuantity: 2 },
      { id: 'plan-2', finishQuantity: 3, sampleQuantity: 4 }
    ],
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }]
  }, 'plan-1')

  const withFinish = viewModel.applyFinishQuantityRows(detail, [
    { id: 'plan-1', finishQuantity: 10 },
    { id: 'plan-2', finishQuantity: 20 }
  ])
  const withSample = viewModel.applySampleQuantity(withFinish, 8)

  assert.equal(withSample.plan.finishQuantity, 10)
  assert.equal(withSample.plan.sampleQuantity, 8)
  assert.equal(withSample.inspectionPlans.find((plan) => plan.id === 'plan-2').finishQuantity, 20)
})

test('builds H5 AQL defect stats with exceed flags against plan Ac thresholds', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', criticalAc: 0, majorAc: 2, minorAc: 4 },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1' }] }],
    defects: [
      { defectId: 'd1', type: 'critical', quantity: 1 },
      { defectId: 'd2', type: 'MAJOR', quantity: 2 },
      { defectId: 'd3', typeLabel: '轻微', quantity: 4, defectCount: 9 },
      { defectId: 'd4', type: '未知等级', quantity: 5 }
    ]
  }, 'plan-1')

  const summary = viewModel.buildFinishSummary(detail)

  assert.deepEqual(summary.defectStats.map((row) => row.key), ['critical', 'major', 'minor'])
  assert.deepEqual(summary.defectStats.map((row) => row.actual), [1, 2, 4])
  assert.deepEqual(summary.defectStats.map((row) => row.max), [0, 2, 4])
  assert.deepEqual(summary.defectStats.map((row) => row.exceed), [true, false, false])
  assert.deepEqual(summary.defectStats.map((row) => row.label), ['极严重', '大', '小'])
  assert.equal(summary.exceedsAql, true)
})

test('treats missing plan Ac thresholds as zero so any defect exceeds AQL', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    defects: [{ defectId: 'd1', type: 'minor', quantity: 3 }]
  }, 'plan-1')

  const summary = viewModel.buildFinishSummary(detail)

  assert.equal(summary.defectStats.find((row) => row.key === 'minor').max, 0)
  assert.equal(summary.defectStats.find((row) => row.key === 'minor').exceed, true)
  assert.equal(summary.exceedsAql, true)
})

test('collects H5 failed checkpoints from fail results for the finish summary', () => {
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' },
    standardItems: [{
      id: 'section-1',
      children: [{ id: 'item-1', itemName: '外箱破损' }, { id: 'item-2', itemName: '标签偏移' }]
    }],
    checklistData: {
      'item-1': { result: 'fail', completed: true },
      'item-2': { result: 'pass', completed: true }
    }
  }, 'plan-1')

  const summary = viewModel.buildFinishSummary(detail)

  assert.deepEqual(summary.failedCheckpoints, [{ id: 'item-1', name: '外箱破损' }])
})

test('clamps finish summary remarks to the H5 3000 character limit', () => {
  const summary = viewModel.buildFinishSummary(null, { overallRemarks: 'a'.repeat(3100) })
  assert.equal(summary.remarks.length, 3000)

  const valid = viewModel.buildFinishSummary(null, { overallRemarks: '整体质量合格' })
  assert.equal(valid.remarks, '整体质量合格')
})

test('accepts only H5 APPROVED REJECTED PENDING overall result values', () => {
  assert.equal(viewModel.normalizeOverallResult('PASS'), 'APPROVED')
  assert.equal(viewModel.normalizeOverallResult('FAIL'), 'REJECTED')
  assert.equal(viewModel.normalizeOverallResult('approved'), 'APPROVED')
  assert.equal(viewModel.normalizeOverallResult('REJECTED'), 'REJECTED')
  assert.equal(viewModel.normalizeOverallResult('PENDING'), 'PENDING')
  assert.equal(viewModel.normalizeOverallResult('随便'), '')
  assert.equal(viewModel.normalizeOverallResult(''), '')
})
