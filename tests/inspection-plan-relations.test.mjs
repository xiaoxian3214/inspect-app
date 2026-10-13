import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { createMemoryDatabase } = await loadUtsModule('database/memoryDatabase.uts')
const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')

/** 构造父子成员、同一报告和带子检查点的服务端响应。 */
function fixture() {
  const inspectionPlans = [
    { id: 'parent', parentPlanId: 'parent', mergeType: 2, goodsName: '母款', status: 1 },
    { id: 'child', parentPlanId: 'parent', mergeType: 2, goodsName: '子款', status: 1 }
  ]
  return inspectionPlans.map((plan) => ({
    planId: plan.id, plan, inspectionPlans, report: { id: 'remote-report', planId: 'parent' },
    standardItems: [{ id: 'section', children: [{ id: 'check', itemName: '外观' }] }],
    itemResults: [
      { id: 'check', planId: 'parent', resultStatus: 'APPROVED' },
      { id: 'check_child', planId: 'parent', sonPlanId: 'child', resultStatus: 'PENDING' }
    ],
    checklistData: { check: { result: 'pass' }, check__child: { result: 'pending' } },
    defectRecords: [{ id: 'defect-1', planId: 'parent', itemResultId: '', fileList: [] }],
    status: 1, syncStatus: 'SYNCED'
  }))
}

test('merged download persists plans as primary rows and checkpoints by parent plan ID', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  assert.deepEqual(database.readTable('inspection_plan').map((row) => row.planId), ['parent', 'child'])
  assert.deepEqual(database.readTable('inspection_plan').map((row) => row.groupPlanId), ['parent', 'parent'])
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('report')[0].planId, 'parent')
  assert.equal(database.readTable('item_result').length, 2)
  assert.ok(database.readTable('item_result').every((row) => row.planId === 'parent'))
  assert.equal(database.readTable('report_group').length, 0)
  assert.equal(database.readTable('report_member').length, 0)
  assert.deepEqual((await repository.getPlanById('parent')).itemResults, (await repository.getPlanById('child')).itemResults)
})

/** 报告 JSON 只存报告实体，其他离线状态与线上照片另存并可从任一合并入口读取。 */
test('download separates report JSON, shared state and remote image metadata', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const records = fixture().map((record) => ({
    ...record,
    report: { id: 'remote-report', planId: 'parent', overallRemarks: '已检查' },
    photos: [{ photoId: 'remote-photo', ownerType: 'checklist', ownerId: 'check', fileId: 'file-1', filePath: '/remote/one.jpg' }]
  }))
  await repository.savePlans(records)
  assert.deepEqual(JSON.parse(database.readTable('report')[0].jsonData), records[0].report)
  assert.equal(database.readTable('photo')[0].sourcePhotoId, 'remote-photo')
  assert.equal(database.readTable('photo')[0].fileId, 'file-1')
  const sibling = await repository.getPlanById('child')
  assert.equal(sibling.standardItems[0].children[0].itemName, '外观')
  assert.equal(sibling.photos[0].filePath, '/remote/one.jpg')
})

/** 下载接口仅在检查点和疵点文件列表中携带图片时也写入照片索引。 */
test('indexes remote checklist and defect file lists without duplicating media', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const records = fixture().map((record) => ({
    ...record,
    itemResults: [{ id: 'check', planId: 'parent', fileList: [{ fileId: 'check-file', filePath: '/check.jpg' }] }],
    defectRecords: [{ id: 'defect-1', planId: 'parent', fileList: [{ fileId: 'defect-file', filePath: '/defect.jpg' }] }]
  }))
  await repository.savePlans(records)
  const photos = database.readTable('photo')
  assert.equal(photos.length, 2)
  assert.deepEqual(photos.map((photo) => photo.ownerType), ['checklist', 'defect'])
  assert.deepEqual(photos.map((photo) => photo.ownerId), ['check', 'defect-1'])
})

/** 旧版共享 JSON 升级后不能覆盖报告字段或丢失草稿。 */
test('migrates relational report JSON into report body and shared state', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'one', groupPlanId: 'one', goods_name: '产品' })
    transaction.upsert('report', 'reportId', {
      reportId: 'one', planId: 'one', jsonData: JSON.stringify({ report: { id: 'report-one', overallRemarks: '旧备注' },
        standardItems: [{ id: 'group', children: [{ id: 'check', itemName: '检查' }] }], syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: 0 } })
    })
  })
  await repository.migrateLegacyMergedReports()
  assert.deepEqual(JSON.parse(database.readTable('report')[0].jsonData), { id: 'report-one', overallRemarks: '旧备注' })
  const restored = await repository.getPlanById('one')
  assert.equal(restored.syncStatus, 'DIRTY')
  assert.equal(restored.pendingSyncPayload.finishFlag, 0)
  assert.equal(restored.standardItems[0].children[0].itemName, '检查')
})

