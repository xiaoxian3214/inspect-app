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
  assert.equal(reopened.readTable('report').length, 2)
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
  assert.equal(database.readTable('checklist').length, 1)
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
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM report').get().total, 0)
  sqlite.close()
})
