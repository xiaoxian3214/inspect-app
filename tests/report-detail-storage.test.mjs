import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const repositoryModule = await loadUtsModule('repositories/reportRepository.uts')

/** 下载后重开 SQLite 详情，模板节点仍应指向保存了状态和备注的结果行。 */
test('joins a downloaded template checkpoint with its result JSON when reopened', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' },
    standardItems: [{ id: 'section', children: [{ id: 'template-1', itemName: '外观' }] }],
    itemResults: [{ id: 'result-1', standardItemId: 'template-1', resultStatus: 'APPROVED', remarks: '你好测试\n' }]
  }])
  const detail = viewModel.normalizeInspectionDetail(await reports.getPlanById('plan'), 'plan')
  const rowId = detail.standardItems[0].children[0].id
  assert.equal(rowId, 'result-1')
  assert.equal(detail.checklistData[rowId].result, 'pass')
  assert.equal(detail.checklistData[rowId].comment, '你好测试\n')
})

/** SQLite 行的服务端结果应完整回填弹层数据，旧草稿不能遮蔽各种检查项类型的原值。 */
test('restores status, remarks and typed values from each result JSON for the checklist sheet', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const rows = [
    { id: 'standard', itemType: 'Standard', resultStatus: 'REJECTED', remarks: '包装破损', localData: { result: '', comment: '' } },
    { id: 'measure', itemType: 'Measurements', resultStatus: 'APPROVED', remarks: '尺寸正常', specResult: '[{"width":"12"}]', localData: { result: 'pass', measurements: [] } },
    { id: 'text', itemType: 'Text', resultStatus: 'PENDING', remarks: '待复核', textContent: '[{"color":"红色"}]', localData: { result: 'pending', textGroups: [] } },
    { id: 'barcode', itemType: 'Barcodes', resultStatus: 'APPROVED', remarks: '条码清晰', barcodeValue: '[{"name":"EAN","code":"12345","format":"EAN13"}]' }
  ]
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' }, itemResults: rows }])
  const local = await reports.getPlanById('plan')
  const detail = viewModel.normalizeInspectionDetail(local, 'plan')
  const sheetData = (id) => detail.checklistItems.find((item) => item.itemId === id)?.data

  assert.equal(sheetData('standard').result, 'fail')
  assert.equal(sheetData('standard').comment, '包装破损')
  assert.deepEqual(sheetData('measure').measurements, [{ width: '12' }])
  assert.equal(sheetData('measure').comment, '尺寸正常')
  assert.deepEqual(sheetData('text').textGroups, [{ color: '红色' }])
  assert.equal(sheetData('text').result, 'pending')
  assert.deepEqual(sheetData('barcode').barcodeItems, [{ name: 'EAN', code: '12345', format: 'EAN13' }])
  assert.equal(sheetData('barcode').comment, '条码清晰')
})

/** 条码编辑和清空应更新本行 jsonData，重新打开不能回显旧条码。 */
test('persists changed and cleared barcode values in the result JSON', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' }, itemResults: [
    { id: 'barcode', itemType: 'Barcodes', barcodeValue: '[{"name":"EAN","code":"old","format":"EAN13"}]' }
  ] }])
  const detail = await reports.getPlanById('plan')
  detail.checklistData.barcode.barcodeItems = [{ name: 'EAN', code: 'new', format: 'EAN13' }]
  await reports.saveDraftChanges('plan', detail, { itemIds: ['barcode'] })
  assert.equal(JSON.parse(database.readTable('item_result')[0].jsonData).barcodeValue, '[{"name":"EAN","code":"new","format":"EAN13"}]')
  detail.checklistData.barcode.barcodeItems = []
  detail.checklistData.barcode.barcodeList = []
  detail.checklistData.barcode.barcode = ''
  await reports.saveDraftChanges('plan', detail, { itemIds: ['barcode'] })
  assert.deepEqual((await reports.getPlanById('plan')).checklistData.barcode.barcodeItems, [])
})

