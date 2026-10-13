import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { loadUtsModule } from './load-uts-module.mjs'

const sqliteModule = await loadUtsModule('database/sqliteDatabase.uts')
const schemaModule = await loadUtsModule('database/schema.uts')

/** 用真正的 SQLite 引擎模拟双端原生驱动，并保留原子批量提交语义。 */
function createDriver(sqlite) {
  return {
    open: async () => {},
    query: async (sql) => sqlite.prepare(sql).all(),
    executeBatch: async (statements) => {
      sqlite.exec('BEGIN TRANSACTION')
      try {
        statements.forEach((statement) => sqlite.exec(statement))
        sqlite.exec('COMMIT')
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  }
}

/** 使用项目已有 schema 启动 App 数据库适配器。 */
function createDatabase(driver, legacyStorage = null) {
  return sqliteModule.createSqliteDatabase(driver, schemaModule.schemaSqlList, legacyStorage)
}

/** 新安装仅建立后端命名的业务表，不建立已经淘汰的合并组表。 */
test('physical SQLite tables use backend names without obsolete merge tables', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  const names = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name))
  for (const name of ['qcm_inspection_plan', 'qcm_inspection_report', 'qcm_inspection_item_result', 'qcm_inspection_defect_record']) {
    assert.ok(names.has(name), `missing ${name}`)
  }
  for (const name of ['inspection_plan', 'report', 'item_result', 'defect', 'report_group', 'report_member', 'checklist']) {
    assert.ok(!names.has(name), `obsolete ${name}`)
  }
  sqlite.close()
})

/** 服务端结果 ID 是唯一主键，模板 ID 仅保存在原始 JSON 中；子项只在录入后产生。 */
test('stores downloaded result ids unchanged and updates the same child row', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const reports = createReportRepository(database)
  const source = viewModel.normalizeInspectionDetail({
    plan: { id: 'child', parentPlanId: 'parent', mergeType: 2 }, report: { id: 'report', planId: 'parent' },
    inspectionPlans: [{ id: 'parent' }, { id: 'child' }],
    itemResults: [{ id: 'result-1', standardItemId: 'template-1', itemType: 'Standard' }]
  }, 'child')
  await reports.saveDetailSnapshot('child', source)
  assert.deepEqual(sqlite.prepare('SELECT itemResultId FROM qcm_inspection_item_result').all().map((row) => row.itemResultId), ['result-1'])
  assert.equal((await reports.getPlanById('child')).itemResults[0].standardItemId, 'template-1')
  const edited = viewModel.updateChecklistItem(source, 'result-1__child', { result: 'fail', comment: '子项异常' })
  await createInspectionDetailService({ reportRepository: reports, viewModel }).saveDraft('child', edited, { changes: { itemIds: ['result-1__child'] } })
  assert.deepEqual(sqlite.prepare('SELECT itemResultId FROM qcm_inspection_item_result ORDER BY itemResultId').all().map((row) => row.itemResultId), ['result-1', 'result-1_child'])
  assert.equal(JSON.parse(sqlite.prepare("SELECT jsonData FROM qcm_inspection_item_result WHERE itemResultId = 'result-1_child'").get().jsonData).remarks, '子项异常')
  sqlite.close()
})

/** 重启后只存 fileId 的下载图片仍能从 JSON 还原，并随页面草稿一起生成提交数据。 */
test('restores file-id-only report photos and submits current checklist edits', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const reports = createReportRepository(database)
  await reports.saveDetailSnapshot('plan', viewModel.normalizeInspectionDetail({
    plan: { id: 'plan' }, report: { id: 'report' },
    standardItems: [{ id: 'section', children: [{ id: 'result', standardItemId: 'template' }] }],
    itemResults: [{ id: 'result', standardItemId: 'template', fileList: [{ fileId: 'file-1', filePath: '/remote.jpg' }] }]
  }, 'plan'))
  const reopened = createDatabase(driver)
  await reopened.open()
  const restored = viewModel.normalizeInspectionDetail(await createReportRepository(reopened).getPlanById('plan'), 'plan')
  assert.equal(restored.checklistData.result.photos[0].fileId, 'file-1')
  assert.equal(restored.checklistData.result.photos[0].localPath, undefined)
  const edited = viewModel.updateChecklistItem(restored, 'result', { comment: '页面备注' })
  const payload = viewModel.buildGeneratePayload(edited)
  assert.equal(payload.itemResults[0].remarks, '页面备注')
  assert.equal(payload.itemResults[0].fileList[0].fileId, 'file-1')
  sqlite.close()
})

