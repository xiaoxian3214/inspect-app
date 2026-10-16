import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const { createMemoryDatabase } = await loadUtsModule('database/memoryDatabase.uts')
const { createSqliteDatabase } = await loadUtsModule('database/sqliteDatabase.uts')
const { schemaSqlList } = await loadUtsModule('database/schema.uts')
const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
const { createPlanListService } = await loadUtsModule('services/planListService.uts')
const planViewModel = await loadUtsModule('domain/planViewModel.uts')
const { createSyncQueueOverviewService } = await loadUtsModule('services/syncQueueOverviewService.uts')
const { isPlanPendingSync } = await loadUtsModule('services/offlineSyncService.uts')

function records() {
  const members = [
    { id: 'parent', parentPlanId: 'parent', mergeType: 2, clientOrderNo: 'PO-1', goodsName: '母款', factoryName: '工厂' },
    { id: 'child', parentPlanId: 'parent', mergeType: 2, clientOrderNo: 'PO-1', goodsName: '子款' }
  ]
  return members.map((plan) => ({
    planId: plan.id, plan, inspectionPlans: members, status: 1,
    report: { id: 'remote-report', planId: 'parent' },
    listCard: { plan: { ...plan, customListField: plan.id } },
    itemResults: [{ id: 'check-1', planId: 'parent' }],
    defectRecords: [{ id: 'defect-1', planId: 'parent' }],
    photos: [{ photoId: 'photo-1', ownerType: 'defect', ownerId: 'defect-1' }],
    syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'parent', finishFlag: 0 }
  }))
}

test('local cards and raw plan rows do not assemble full details', async () => {
  const database = createMemoryDatabase()
  const repository = createReportRepository(database)
  await repository.savePlans(records())
  database.snapshot = () => { throw new Error('full database snapshot is forbidden for list cards') }

  const cards = await repository.listPlanSummaries()
  assert.deepEqual(cards.map((card) => card.plan.goodsName), ['母款', '子款'])
  assert.deepEqual(cards.map((card) => card.plan.customListField), ['parent', 'child'])
  assert.equal(cards[0].reportId, 'remote-report')
  assert.equal(cards[0].syncStatus, 'DIRTY')
  assert.equal(cards[0].pendingSyncPayload.finishFlag, 0)
  assert.equal(cards[0].itemResults, undefined)
  assert.deepEqual((await repository.listStoredInspectionPlanRows()).map((row) => row.planId), ['parent', 'child'])

  const listService = createPlanListService({ reportRepository: repository, planViewModel })
  assert.equal((await listService.getOverview()).total, 2)
  const syncOverview = createSyncQueueOverviewService({
    reportRepository: repository,
    photoRepository: { listPending: async () => [] },
    requestQueueRepository: { listUnfinished: async () => [] },
    isPlanPendingSync
  })
  assert.equal((await syncOverview.getOverview()).pendingDraftCount, 1)
})

test('native SQLite reads list cards with a plan/report JOIN, not child-table scans', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const queries = []
  const driver = {
    open: async () => {},
    query: async (sql) => { queries.push(sql); return sqlite.prepare(sql).all() },
    executeBatch: async (statements) => {
      sqlite.exec('BEGIN TRANSACTION')
      try { statements.forEach((statement) => sqlite.exec(statement)); sqlite.exec('COMMIT') }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
  const database = createSqliteDatabase(driver, schemaSqlList)
  await database.open()
  const repository = createReportRepository(database)
  await repository.savePlans(records())
  queries.length = 0
  database.snapshot = () => { throw new Error('full database snapshot is forbidden for list cards') }

  assert.equal((await repository.listPlanSummaries()).length, 2)
  assert.equal((await repository.listStoredInspectionPlanRows()).length, 2)
  assert.ok(queries.some((sql) => /FROM qcm_inspection_plan\s+\w+\s+LEFT JOIN qcm_inspection_report/i.test(sql)))
  assert.ok(queries.every((sql) => !/FROM qcm_inspection_item_result|FROM qcm_inspection_defect_record|FROM photo/i.test(sql)))
  sqlite.close()
})

test('switching tabs uses the already loaded local cards', async () => {
  const source = await readFile('pages/report/list.uvue', 'utf8')
  const switchTab = source.split(/async function switchTab\(tabKey[^)]*\)/)[1]?.split('\n\t}', 1)[0] ?? ''
  assert.doesNotMatch(switchTab, /refreshLocalList\(\)/)
})