/** 修改备注只更新对应结果 JSON，保留服务端行的子计划归属、图片及未编辑的测试字段。 */
test('preserves original item result fields when saving a single edited row', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const original = {
    id: 'result-1', reportId: 'report-1', planId: 'child-plan', standardItemId: 'template-1',
    itemType: 'Measurements', specResult: null, textContent: '[]', resultStatus: 'APPROVED',
    specAttributes: [{ attrId: 'width', attrKey: { zh: '宽' } }],
    fileList: [{ fileId: 'remote-1', filePath: '/remote.jpg' }], remarks: null
  }
  await reports.savePlans([{ planId: 'group-plan', plan: { id: 'group-plan' }, report: { id: 'report-1' }, itemResults: [original] }])
  const detail = viewModel.updateChecklistItem(viewModel.normalizeInspectionDetail(
    await reports.getPlanById('group-plan'), 'group-plan'
  ), 'result-1', { comment: '已复检' })
  await reports.saveDraftChanges('group-plan', detail, { itemIds: ['result-1'] })

  const stored = JSON.parse(database.readTable('item_result')[0].jsonData)
  assert.equal(stored.id, original.id)
  assert.equal(stored.planId, original.planId)
  assert.equal(stored.specResult, original.specResult)
  assert.equal(stored.textContent, original.textContent)
  assert.deepEqual(stored.specAttributes, original.specAttributes)
  assert.deepEqual(stored.fileList, original.fileList)
  assert.equal(stored.remarks, '已复检')
  assert.equal((await reports.getPlanById('group-plan')).checklistData['result-1'].comment, '已复检')
})

/** 只编辑检查项的部分字段时，结果行 jsonData 中未触及的状态和备注不能被写成空值。 */
test('preserves stored status and remarks when a sparse checklist edit omits them', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' }, itemResults: [
    { id: 'first', resultStatus: 'APPROVED', remarks: '备注测试', fileList: [] },
    { id: 'second', resultStatus: 'REJECTED', remarks: '另一个检查项' }
  ] }])
  const detail = await reports.getPlanById('plan')
  detail.checklistData.first = { photos: [{ photoId: 'local-1', localPath: '/local.jpg' }] }
  await reports.saveDraftChanges('plan', detail, { itemIds: ['first'] })

  const rows = database.readTable('item_result')
  const first = JSON.parse(rows.find((row) => row.itemResultId === 'first').jsonData)
  const second = JSON.parse(rows.find((row) => row.itemResultId === 'second').jsonData)
  assert.equal(first.resultStatus, 'APPROVED')
  assert.equal(first.remarks, '备注测试')
  assert.equal(first.fileList[0].localPath, '/local.jpg')
  assert.equal(second.resultStatus, 'REJECTED')
  assert.equal(second.remarks, '另一个检查项')
  assert.equal((await reports.getPlanById('plan')).checklistData.first.comment, '备注测试')
})

/** 用户明确清除状态和备注时，仍需写入结果 JSON，而不能沿用旧值。 */
test('explicitly cleared result and comment update the item result JSON', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' }, itemResults: [
    { id: 'first', resultStatus: 'APPROVED', remarks: '备注测试' }
  ] }])
  const detail = await reports.getPlanById('plan')
  detail.checklistData.first = { result: '', comment: '' }
  await reports.saveDraftChanges('plan', detail, { itemIds: ['first'] })
  const stored = JSON.parse(database.readTable('item_result')[0].jsonData)
  assert.equal(stored.resultStatus, null)
  assert.equal(stored.remarks, '')
})