/** 已安装版本的复合键迁成真实 ID，不丢失 jsonData 内的草稿及历史清单占位。 */
test('migrates legacy result keys while retaining draft and checklist markers', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await database.transaction(async (transaction) => {
    transaction.upsert('item_result', 'itemResultId', { itemResultId: 'parent::result-1', planId: 'parent', jsonData: JSON.stringify({ id: 'result-1', standardItemId: 'template-1', localData: { comment: '草稿' } }) })
    transaction.upsert('item_result', 'itemResultId', { itemResultId: 'parent::checklist::legacy', planId: 'parent', jsonData: JSON.stringify({ checklistItem: { id: 'legacy' } }) })
  })
  const reopened = createDatabase(driver)
  await reopened.open()
  const rows = sqlite.prepare('SELECT itemResultId, jsonData FROM qcm_inspection_item_result ORDER BY itemResultId').all()
  assert.deepEqual(rows.map((row) => row.itemResultId), ['parent::checklist::legacy', 'result-1'])
  assert.equal(JSON.parse(rows[1].jsonData).localData.comment, '草稿')
  sqlite.close()
})

/** 检查项局部保存跨数据库重启可恢复，且物理 SQLite 只改目标业务行和同步元数据。 */
test('partial item draft persists into its physical SQLite result row', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const reports = createReportRepository(database)
  const detail = viewModel.normalizeInspectionDetail({
    plan: { id: 'plan-1' }, standardItems: [{ id: 'section', children: [{ id: 'one' }, { id: 'two' }] }],
    itemResults: [{ id: 'one' }, { id: 'two' }]
  }, 'plan-1')
  await reports.saveDetailSnapshot('plan-1', detail)
  const previous = sqlite.prepare("SELECT jsonData FROM qcm_inspection_item_result WHERE itemResultId = 'two'").get().jsonData
  const service = createInspectionDetailService({ reportRepository: reports, viewModel })
  await service.saveDraft('plan-1', viewModel.updateChecklistItem(detail, 'one', { comment: '已检查' }), { changes: { itemIds: ['one'] } })
  assert.equal(sqlite.prepare("SELECT jsonData FROM qcm_inspection_item_result WHERE itemResultId = 'two'").get().jsonData, previous)
  const reopened = createDatabase(driver)
  await reopened.open()
  assert.equal((await createReportRepository(reopened).getPlanById('plan-1')).checklistData.one.comment, '已检查')
  sqlite.close()
})

/** 本地诊断按计划只读取一条检查点结果，不组装所有报告，也不混入清单定义行。 */
test('reads itemResults one row at a time for a merged child plan', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'child', groupPlanId: 'parent' })
    for (const itemId of ['one', 'two', 'three']) {
      transaction.upsert('item_result', 'itemResultId', {
        itemResultId: `parent::${itemId}`, planId: 'parent', jsonData: JSON.stringify({ id: itemId, remarks: itemId })
      })
    }
    transaction.upsert('item_result', 'itemResultId', {
      itemResultId: 'parent::checklist::one', planId: 'parent', jsonData: '{"checklistItem":{"id":"one"}}'
    })
  })
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const reports = createReportRepository({
    query: (sql) => database.query(sql),
    snapshot: () => { throw new Error('must not assemble all reports') }
  })
  const page = await reports.getStoredItemResultPage('child', 1)
  assert.equal(page.total, 3)
  assert.deepEqual(page.itemResult, { id: 'three', remarks: 'three' })
  assert.deepEqual((await reports.getStoredItemResultPage('child', 3)), { total: 3, itemResult: null })
  sqlite.close()
})

/** 旧版单表报告仍可按条检查原始 itemResults，不触发完整详情读取。 */
test('reads every persisted item result JSON for full detail diagnostics', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'child', groupPlanId: 'parent' })
    transaction.upsert('item_result', 'itemResultId', { itemResultId: 'result-1', planId: 'parent',
      jsonData: JSON.stringify({ id: 'result-1', resultStatus: 'APPROVED', remarks: '你好测试\n' }) })
    transaction.upsert('item_result', 'itemResultId', { itemResultId: 'parent::checklist::one', planId: 'parent',
      jsonData: '{"checklistItem":{"id":"one"}}' })
  })
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const reports = createReportRepository({ query: (sql) => database.query(sql) })
  assert.deepEqual(await reports.getStoredItemResultRows('child'), [{ itemResultId: 'result-1',
    jsonData: { id: 'result-1', resultStatus: 'APPROVED', remarks: '你好测试\n' } }])
  sqlite.close()
})

/** 旧版单表报告仍可按条检查原始 itemResults，不触发完整详情读取。 */
test('reads legacy report itemResults without assembling all plans', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  await database.transaction(async (transaction) => transaction.upsert('report', 'reportId', {
    reportId: 'legacy', jsonData: JSON.stringify({ itemResults: [{ id: 'old-one' }, { id: 'old-two' }] })
  }))
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const reports = createReportRepository({ query: (sql) => database.query(sql) })
  assert.deepEqual(await reports.getStoredItemResultPage('legacy', 1), { total: 2, itemResult: { id: 'old-two' } })
  sqlite.close()
})