/** 兼容上一个版本已剥离 report 字段、但仍把共享状态写在报告 JSON 中的结构。 */
test('migrates existing shared-only report JSON without dropping report columns', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'one', groupPlanId: 'one', goods_name: '产品' })
    transaction.upsert('report', 'reportId', {
      reportId: 'one', planId: 'one', id: 'report-one', overall_remarks: '保留列',
      jsonData: JSON.stringify({ syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: 0 },
        standardItems: [{ id: 'section', children: [{ id: 'check' }] }] })
    })
  })
  await repository.migrateLegacyMergedReports()
  assert.equal(JSON.parse(database.readTable('report')[0].jsonData).overallRemarks, '保留列')
  assert.equal((await repository.getPlanById('one')).syncStatus, 'DIRTY')
})

/** 本地下载页逐条展示 inspectionPlans 的 SQLite 原始行，而非合并报告快照。 */
test('local download rows expose each original inspection plan row', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  const records = await repository.listStoredInspectionPlanRows()
  assert.equal(records.length, 2)
  assert.deepEqual(records.map((row) => row.data.id), ['parent', 'child'])
  assert.deepEqual(records.map((row) => row.data.goods_name), ['母款', '子款'])
  assert.ok(records.every((row) => row.data.groupPlanId === 'parent'))
  assert.equal(records[1].data.planId, 'child')
  assert.equal(records[1].data.parent_plan_id, 'parent')
  assert.equal(records[1].data.itemResults, undefined)
  assert.equal(records[1].data.report, undefined)
})

test('editing a child persists local checkpoint results on item_result rows, not report JSON', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  const child = await repository.getPlanById('child')
  await repository.saveDetailSnapshot('child', {
    ...child, checklistData: { ...child.checklistData, check: { result: 'fail', comment: '脱线' } },
    defects: child.defectRecords, photos: [], checklistItems: []
  })
  const row = database.readTable('item_result').find((item) => item.itemResultId === 'check')
  assert.equal(JSON.parse(row.jsonData).localData.result, 'fail')
  assert.equal(JSON.parse(row.jsonData).resultStatus, 'REJECTED')
  assert.equal(JSON.parse(row.jsonData).remarks, '脱线')
  assert.equal((await repository.getPlanById('parent')).checklistData.check.comment, '脱线')
  assert.equal((await repository.getPlanById('parent')).itemResults[0].localData, undefined)
  assert.equal(JSON.parse(database.readTable('report')[0].jsonData).checklistData, undefined)
})

test('single plan uses its own ID as relation key', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans([{ ...fixture()[0], planId: 'single', plan: { id: 'single', mergeType: 0 },
    inspectionPlans: [{ id: 'single', mergeType: 0 }], report: { id: 'single-report', planId: 'single' },
    itemResults: [{ id: 'check', planId: 'single' }] }])
  assert.equal(database.readTable('inspection_plan')[0].groupPlanId, 'single')
  assert.equal(database.readTable('report')[0].planId, 'single')
  assert.equal(database.readTable('item_result')[0].planId, 'single')
})

test('old grouped drafts and photos migrate to parent-linked tables without losing edits', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const records = fixture()
  const shared = { ...records[1], syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent', finishFlag: 0 },
    checklistData: { check: { result: 'fail', comment: '旧草稿' } } }
  await database.transaction(async (transaction) => {
    transaction.upsert('report_group', 'groupId', {
      groupId: 'remote-report', parentPlanId: 'parent', status: 1, syncStatus: 'DIRTY', jsonData: JSON.stringify(shared)
    })
    for (const plan of records) transaction.upsert('report_member', 'planId', {
      planId: plan.planId, groupId: 'remote-report', status: 1, jsonData: JSON.stringify({ plan: plan.plan })
    })
    transaction.upsert('photo', 'photoId', {
      photoId: 'remote-report::p1', sourcePhotoId: 'p1', reportId: 'remote-report',
      localPath: '/offline/p1.jpg', uploadStatus: 'pending',
      jsonData: JSON.stringify({ photoId: 'p1', localPath: '/offline/p1.jpg', uploadStatus: 'pending' })
    })
  })
  await repository.migrateLegacyMergedReports()
  assert.equal(database.readTable('report_group').length, 0)
  assert.equal(database.readTable('report_member').length, 0)
  assert.equal(database.readTable('photo')[0].reportId, 'parent')
  assert.equal((await repository.getPlanById('parent')).checklistData.check.comment, '旧草稿')
  assert.equal((await repository.getPlanById('parent')).checklistData.check__child.result, 'pending')
  assert.equal((await repository.getPlanById('child')).syncStatus, 'DIRTY')
  assert.equal((await repository.getPlanById('child')).photos[0].localPath, '/offline/p1.jpg')
})

test('final submission updates every plan status and shared report in one transaction', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  const detail = await repository.getPlanById('child')
  await repository.saveDetailSnapshot('child', {
    ...detail, status: 3, syncStatus: 'SYNCED', pendingSyncPayload: null,
    inspectionPlans: detail.inspectionPlans.map((plan) => ({ ...plan, status: 3 })),
    checklistItems: [], photos: []
  })
  assert.deepEqual(database.readTable('inspection_plan').map((row) => row.status), [3, 3])
  assert.equal(database.readTable('report')[0].status, 3)
  assert.ok((await repository.listPlans()).every((plan) => plan.status === 3 && plan.inspectionPlans.every((member) => member.status === 3)))
})