/** 原生 UTS 下载时可能将缺失的草稿解析为 null，不得访问其 result 或改写原始结果。 */
test('downloads result JSON unchanged when local draft is null', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const original = { id: 'result-1', resultStatus: 'APPROVED', remarks: '备注测试' }
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan' }, report: { id: 'report' },
    itemResults: [{ ...original, localData: null }] }])
  const saved = JSON.parse(database.readTable('item_result')[0].jsonData)
  assert.deepEqual(saved, { ...original, localData: null })
  const reopened = await reports.getPlanById('plan')
  assert.equal(reopened.checklistData['result-1'].result, 'pass')
  assert.equal(reopened.checklistData['result-1'].comment, '备注测试')
  const source = await readFile('repositories/reportRepository.uts', 'utf8')
  assert.doesNotMatch(source, /localData\.result\b/)
  assert.doesNotMatch(source, /localData\.comment\b/)
})

/** 旧稀疏草稿仅保存本地照片与备注时，重登不能遮蔽 jsonData 中的远端图片和测试值。 */
test('restores original result media and measurements beside a sparse local draft', async () => {
  const database = memoryModule.createMemoryDatabase()
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'plan', groupPlanId: 'plan', goods_name: '产品' })
    transaction.upsert('report', 'reportId', { reportId: 'plan', planId: 'plan', jsonData: JSON.stringify({ id: 'report' }) })
    transaction.upsert('item_result', 'itemResultId', {
      itemResultId: 'result', planId: 'plan', jsonData: JSON.stringify({
        id: 'result', itemType: 'Measurements', fileList: [{ fileId: 'remote-1', filePath: '/remote.jpg' }],
        specResult: '[{"value":"12"}]', resultStatus: 'APPROVED',
        localData: { result: 'fail', comment: '本地复检', photos: [{ photoId: 'local-1', localPath: '/local.jpg' }] }
      })
    })
  })
  const reports = repositoryModule.createReportRepository(database)
  const restored = await reports.getPlanById('plan')
  assert.equal(restored.checklistData.result.comment, '本地复检')
  assert.deepEqual(restored.checklistData.result.photos.map((photo) => photo.fileId ?? photo.photoId), ['remote-1', 'local-1'])
  assert.deepEqual(restored.checklistData.result.measurements, [{ value: '12' }])
})

/** 页面主动删除服务端图片后，重新读取不能从旧结果数据把已删除文件恢复。 */
test('keeps explicitly removed remote photos removed after draft save', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  const photos = createPhotoRepository(database)
  await reports.savePlans([{ planId: 'plan', plan: { id: 'plan', goodsName: '产品' }, report: { id: 'report' },
    itemResults: [{ id: 'result', fileList: [{ fileId: 'remote-1' }] }] }])
  const loaded = viewModel.normalizeInspectionDetail(await reports.getPlanById('plan'), 'plan')
  await photos.remove('plan', 'remote-1')
  const edited = viewModel.updateChecklistItem(loaded, 'result', { photos: [] })
  await reports.saveDraftChanges('plan', edited, { itemIds: ['result'] })
  const restored = await reports.getPlanById('plan')
  assert.deepEqual(restored.checklistData.result.photos, [])
  assert.deepEqual(restored.itemResults[0].fileList, [])
})

/** 服务端承诺结果 ID 唯一，若不同报告复用同一 ID，不得悄悄覆盖先前的离线数据。 */
test('rejects a duplicate result id across different reports', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  await reports.savePlan({ planId: 'first', plan: { id: 'first' }, itemResults: [{ id: 'result', remarks: '原始' }] })
  await assert.rejects(reports.savePlan({ planId: 'second', plan: { id: 'second' }, itemResults: [{ id: 'result', remarks: '新的' }] }), /结果 ID 冲突/)
  assert.equal(database.readTable('item_result')[0].planId, 'first')
})