/** 合并子检查点只有录入内容后才生成结果行；空草稿和重置不得留下额外 itemResults。 */
test('persists only filled merged child item results', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const reports = createReportRepository(database)
  const plans = ['parent', 'child-a', 'child-b'].map((id) => ({ id, parentPlanId: 'parent', mergeType: 2 }))
  const source = {
    report: { id: 'report-1', planId: 'parent' }, inspectionPlans: plans,
    itemResults: [{ id: 'section' }, { id: 'check-1', parentItemId: 'section', standardItemId: 'standard-1' }],
    standardItems: [{ id: 'section', children: [{ id: 'check-1', standardItemId: 'standard-1' }] }],
    checklistData: {
      'check-1': { result: 'pass' },
      'check-1__child-a': { result: '', measurements: [{ value: '' }] },
      'check-1__child-b': { result: '', comment: '' }
    }
  }
  await reports.savePlans(plans.map((plan) => ({ ...source, plan, planId: plan.id })))
  const storedIds = () => sqlite.prepare("SELECT itemResultId FROM qcm_inspection_item_result WHERE instr(itemResultId, '::checklist::') = 0 ORDER BY itemResultId").all().map((row) => row.itemResultId)
  assert.deepEqual(storedIds(), ['check-1', 'section'])

  const service = createInspectionDetailService({ reportRepository: reports, viewModel })
  let detail = viewModel.normalizeInspectionDetail(await reports.getPlanById('parent'), 'parent')

  await reports.saveDetailSnapshot('parent', viewModel.normalizeInspectionDetail(detail, 'parent'))
  assert.deepEqual(storedIds(), ['check-1', 'section'])
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM qcm_inspection_item_result WHERE itemResultId LIKE '%::checklist::%'").get().total, 0)
  detail = viewModel.updateChecklistItem(detail, 'check-1__child-a', { result: 'fail' })
  await service.saveDraft('parent', detail, { changes: { itemIds: ['check-1__child-a'] } })
  assert.deepEqual(storedIds(), ['check-1', 'check-1_child-a', 'section'])

  await reports.saveDetailSnapshot('parent', viewModel.normalizeInspectionDetail(detail, 'parent'))
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM qcm_inspection_item_result WHERE itemResultId LIKE '%::checklist::%'").get().total, 0)

  detail = viewModel.updateChecklistItem(detail, 'check-1__child-a', { result: '', measurements: [] })
  await service.saveDraft('parent', detail, { changes: { itemIds: ['check-1__child-a'] } })
  assert.deepEqual(storedIds(), ['check-1', 'section'])
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM qcm_inspection_item_result WHERE itemResultId = 'parent::checklist::check-1__child-a'").get().total, 0)
  await reports.saveDetailSnapshot('parent', detail)
  assert.deepEqual(storedIds(), ['check-1', 'section'])
  sqlite.close()
})

/** 旧版本误写的空子项可定向移除，原始行和已填写的子项不可受影响。 */
test('prunes only historical empty merged child rows for the current report', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  await database.transaction(async (transaction) => {
    transaction.upsert('inspection_plan', 'planId', { planId: 'child', groupPlanId: 'parent' })
    for (const [id, sonPlanId, data] of [
      ['base', '', { id: 'base', resultStatus: null }],
      ['base_child', 'child', { id: 'base_child', sonPlanId: 'child', localData: { result: 'pass' } }],
      ['other_child', 'child', { id: 'other_child', sonPlanId: 'child', localData: { measurements: [{ value: '' }] } }]
    ]) transaction.upsert('item_result', 'itemResultId', {
      itemResultId: `parent::${id}`, planId: 'parent', sonPlanId, jsonData: JSON.stringify(data)
    })
    transaction.upsert('item_result', 'itemResultId', {
      itemResultId: 'parent::checklist::other__child', planId: 'parent',
      jsonData: JSON.stringify({ checklistItem: { itemId: 'other__child', sonPlanId: 'child', data: { result: '' } } })
    })
    transaction.upsert('item_result', 'itemResultId', {
      itemResultId: 'parent::checklist::base', planId: 'parent',
      jsonData: JSON.stringify({ checklistItem: { itemId: 'base', itemName: '已有结果的检查项' } })
    })
    transaction.upsert('app_setting', 'key', {
      key: 'report_detail:parent', jsonData: JSON.stringify({ standardItems: [{ children: [{ id: 'base' }] }] })
    })
    transaction.upsert('item_result', 'itemResultId', {
      itemResultId: 'unrelated::other_child', planId: 'unrelated', sonPlanId: 'child',
      jsonData: JSON.stringify({ id: 'other_child', localData: { result: '' } })
    })
  })
  const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
  const reports = createReportRepository(database)
  assert.equal(await reports.pruneEmptyChildItemResults('child'), 3)
  assert.deepEqual(sqlite.prepare("SELECT itemResultId FROM qcm_inspection_item_result ORDER BY itemResultId").all().map((row) => row.itemResultId), [
    'parent::base', 'parent::base_child', 'unrelated::other_child'
  ])
  assert.equal((await reports.getStoredItemResultPage('child', 0)).total, 2)
  sqlite.close()
})

