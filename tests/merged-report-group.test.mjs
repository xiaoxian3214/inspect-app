import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { createMemoryDatabase } = await loadUtsModule('database/memoryDatabase.uts')
const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')

/** 构造同一报告组的成员和含子检查点的共享检查结果。 */
function mergedRecords() {
  const inspectionPlans = [
    { id: 'parent-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '主货品', status: 1 },
    { id: 'child-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '子货品', status: 1 }
  ]
  return inspectionPlans.map((plan) => ({
    id: plan.id, planId: plan.id, plan, inspectionPlans,
    report: { id: 'report-1', planId: 'parent-1' },
    standardItems: [{ id: 'section-1', children: [{ id: 'check-1', itemName: '外观' }] }],
    itemResults: [{ id: 'check-1' }, { id: 'check-1_child-1', sonPlanId: 'child-1' }],
    checklistData: { 'check-1': { photos: [] }, 'check-1__child-1': { result: 'pass' } },
    status: 1, syncStatus: 'SYNCED'
  }))
}

test('merged download stores one shared report and two lightweight members', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())

  assert.equal(database.readTable('inspection_plan').length, 2)
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('item_result').length, 2)
  assert.equal(JSON.stringify(database.readTable('inspection_plan')).includes('itemResults'), false)
  const parent = await repository.getPlanById('parent-1')
  const child = await repository.getPlanById('child-1')
  assert.deepEqual(child.itemResults, parent.itemResults)
  assert.deepEqual(child.checklistData, parent.checklistData)
  assert.equal(parent.plan.goodsName, '主货品')
  assert.equal(child.plan.goodsName, '子货品')
})

/** 同组仅重新保存一个成员时，报告和已有成员的状态仍须一致。 */
test('saving one merged member updates the status of every stored group member', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())

  const updatedChild = { ...mergedRecords()[1], status: 3, plan: { ...mergedRecords()[1].plan, status: 3 } }
  await repository.savePlans([updatedChild])

  assert.equal(database.readTable('report')[0].status, 3)
  assert.deepEqual(database.readTable('inspection_plan').map((row) => row.status), [3, 3])
  assert.deepEqual((await repository.listPlans()).map((plan) => plan.status), [3, 3])
})

/** 合并验货最终提交后共享报告和全部成员一起进入报告页签。 */
test('completed merged snapshot marks every local member as reported', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  const detail = await repository.getPlanById('parent-1')
  await repository.saveDetailSnapshot('parent-1', {
    ...detail, status: 3, plan: { ...detail.plan, status: 3 },
    inspectionPlans: detail.inspectionPlans.map((plan) => ({ ...plan, status: 3 })),
    syncStatus: 'SYNCED', pendingSyncPayload: null
  })
  assert.deepEqual((await repository.listPlans()).map((plan) => plan.status), [3, 3])
  assert.equal(database.readTable('report')[0].status, 3)
})

/** 非合并验货提交后只有当前计划进入报告页签。 */
test('completed ordinary snapshot marks only its own local plan as reported', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords().map((record, index) => ({
    ...record, id: `single-${index}`, planId: `single-${index}`,
    plan: { ...record.plan, id: `single-${index}`, parentPlanId: '', mergeType: 0 },
    report: { id: `report-${index}`, planId: `single-${index}` },
    inspectionPlans: [], standardItems: [], itemResults: [], checklistData: {}
  })))
  const detail = await repository.getPlanById('single-0')
  await repository.saveDetailSnapshot('single-0', { ...detail, status: 3, plan: { ...detail.plan, status: 3 } })
  assert.deepEqual((await repository.listPlans()).map((plan) => plan.status), [3, 1])
})

test('shared report owns one photo and one upload queue across member entries', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  const photos = createPhotoRepository(database)
  await repository.savePlans(mergedRecords())

  await photos.save('child-1', { photoId: 'p-1', ownerType: 'checklist', ownerId: 'check-1', localPath: '/local/1.jpg', uploadStatus: 'pending' })
  assert.equal((await photos.listByReportId('parent-1'))[0].localPath, '/local/1.jpg')
  assert.equal((await photos.listByReportId('child-1'))[0].localPath, '/local/1.jpg')
  assert.deepEqual(await photos.listPendingReportIds(), ['parent-1'])
  await photos.save('parent-1', { photoId: 'p-1', uploadStatus: 'retry_wait' })
  assert.equal(database.readTable('photo').length, 1)
  await photos.remove('child-1', 'p-1')
  assert.deepEqual(await photos.listByReportId('parent-1'), [])
})