/** 单项草稿仅落对应结果行及共享同步状态，不重写疵点或其它检查项。 */
test('persists one edited checklist result without replacing other report tables', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const source = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1', goodsName: '产品' },
    standardItems: [{ id: 'section', children: [{ id: 'one' }, { id: 'two' }] }],
    itemResults: [{ id: 'one' }, { id: 'two' }],
    defects: [{ defectId: 'defect-1', defectDesc: '原疵点' }]
  }, 'plan-1')
  await reports.saveDetailSnapshot('plan-1', source)
  const before = database.snapshot()
  const written = []
  const originalTransaction = database.transaction
  database.transaction = (executor) => originalTransaction((transaction) => executor({
    ...transaction,
    /** 记录局部保存实际写入的业务表和主键。 */
    upsert(table, key, row) { written.push(`${table}:${row[key]}`); transaction.upsert(table, key, row) },
    /** 记录局部保存是否尝试整表删除。 */
    removeWhere(table, predicate) { written.push(`${table}:remove`); transaction.removeWhere(table, predicate) }
  }))
  const detail = viewModel.updateChecklistItem(source, 'one', { result: 'fail', comment: '划痕' })
  const service = createInspectionDetailService({ reportRepository: reports, viewModel })

  await service.saveDraft('plan-1', detail, { changes: { itemIds: ['one'] } })

  const after = database.snapshot()
  assert.deepEqual(after.defect, before.defect)
  assert.deepEqual(after.photo, before.photo)
  assert.ok(written.includes('item_result:one'))
  assert.ok(!written.some((entry) => entry.startsWith('defect:') || entry.startsWith('photo:') || entry === 'item_result:two'))
  assert.deepEqual(after.item_result.find((row) => row.itemResultId === 'two'), before.item_result.find((row) => row.itemResultId === 'two'))
  assert.equal((await reports.getPlanById('plan-1')).checklistData.one.comment, '划痕')
  assert.equal((await reports.getPlanById('plan-1')).pendingSyncPayload.finishFlag, '0')
  assert.equal((await reports.getPlanById('plan-1')).pendingSyncPayload.itemResults.find((row) => row.id === 'one').remarks, '划痕')
})

/** 疵点新增、编辑和删除仅修改目标疵点行，其他业务表仍保持完整。 */
test('persists and removes one defect without replacing checklist and photo rows', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const source = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' }, standardItems: [{ id: 'section', children: [{ id: 'one' }] }],
    itemResults: [{ id: 'one' }], defects: [{ defectId: 'old', defectDesc: '旧疵点' }]
  }, 'plan-1')
  await reports.saveDetailSnapshot('plan-1', source)
  const before = database.snapshot()
  const updated = { ...source, defects: [...source.defects, { defectId: 'new', defectDesc: '新疵点', type: 'MAJOR' }], syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: '0' } }

  await reports.saveDraftChanges('plan-1', updated, { defectIds: ['new'] })
  assert.deepEqual(database.snapshot().item_result, before.item_result)
  assert.deepEqual(database.snapshot().photo, before.photo)
  assert.equal((await reports.getPlanById('plan-1')).defects.length, 2)

  await reports.saveDraftChanges('plan-1', { ...updated, defects: source.defects }, { removedDefectIds: ['new'] })
  assert.deepEqual((await reports.getPlanById('plan-1')).defects.map((defect) => defect.defectId), ['old'])
  assert.deepEqual(database.snapshot().item_result, before.item_result)
})