/** 已安装版本的组成员和本地图片转入计划关联后，磁盘上彻底删除组表。 */
test('legacy group tables migrate and drop after preserving shared photos', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE report_group (groupId TEXT PRIMARY KEY, parentPlanId TEXT, jsonData TEXT, downloadAt TEXT, status INTEGER, syncStatus TEXT, updatedAt TEXT)')
  sqlite.exec('CREATE TABLE report_member (planId TEXT PRIMARY KEY, groupId TEXT, jsonData TEXT, status INTEGER)')
  const plans = [{ id: 'parent', parentPlanId: 'parent', mergeType: 2 }, { id: 'child', parentPlanId: 'parent', mergeType: 2 }]
  sqlite.prepare('INSERT INTO report_group (groupId, parentPlanId, jsonData, status) VALUES (?, ?, ?, ?)').run('remote-report', 'parent',
    JSON.stringify({ report: { id: 'remote-report', planId: 'parent' }, inspectionPlans: plans,
      itemResults: [{ id: 'check', planId: 'parent' }], checklistData: { check: { result: 'pass' } }, syncStatus: 'SYNCED' }), 1)
  for (const plan of plans) sqlite.prepare('INSERT INTO report_member (planId, groupId, jsonData, status) VALUES (?, ?, ?, ?)').run(
    plan.id, 'remote-report', JSON.stringify({ plan, planId: plan.id }), 1)
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await database.transaction(async (transaction) => transaction.upsert('photo', 'photoId', {
    photoId: 'remote-report::p1', sourcePhotoId: 'p1', reportId: 'remote-report', localPath: '/offline/p1.jpg', uploadStatus: 'pending'
  }))
  const repository = (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(database)
  await repository.migrateLegacyMergedReports()
  const names = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name))
  assert.ok(!names.has('report_group') && !names.has('report_member'))
  const reopened = createDatabase(driver)
  await reopened.open()
  assert.equal((await (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(reopened).getPlanById('child')).itemResults.length, 1)
  assert.equal(reopened.readTable('photo')[0].localPath, '/offline/p1.jpg')
  sqlite.close()
})

/** 老清单表的离线检查状态迁入检查项 JSON，删除旧表后仍可离线读取。 */
test('legacy checklist rows move into item results before dropping their table', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE checklist (itemId TEXT PRIMARY KEY, sourceItemId TEXT, reportId TEXT, sortNo INTEGER, jsonData TEXT)')
  sqlite.prepare('INSERT INTO checklist (itemId, sourceItemId, reportId, sortNo, jsonData) VALUES (?, ?, ?, ?, ?)').run(
    'plan-1::item-1', 'item-1', 'plan-1', 0, JSON.stringify({ itemId: 'item-1', data: { result: 'fail', photos: [{ localPath: '/offline/a.jpg' }] } }))
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(database).migrateLegacyMergedReports()
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'checklist'").get().count, 0)
  const reopened = createDatabase(driver)
  await reopened.open()
  const items = await (await loadUtsModule('repositories/checklistRepository.uts')).createChecklistRepository(reopened).listByReportId('plan-1')
  assert.equal(items[0].data.result, 'fail')
  assert.equal(items[0].data.photos[0].localPath, '/offline/a.jpg')
  sqlite.close()
})

test('SQLite persists report and photo rows across runtime restarts without uniStorage writes', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const first = createDatabase(driver)
  await first.open()
  await first.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'plan-1', jsonData: '{"planId":"plan-1"}' })
    transaction.upsert('photo', 'photoId', { photoId: 'plan-1::p1', reportId: 'plan-1', localPath: '/documents/1.jpg' })
  })
  const reopened = createDatabase(driver)
  await reopened.open()
  assert.equal(reopened.readTable('report')[0].reportId, 'plan-1')
  assert.equal(reopened.readTable('photo')[0].localPath, '/documents/1.jpg')
  sqlite.close()
})