test('editing from any member updates one shared checklist and group status', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  const child = await repository.getPlanById('child-1')
  await repository.saveDetailSnapshot('child-1', {
    ...child, status: 1,
    checklistData: { ...child.checklistData, 'check-1': { result: 'fail', photos: [] } },
    checklistItems: [], defects: [], photos: []
  })

  assert.equal((await repository.getPlanById('parent-1')).checklistData['check-1'].result, 'fail')
  assert.equal((await repository.getPlanById('child-1')).checklistData['check-1'].result, 'fail')
  assert.equal(database.readTable('inspection_plan').length, 2)
  assert.equal(database.readTable('report').length, 1)
  assert.deepEqual((await repository.listPlans()).map((plan) => plan.status), [1, 1])
})

/** 子计划的局部结果保存仍落共享父计划行，且不会复制整组报告。 */
test('partial child edit updates only the shared item result', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  const child = await repository.getPlanById('child-1')
  const edited = {
    ...child, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent-1', finishFlag: '0' },
    checklistData: { ...child.checklistData, 'check-1__child-1': { result: 'fail', comment: '子计划问题' } }
  }
  await repository.saveDraftChanges('child-1', edited, { itemIds: ['check-1__child-1'] })
  assert.equal((await repository.getPlanById('parent-1')).checklistData['check-1__child-1'].comment, '子计划问题')
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('item_result').filter((row) => row.itemResultId === 'check-1_child-1').length, 1)
})

test('migrates downloaded merged drafts and pending photos without losing local paths', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const records = mergedRecords()
  const [parent, child] = records
  await database.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'parent-1', jsonData: JSON.stringify(parent), status: 1 })
    transaction.upsert('report', 'reportId', { reportId: 'child-1', jsonData: JSON.stringify({
      ...child, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent-1', finishFlag: 0 },
      checklistData: { 'check-1': { result: 'fail' } }, updatedAt: '2026-10-10T09:00:00Z'
    }), status: 1 })
    transaction.upsert('photo', 'photoId', {
      photoId: 'child-1::photo-1', sourcePhotoId: 'photo-1', reportId: 'child-1',
      localPath: '/local/keep.jpg', uploadStatus: 'pending',
      jsonData: JSON.stringify({ photoId: 'photo-1', localPath: '/local/keep.jpg', uploadStatus: 'pending' })
    })
  })

  await repository.migrateLegacyMergedReports()

  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('report_group').length, 0)
  assert.equal((await repository.getPlanById('parent-1')).checklistData['check-1'].result, 'fail')
  assert.equal((await repository.getPlanById('child-1')).syncStatus, 'DIRTY')
  assert.equal(database.readTable('photo')[0].reportId, 'parent-1')
  assert.equal(database.readTable('photo')[0].localPath, '/local/keep.jpg')
  await repository.migrateLegacyMergedReports()
  assert.equal(database.readTable('photo').length, 1)
})

test('drafts edited through a child synchronize once using the current plan id', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
  const { createOfflineSyncService } = await loadUtsModule('services/offlineSyncService.uts')
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  await repository.savePlans(mergedRecords())
  const detail = createInspectionDetailService({ reportRepository: repository, viewModel, isOnline: async () => false })
  await detail.saveDraft('child-1', await detail.loadDetail('child-1'))
  assert.equal((await repository.getPlanById('parent-1')).pendingSyncPayload.planId, 'child-1')
  const generated = []
  const sync = createOfflineSyncService({
    reportRepository: repository,
    planApi: { generateReport: async (payload) => { generated.push(payload); return { id: 'report-1' } } }
  })
  const result = await sync.syncPendingPlans()
  assert.equal(result.pendingCount, 1)
  assert.equal(generated.length, 1)
  assert.equal((await repository.getPlanById('parent-1')).syncStatus, 'SYNCED')
  assert.equal((await repository.getPlanById('child-1')).syncStatus, 'SYNCED')
})