/** 同一合并报告的成员立即读取共享照片，但待上传任务只归原拍摄成员所有。 */
test('merged members see locally captured photos before a draft snapshot is saved', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reports = repositoryModule.createReportRepository(database)
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const photos = createPhotoRepository(database)
  const inspectionPlans = [
    { id: 'parent-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '主产品' },
    { id: 'child-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '子产品' }
  ]
  await reports.savePlans(inspectionPlans.map((plan) => ({
    report: { id: 'report-shared' }, inspectionPlans, plan, planId: plan.id,
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistData: { 'item-1': { photos: [] } }
  })))
  await reports.savePlan({ planId: 'other-1', plan: { id: 'other-1', goodsName: '其他产品' }, report: { id: 'report-other' } })
  await photos.save('child-1', {
    photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1',
    localPath: '/local/one.jpg', uploadStatus: 'pending'
  })
  const detail = createInspectionDetailService({
    reportRepository: reports, listPhotos: photos.listByReportId,
    planApi: { getPlanDetail: async () => assert.fail('离线不应请求详情') },
    isOnline: async () => false, viewModel
  })

  const parentDetail = await detail.loadDetail('parent-1')
  assert.equal(parentDetail.checklistData['item-1'].photos[0].localPath, '/local/one.jpg')
  assert.deepEqual(await photos.listByReportId('other-1'), [])
  assert.deepEqual((await photos.listPendingByReportId('parent-1')).map((photo) => photo.photoId), ['photo-1'])
  assert.deepEqual((await photos.listPendingByReportId('child-1')).map((photo) => photo.photoId), ['photo-1'])

  await detail.saveDraft('parent-1', parentDetail)
  assert.equal(database.readTable('photo').filter((row) => row.sourcePhotoId === 'photo-1').length, 1)
  await photos.save('parent-1', { ...(await photos.listByReportId('parent-1'))[0], uploadStatus: 'retry_wait' })
  assert.equal(database.readTable('photo').filter((row) => row.sourcePhotoId === 'photo-1').length, 1)
  assert.equal((await photos.listPendingByReportId('child-1'))[0].uploadStatus, 'retry_wait')
  await photos.markUploaded('child-1', 'photo-1', { fileId: 'file-1' })
  assert.equal((await detail.loadDetail('parent-1')).checklistData['item-1'].photos[0].fileId, 'file-1')
  await photos.remove('parent-1', 'photo-1')
  assert.equal((await photos.listByReportId('child-1')).length, 0)
})

/** 重新创建仓库读取历史下载行时，兼容平铺供应商及验货类型名称。 */
test('restores legacy card fields from persisted report JSON after login', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  await repository.savePlan({
    planId: 'plan-1', supplierName: '工厂乙', inspectTypeName: '最终验货', domeNo: '合同乙',
    plan: { id: 'plan-1', inspectType: 'FINAL' }
  })

  const [summary] = await repositoryModule.createReportRepository(database).listPlanSummaries()
  assert.equal(summary.plan.factoryName, '工厂乙')
  assert.equal(summary.plan.inspectType, 'FINAL')
  assert.equal(summary.plan.inspectTypeName, '最终验货')
  assert.equal(summary.plan.domeNo, '合同乙')
})

test('stores H5 detail fields in report checklist defect and photo tables', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)

  await repository.saveDetailSnapshot('plan-1', {
    plan: { id: 'plan-1', clientOrderNo: 'PO-1', goodsName: '产品一' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistItems: [{ itemId: 'item-1', itemName: '外观', data: { result: 'fail' } }],
    defects: [{ defectId: 'defect-1', checkItemId: 'item-1', type: 'MAJOR', defectDesc: '破损', photos: [] }],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg', uploadStatus: 'pending' }]
  })

  const report = database.readTable('report')[0]
  const checklist = database.readTable('item_result').find((row) => JSON.parse(row.jsonData).checklistItem != null)
  const defect = database.readTable('defect')[0]
  const photo = database.readTable('photo')[0]

  assert.equal(report.productName, '产品一')
  assert.deepEqual(JSON.parse(report.jsonData), {})
  assert.equal((await repository.getPlanById('plan-1')).standardItems[0].children[0].itemName, '外观')
  assert.equal(JSON.parse(checklist.jsonData).checklistItem.itemId, 'item-1')
  assert.equal(defect.sourceDefectId, 'defect-1')
  assert.equal(defect.itemId, 'item-1')
  assert.equal(defect.desc, '破损')
  assert.equal(photo.sourcePhotoId, 'photo-1')
  assert.equal(photo.ownerType, 'checklist')
  assert.equal(photo.ownerId, 'item-1')
})