/** 整组合并下载保存两条计划入口，更新任一入口后重新打开仍读取同一份报告内容。 */
test('merged download shares report edits across SQLite plan entries after reopening', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const first = createDatabase(driver)
  await first.open()
  const reports = reportModule.createReportRepository(first)
  const inspectionPlans = [
    { id: 'plan-1', parentPlanId: 'merged-1', mergeType: 2, goodsName: '产品一' },
    { id: 'plan-2', parentPlanId: 'merged-1', mergeType: 2, goodsName: '产品二' }
  ]
  await reports.savePlans(inspectionPlans.map((plan) => ({
    planId: plan.id, plan, inspectionPlans, report: { id: 'report-merged' },
    checklistData: { 'item-1': { result: '' } }
  })))
  const edited = { ...await reports.getPlanById('plan-2'), checklistData: { 'item-1': { result: 'fail' } }, checklistItems: [], defects: [], photos: [] }
  await reports.saveDetailSnapshot('plan-2', edited)
  const reopened = createDatabase(driver)
  await reopened.open()
  const sibling = await reportModule.createReportRepository(reopened).getPlanById('plan-1')
  assert.equal(sibling.plan.id, 'plan-1')
  assert.equal(sibling.report.id, 'report-merged')
  assert.equal(sibling.checklistData['item-1'].result, 'fail')
  const localDownloads = await reportModule.createReportRepository(reopened).listStoredInspectionPlanRows()
  assert.equal(localDownloads.length, 2)
  assert.deepEqual(localDownloads.map((row) => row.data.id), ['plan-1', 'plan-2'])
  assert.equal(localDownloads[1].data.groupPlanId, 'merged-1')
  assert.equal(reopened.readTable('report').length, 1)
  assert.equal(reopened.readTable('inspection_plan').length, 2)
  assert.equal(reopened.readTable('report_group').length, 0)
  sqlite.close()
})

/** 旧版 SQLite 两份合并报告升级后只存一份共享检查结果，照片路径保留并可离线重启读取。 */
test('legacy merged SQLite reports migrate into a shared group without losing photos', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const original = createDatabase(driver)
  await original.open()
  const inspectionPlans = [
    { id: 'parent-1', parentPlanId: 'parent-1', mergeType: 2, status: 1 },
    { id: 'child-1', parentPlanId: 'parent-1', mergeType: 2, status: 1 }
  ]
  await original.transaction(async (transaction) => {
    for (const plan of inspectionPlans) transaction.upsert('report', 'reportId', {
      reportId: plan.id, status: 1, jsonData: JSON.stringify({
        planId: plan.id, plan, inspectionPlans, report: { id: 'report-1', planId: 'parent-1' },
        itemResults: [{ id: 'check-1', sonPlanId: 'child-1' }],
        standardItems: [{ id: 'check-1' }], syncStatus: 'SYNCED'
      })
    })
    transaction.upsert('photo', 'photoId', {
      photoId: 'child-1::photo-1', sourcePhotoId: 'photo-1', reportId: 'child-1',
      localPath: '/offline/photo.jpg', uploadStatus: 'pending',
      jsonData: JSON.stringify({ photoId: 'photo-1', localPath: '/offline/photo.jpg', uploadStatus: 'pending' })
    })
  })
  const upgraded = createDatabase(driver)
  await upgraded.open()
  const reports = reportModule.createReportRepository(upgraded)
  await reports.migrateLegacyMergedReports()
  const reopened = createDatabase(driver)
  await reopened.open()
  const restored = reportModule.createReportRepository(reopened)
  const photos = photoModule.createPhotoRepository(reopened)
  assert.equal(reopened.readTable('report').length, 1)
  assert.equal(reopened.readTable('inspection_plan').length, 2)
  assert.equal(reopened.readTable('report_group').length, 0)
  assert.deepEqual((await restored.getPlanById('parent-1')).itemResults, (await restored.getPlanById('child-1')).itemResults)
  assert.equal((await photos.listByReportId('parent-1'))[0].localPath, '/offline/photo.jpg')
  assert.equal((await photos.listByReportId('child-1')).length, 1)
  sqlite.close()
})

/** 已安装旧版没有 report.planId 列时，启动自动补列并迁移共享结果。 */
test('SQLite upgrades an existing report table before loading relational rows', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE report (reportId TEXT PRIMARY KEY, jsonData TEXT, status INTEGER)')
  sqlite.prepare('INSERT INTO report (reportId, jsonData, status) VALUES (?, ?, ?)').run('single-1',
    JSON.stringify({ planId: 'single-1', plan: { id: 'single-1' }, report: { id: 'r1', planId: 'single-1' },
      itemResults: [{ id: 'check-1', planId: 'single-1' }] }), 1)
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  assert.ok(sqlite.prepare('PRAGMA table_info(qcm_inspection_report)').all().some((column) => column.name === 'planId'))
  const repository = (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(database)
  await repository.migrateLegacyMergedReports()
  assert.equal(database.readTable('inspection_plan')[0].planId, 'single-1')
  assert.equal(database.readTable('item_result')[0].planId, 'single-1')
  sqlite.close()
})