test('release removes the shared report only after its final plan is removed', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  await repository.removePlansByIds(['child'])
  assert.equal(database.readTable('inspection_plan').length, 1)
  assert.equal(database.readTable('report').length, 1)
  await repository.removePlansByIds(['parent'])
  assert.equal(database.readTable('inspection_plan').length, 0)
  assert.equal(database.readTable('report').length, 0)
  assert.equal(database.readTable('item_result').length, 0)
  assert.equal(database.readTable('defect').length, 0)
})

test('saving an online single-plan detail without a prior download uses relational tables', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.saveDetailSnapshot('online-1', {
    plan: { id: 'online-1', goodsName: '产品' },
    report: { id: 'remote-1', planId: 'online-1' },
    itemResults: [{ id: 'check-1', planId: 'online-1' }],
    checklistData: { 'check-1': { result: 'pass' } }, checklistItems: [], defects: [], photos: []
  })
  assert.equal(database.readTable('inspection_plan').length, 1)
  assert.equal(database.readTable('item_result').length, 1)
  assert.equal((await repository.getPlanById('online-1')).checklistData['check-1'].result, 'pass')
})

test('re-downloading plans does not overwrite an unsynced shared checklist draft', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  const child = await repository.getPlanById('child')
  await repository.saveDetailSnapshot('child', {
    ...child, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent', finishFlag: 0 },
    checklistData: { ...child.checklistData, check: { result: 'fail', comment: '离线修改' } },
    checklistItems: [], photos: []
  })
  await repository.savePlans(fixture())
  const parent = await repository.getPlanById('parent')
  assert.equal(parent.checklistData.check.comment, '离线修改')
  assert.equal(parent.syncStatus, 'DIRTY')
  assert.deepEqual(parent.pendingSyncPayload, { planId: 'parent', finishFlag: 0 })
})

/** 业务实体字段按后端表结构落列，JSON 只保留检查项和离线附加信息。 */
test('plan report and defect business fields persist as columns instead of full JSON records', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const records = fixture().map((record) => ({
    ...record,
    plan: { ...record.plan, factoryName: '河南工厂', inspectType: '最终验货', finishQuantity: 50 },
    report: { ...record.report, overallResult: 'UNTESTED', inspectorName: '验货员' },
    defectRecords: [{ id: 'defect-1', planId: 'parent', itemResultId: '', defectLevel: 'MAJOR',
      defectDesc: '破损', quantity: 2, fileList: [], comments: [] }]
  }))
  await repository.savePlans(records)
  const plan = database.readTable('inspection_plan')[0]
  const report = database.readTable('report')[0]
  const defect = database.readTable('defect')[0]
  assert.equal(plan.id, 'parent')
  assert.equal(plan.factory_name, '河南工厂')
  assert.equal(plan.inspect_type, '最终验货')
  assert.equal(plan.finish_quantity, 50)
  assert.equal(report.id, 'remote-report')
  assert.equal(report.plan_id, 'parent')
  assert.equal(report.overall_result, 'UNTESTED')
  assert.equal(report.inspector_name, '验货员')
  assert.equal(defect.id, 'defect-1')
  assert.equal(defect.plan_id, 'parent')
  assert.equal(defect.defect_level, 'MAJOR')
  assert.equal(defect.defect_desc, '破损')
  assert.equal(JSON.parse(plan.jsonData).plan, undefined)
  assert.equal(JSON.parse(report.jsonData).report, undefined)
  assert.equal(JSON.parse(defect.jsonData).defectDesc, undefined)
  assert.ok(database.readTable('item_result')[0].jsonData.includes('resultStatus'))
})

test('draft edits update report and defect columns without duplicating business JSON', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(fixture())
  const detail = await repository.getPlanById('child')
  await repository.saveDetailSnapshot('child', {
    ...detail, report: { ...detail.report, overallResult: 'FAILED', overallRemarks: '需返工' },
    plan: { ...detail.plan, finishQuantity: 41 },
    defects: [{ id: 'defect-2', planId: 'parent', itemResultId: '', defectLevel: 'MINOR', defectDesc: '脱线', quantity: 4, photos: [] }],
    checklistItems: [], photos: []
  })
  assert.equal(database.readTable('report')[0].overall_result, 'FAILED')
  assert.equal(database.readTable('report')[0].overall_remarks, '需返工')
  assert.equal(database.readTable('inspection_plan').find((row) => row.planId === 'child').finish_quantity, 41)
  assert.equal(database.readTable('defect')[0].defect_desc, '脱线')
  assert.equal(JSON.parse(database.readTable('defect')[0].jsonData).defectDesc, undefined)
  assert.equal((await repository.getPlanById('parent')).report.overallResult, 'FAILED')
})