test('finalizing one shared report atomically reports every member', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  const child = await repository.getPlanById('child-1')
  await repository.saveDetailSnapshot('child-1', {
    ...child, status: 3, syncStatus: 'SYNCED', pendingSyncPayload: null,
    plan: { ...child.plan, status: 3 },
    inspectionPlans: child.inspectionPlans.map((plan) => ({ ...plan, status: 3 })),
    checklistItems: [], defects: [], photos: []
  })
  assert.deepEqual((await repository.listPlans()).map((plan) => plan.status), [3, 3])
  assert.ok((await repository.listPlans()).every((plan) => plan.inspectionPlans.every((member) => member.status === 3)))
  assert.equal(database.readTable('report')[0].status, 3)
  assert.deepEqual(database.readTable('inspection_plan').map((member) => member.status), [3, 3])
  assert.equal(database.readTable('report').length, 1)
})

/** 单成员卡片字段更新不得重建旧报告或改变整组共享检查数据。 */
test('saving a merged member updates only its metadata without duplicating the report', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  const child = await repository.getPlanById('child-1')
  await repository.savePlan({ ...child, plan: { ...child.plan, finishQuantity: 12 } })
  assert.equal(database.readTable('report').length, 1)
  assert.equal((await repository.getPlanById('child-1')).plan.finishQuantity, 12)
  assert.deepEqual((await repository.getPlanById('parent-1')).itemResults, child.itemResults)
})

/** 逐成员释放只在最后一个入口移除时销毁共享报告及其照片。 */
test('removing merged members retains shared data until the last member is removed', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  await database.transaction(async (transaction) => transaction.upsert('photo', 'photoId', {
    photoId: 'parent-1::p1', sourcePhotoId: 'p1', reportId: 'parent-1', localPath: '/local/p1.jpg'
  }))
  await repository.removePlansByIds(['child-1'])
  assert.equal(database.readTable('inspection_plan').length, 1)
  assert.equal(database.readTable('report').length, 1)
  assert.equal(database.readTable('photo').length, 1)
  await repository.removePlansByIds(['parent-1'])
  assert.equal(database.readTable('inspection_plan').length, 0)
  assert.equal(database.readTable('report').length, 0)
  assert.equal(database.readTable('photo').length, 0)
})

/** 清空离线记录时须同时清理报告组与轻量成员索引。 */
test('clearing plans removes merged groups and entries', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(mergedRecords())
  await repository.clearPlans()
  assert.equal((await repository.listPlans()).length, 0)
  assert.equal(database.readTable('inspection_plan').length, 0)
  assert.equal(database.readTable('item_result').length, 0)
})

/** 成员入口批量写图仍须落在共享报告下，不能产生两条独立上传任务。 */
test('bulk photo replacement uses one group-owned row for either member', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  const photos = createPhotoRepository(database)
  await repository.savePlans(mergedRecords())
  await photos.saveAll('child-1', [{ photoId: 'p1', localPath: '/local/p1.jpg', uploadStatus: 'pending' }])
  assert.equal(database.readTable('photo')[0].reportId, 'parent-1')
  assert.equal((await photos.listByReportId('parent-1')).length, 1)
  assert.deepEqual(await photos.listPendingReportIds(), ['parent-1'])
})

test('final report payload from a child uses the H5 plan id and keeps nested checkpoints', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  const viewModel = await loadUtsModule('domain/detailViewModel.uts')
  await repository.savePlans(mergedRecords())
  const detail = viewModel.normalizeInspectionDetail(await repository.getPlanById('child-1'), 'child-1')
  const payload = viewModel.buildGeneratePayload(detail)
  assert.equal(payload.planId, 'child-1')
  assert.ok(payload.itemResults.every((row) => row.planId === 'child-1'))
  assert.equal(payload.itemResults.some((row) => row.sonPlanId === 'child-1'), true)
})