/** 旧结构化行的业务 JSON 升级后应分列，草稿与本地照片仍可跨进程恢复。 */
test('v3 business JSON migrates to columns without losing offline draft and photo', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE inspection_plan (planId TEXT PRIMARY KEY, parentPlanId TEXT, groupPlanId TEXT NOT NULL, status INTEGER, jsonData TEXT)')
  sqlite.exec('CREATE TABLE defect (defectId TEXT PRIMARY KEY, sourceDefectId TEXT, reportId TEXT, itemId TEXT, defectType TEXT, "desc" TEXT, photoPaths TEXT, sortNo INTEGER, jsonData TEXT, createAt TEXT)')
  sqlite.prepare('INSERT INTO inspection_plan (planId, parentPlanId, groupPlanId, status, jsonData) VALUES (?, ?, ?, ?, ?)').run(
    'child', 'parent', 'parent', 1, JSON.stringify({ plan: { id: 'child', parentPlanId: 'parent', mergeType: 2, factoryName: '旧工厂', finishQuantity: 12 }, listCard: { id: 'child' } }))
  sqlite.prepare('INSERT INTO defect (defectId, sourceDefectId, reportId, jsonData) VALUES (?, ?, ?, ?)').run(
    'parent::defect', 'defect', 'parent', JSON.stringify({ id: 'defect', defectLevel: 'MINOR', defectDesc: '旧疵点', photos: [{ localPath: '/offline/1.jpg' }] }))
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await database.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'parent', planId: 'parent', status: 1,
      jsonData: JSON.stringify({ report: { id: 'remote-1', planId: 'parent', overallResult: 'PENDING' },
        syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent', finishFlag: 0 } }) })
    transaction.upsert('item_result', 'itemResultId', { itemResultId: 'parent::item', planId: 'parent', jsonData: JSON.stringify({ id: 'item', localData: { result: 'fail' } }) })
    transaction.upsert('photo', 'photoId', { photoId: 'parent::p1', reportId: 'parent', localPath: '/offline/1.jpg', uploadStatus: 'pending' })
  })
  const repository = (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(database)
  await repository.migrateLegacyMergedReports()
  const reopened = createDatabase(driver)
  await reopened.open()
  const restored = (await loadUtsModule('repositories/reportRepository.uts')).createReportRepository(reopened)
  assert.equal(reopened.readTable('inspection_plan')[0].factory_name, '旧工厂')
  assert.equal(reopened.readTable('report')[0].overall_result, 'PENDING')
  assert.equal(reopened.readTable('defect')[0].defect_desc, '旧疵点')
  assert.equal(JSON.parse(reopened.readTable('inspection_plan')[0].jsonData).plan?.factoryName, undefined)
  assert.equal(JSON.parse(reopened.readTable('report')[0].jsonData).report, undefined)
  assert.equal(JSON.parse(reopened.readTable('defect')[0].jsonData).defectDesc, undefined)
  assert.equal((await restored.getPlanById('child')).plan.factoryName, '旧工厂')
  assert.equal((await restored.getPlanById('child')).pendingSyncPayload.planId, 'parent')
  assert.equal(reopened.readTable('photo')[0].uploadStatus, 'pending')
  assert.equal(reopened.readTable('photo')[0].localPath, '/offline/1.jpg')
  assert.ok(sqlite.prepare('PRAGMA table_info(qcm_inspection_plan)').all().some((column) => column.name === 'parent_plan_id'))
  assert.ok(sqlite.prepare('PRAGMA table_info(qcm_inspection_defect_record)').all().some((column) => column.name === 'defect_desc'))
  sqlite.close()
})

test('concurrent report and photo transactions serialize without losing either write', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const database = createDatabase(createDriver(sqlite))
  await database.open()
  await Promise.all([
    database.transaction(async (transaction) => {
      transaction.upsert('report', 'reportId', { reportId: 'plan-1' })
      await Promise.resolve()
    }),
    database.transaction(async (transaction) => {
      transaction.upsert('photo', 'photoId', { photoId: 'plan-1::p1', reportId: 'plan-1' })
    })
  ])
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('photo').length, 1)
  sqlite.close()
})