test('merged plans keep separate list identities but share the latest report content', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const inspectionPlans = [
    { id: 'plan-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '产品一' },
    { id: 'plan-2', parentPlanId: 'parent-1', mergeType: 2, goodsName: '产品二' }
  ]
  await repository.savePlans(inspectionPlans.map((plan) => ({
    report: { id: 'report-shared' }, inspectionPlans, plan, planId: plan.id,
    checklistData: { 'item-1': { result: '' } }
  })))
  const changed = { ...await repository.getPlanById('plan-1'),
    checklistData: { 'item-1': { result: 'pass' } }, checklistItems: [], defects: [], photos: [] }
  await repository.saveDetailSnapshot('plan-1', changed)
  const sibling = await repository.getPlanById('plan-2')
  assert.equal(sibling.plan.id, 'plan-2')
  assert.equal(sibling.report.id, 'report-shared')
  assert.equal(sibling.checklistData['item-1'].result, 'pass')
  assert.equal(database.readTable('inspection_plan').length, 2)
  assert.equal(database.readTable('item_result').length, 1)
  assert.equal(database.readTable('report').length, 1)
})

test('removing merged media does not restore a stale photo from another plan entry', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const inspectionPlans = [
    { id: 'plan-1', parentPlanId: 'parent-1', mergeType: 2 },
    { id: 'plan-2', parentPlanId: 'parent-1', mergeType: 2 }
  ]
  await repository.savePlans(inspectionPlans.map((plan) => ({ plan, planId: plan.id, inspectionPlans, report: { id: 'report-1' } })))
  const shared = { ...await repository.getPlanById('plan-2'), checklistItems: [], defects: [],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', fileId: 'file-1' }] }
  await repository.saveDetailSnapshot('plan-2', shared)
  assert.equal(database.readTable('photo').length, 1)
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  await createPhotoRepository(database).remove('plan-1', 'photo-1')
  await repository.saveDetailSnapshot('plan-1', { ...await repository.getPlanById('plan-1'), photos: [], checklistItems: [], defects: [] })
  assert.deepEqual((await repository.getPlanById('plan-2')).photos, [])
  assert.equal(database.readTable('photo').length, 0)
})

test('stale detail snapshots do not reset uploaded photos back to pending', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reportRepository = repositoryModule.createReportRepository(database)
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const photoRepository = photoModule.createPhotoRepository(database)
  const staleDetail = {
    plan: { id: 'plan-1', clientOrderNo: 'PO-1', goodsName: '产品一' },
    checklistItems: [],
    defects: [],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg', uploadStatus: 'pending' }]
  }

  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  await photoRepository.markUploaded('plan-1', 'photo-1', { fileId: 'file-1', filePath: '/remote/one.jpg' })
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)

  assert.deepEqual(await photoRepository.listPendingByReportId('plan-1'), [])
  assert.equal((await photoRepository.listByReportId('plan-1'))[0].fileId, 'file-1')
})

test('saving an older draft does not delete a separately persisted pending photo', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reportRepository = repositoryModule.createReportRepository(database)
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const photoRepository = photoModule.createPhotoRepository(database)
  const staleDetail = { plan: { id: 'plan-1', goodsName: '产品一' }, checklistData: { 'item-1': { photos: [] } }, checklistItems: [], defects: [], photos: [] }
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  await photoRepository.save('plan-1', { photoId: 'p1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/documents/1.jpg', uploadStatus: 'pending' })
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  assert.equal((await photoRepository.listByReportId('plan-1')).length, 1)
  assert.equal((await reportRepository.getPlanById('plan-1')).photos[0].photoId, 'p1')
  assert.equal((await reportRepository.getPlanById('plan-1')).checklistData?.['item-1']?.photos?.[0]?.photoId, 'p1')
})