test('legacy uniStorage rows migrate once without overwriting existing SQLite records', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const existing = createDatabase(driver)
  await existing.open()
  await existing.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'plan-1', productName: 'SQLite 新草稿' })
  })
  let removed = false
  const legacyStorage = {
    read: () => ({ report: [{ reportId: 'plan-1', productName: '旧草稿' }], photo: [{ photoId: 'plan-1::p1', reportId: 'plan-1', localPath: '/documents/1.jpg' }] }),
    remove: () => { removed = true }
  }
  const migrated = createDatabase(driver, legacyStorage)
  await migrated.open()
  assert.equal(migrated.readTable('report')[0].productName, 'SQLite 新草稿')
  assert.equal(migrated.readTable('photo').length, 1)
  assert.equal(removed, true)
  sqlite.close()
})

test('failed SQLite write leaves the in-memory view unchanged', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await assert.rejects(database.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'plan-1', impossibleColumn: 'bad' })
  }))
  assert.equal(database.readTable('report').length, 0)
  sqlite.close()
})

test('SQLite preserves full login session fields after reopening', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const userModule = await loadUtsModule('repositories/userRepository.uts')
  const first = createDatabase(driver)
  await first.open()
  await userModule.createUserRepository(first).saveSession({
    userId: 'inspector-1', userName: 'inspector', token: 'token', realName: '验货员', roles: ['inspector'], permissions: ['inspect:write']
  })
  const reopened = createDatabase(driver)
  await reopened.open()
  const session = await userModule.createUserRepository(reopened).getLastSession()
  assert.equal(session.realName, '验货员')
  assert.deepEqual(session.permissions, ['inspect:write'])
  sqlite.close()
})

test('SQLite persists offline catalog and preferences migrated from legacy storage', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  let removed = false
  const first = createDatabase(driver, {
    read: () => ({ app_setting: [{ key: 'qcm_language', jsonData: '"vi"' }] }),
    remove: () => { removed = true }
  })
  await first.open()
  const settingsModule = await loadUtsModule('repositories/appSettingsRepository.uts')
  const settings = settingsModule.createAppSettingsRepository(first)
  await settings.set('qcm_defect_catalog', { tree: [{ id: 'level-1' }], levels: [] })
  const reopened = createDatabase(driver)
  await reopened.open()
  const recovered = settingsModule.createAppSettingsRepository(reopened)
  assert.equal(recovered.get('qcm_language'), 'vi')
  assert.equal(recovered.get('qcm_defect_catalog').tree[0].id, 'level-1')
  assert.equal(removed, true)
  sqlite.close()
})

test('SQLite recovers two thousand photo metadata rows and exposes immutable snapshots', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const database = createDatabase(driver)
  await database.open()
  await database.transaction(async (transaction) => {
    for (let index = 0; index < 2000; index++) {
      transaction.upsert('photo', 'photoId', {
        photoId: `plan-1::${index}`, reportId: 'plan-1', localPath: `/documents/inspection_media/${index}.jpg`, uploadStatus: 'pending'
      })
    }
  })
  const reopened = createDatabase(driver)
  await reopened.open()
  const snapshot = reopened.snapshot()
  assert.equal(snapshot.photo.length, 2000)
  snapshot.photo[0].localPath = '/modified.jpg'
  assert.notEqual(reopened.readTable('photo')[0].localPath, '/modified.jpg')
  sqlite.close()
})

test('reopened detail recovers a photo captured before a stale draft save', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const serviceModule = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const first = createDatabase(driver)
  await first.open()
  const reports = reportModule.createReportRepository(first)
  const photos = photoModule.createPhotoRepository(first)
  const stale = {
    plan: { id: 'plan-1', goodsName: '产品一' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistData: { 'item-1': { photos: [] } }, checklistItems: [], defects: [], photos: []
  }
  await reports.saveDetailSnapshot('plan-1', stale)
  await photos.save('plan-1', { photoId: 'captured-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/documents/inspection_media/one.jpg', uploadStatus: 'pending' })
  await reports.saveDetailSnapshot('plan-1', stale)
  const reopened = createDatabase(driver)
  await reopened.open()
  const service = serviceModule.createInspectionDetailService({
    reportRepository: reportModule.createReportRepository(reopened),
    listPhotos: (planId) => photoModule.createPhotoRepository(reopened).listByReportId(planId),
    planApi: { getPlanDetail: async () => assert.fail('complete local detail must not fetch remote') },
    isOnline: async () => false,
    viewModel
  })
  const detail = await service.loadDetail('plan-1')
  assert.equal(detail.checklistData['item-1'].photos[0].photoId, 'captured-1')
  assert.equal(detail.photos[0].uploadStatus, 'pending')
  sqlite.close()
})

/** 旧下载详情的服务端检查点图片未单独拆表时，新拍图片和重新保存均不得覆盖原图。 */
test('downloaded checkpoint photos coexist with new local photos after saving and reopening SQLite', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const serviceModule = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const database = createDatabase(driver)
  await database.open()
  const reports = reportModule.createReportRepository(database)
  const photos = photoModule.createPhotoRepository(database)
  await reports.savePlans([{
    planId: 'plan-1',
    plan: { id: 'plan-1', goodsName: '产品一' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外箱' }] }],
    itemResults: [{ id: 'item-1', fileList: [{ fileId: 'remote-1', filePath: '/remote/original.jpg' }] }]
  }])
  await photos.save('plan-1', { photoId: 'local-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/new.jpg', uploadStatus: 'pending' })
  const service = serviceModule.createInspectionDetailService({
    reportRepository: reports,
    listPhotos: (planId) => photos.listByReportId(planId),
    planApi: { getPlanDetail: async () => assert.fail('downloaded detail should stay local') },
    isOnline: async () => false,
    viewModel
  })
  const detail = await service.loadDetail('plan-1')
  assert.deepEqual(detail.checklistData['item-1'].photos.map((photo) => photo.photoId), ['remote-1', 'local-1'])
  await service.saveDraft('plan-1', detail, { markDirty: true })

  const reopened = createDatabase(driver)
  await reopened.open()
  const restored = await reportModule.createReportRepository(reopened).getPlanById('plan-1')
  assert.deepEqual(restored.checklistData['item-1'].photos.map((photo) => photo.photoId), ['remote-1', 'local-1'])
  assert.deepEqual(reopened.readTable('photo').map((row) => row.sourcePhotoId).sort(), ['local-1', 'remote-1'])
  sqlite.close()
})

/** 未下载的线上详情首次打开写入 SQLite，重启数据库并离线再次打开时不得请求接口。 */
test('remote detail is persisted to SQLite and reopened offline without another request', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const serviceModule = await loadUtsModule('services/inspectionDetailService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  const database = createDatabase(driver)
  await database.open()
  let remoteCalls = 0
  const service = serviceModule.createInspectionDetailService({
    reportRepository: reportModule.createReportRepository(database),
    planApi: { getPlanDetail: async () => {
      remoteCalls += 1
      return {
        plan: { id: 'plan-remote', goodsName: '线上产品', subGoodsNo: 'SKU-1' },
        standardItems: [{ id: 'section-1', itemName: '外观', children: [{ id: 'item-1', itemName: '外箱检查' }] }],
        checklistItems: [{ itemId: 'item-1', itemName: '外箱检查' }],
        defects: [], photos: []
      }
    } },
    isOnline: async () => true,
    viewModel
  })

  const detail = await service.loadDetail('plan-remote')
  assert.equal(detail.plan.goodsName, '线上产品')
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('item_result').filter((row) => JSON.parse(row.jsonData).checklistItem != null).length, 1)
  const reopened = createDatabase(driver)
  await reopened.open()
  const offlineService = serviceModule.createInspectionDetailService({
    reportRepository: reportModule.createReportRepository(reopened),
    planApi: { getPlanDetail: async () => assert.fail('cached detail must not request the server') },
    isOnline: async () => false,
    viewModel
  })
  const cached = await offlineService.loadDetail('plan-remote')
  assert.equal(cached.plan.goodsName, '线上产品')
  assert.equal(cached.checklistItems.length, 1)
  assert.equal(remoteCalls, 1)
  sqlite.close()
})

test('legacy cached photo files are relocated before deleting their old database', async () => {
  const sqlite = new DatabaseSync(':memory:')
  let removed = false
  const database = createDatabase(createDriver(sqlite), {
    read: () => ({ photo: [{ photoId: 'plan-1::p1', reportId: 'plan-1', localPath: '/cache/old.jpg', jsonData: '{"photoId":"p1","localPath":"/cache/old.jpg"}' }] }),
    migratePhoto: async () => '/documents/inspection_media/old.jpg',
    remove: () => { removed = true }
  })
  await database.open()
  const photo = database.readTable('photo')[0]
  assert.equal(photo.localPath, '/documents/inspection_media/old.jpg')
  assert.equal(JSON.parse(photo.jsonData).localPath, photo.localPath)
  assert.equal(removed, true)
  sqlite.close()
})

test('migration failure keeps legacy records available for a later retry', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const driver = createDriver(sqlite)
  const originalExecuteBatch = driver.executeBatch
  driver.executeBatch = async (statements) => {
    if (statements.some((statement) => statement.includes("'plan-1'"))) throw new Error('disk full')
    return originalExecuteBatch(statements)
  }
  let removed = false
  const database = createDatabase(driver, {
    read: () => ({ report: [{ reportId: 'plan-1', jsonData: '{}' }] }),
    remove: () => { removed = true }
  })
  await assert.rejects(database.open(), /disk full/)
  assert.equal(removed, false)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM qcm_inspection_report').get().total, 0)
  sqlite.close()
})
