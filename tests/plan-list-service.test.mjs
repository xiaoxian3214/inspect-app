import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const repositoryModule = await loadUtsModule('repositories/reportRepository.uts')
const serviceModule = await loadUtsModule('services/planListService.uts')
const viewModelModule = await loadUtsModule('domain/planViewModel.uts')

function createService(database, remoteRecords = []) {
  const reportRepository = repositoryModule.createReportRepository(database)
  return serviceModule.createPlanListService({
    reportRepository,
    planApi: {
      searchPlans: async () => ({ records: remoteRecords, total: remoteRecords.length })
    },
    planViewModel: viewModelModule
  })
}

test('loads SQLite reports and keeps local rows over matching remote rows', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [{
      reportId: 'p-1',
      orderNo: 'PO-1',
      productName: '本地产品',
      status: 0,
      downloadAt: '2026-09-16T08:00:00.000Z',
      jsonData: JSON.stringify({ plan: { id: 'p-1', clientOrderNo: 'PO-1', goodsName: '本地产品' } })
    }]
  })
  const service = createService(database, [
    { planId: 'p-1', status: 0, plan: { clientOrderNo: 'PO-1', goodsName: '远端旧数据' } },
    { planId: 'p-2', status: 0, plan: { clientOrderNo: 'PO-2', goodsName: '远端产品' } }
  ])

  const result = await service.loadList({ tabKey: 'planned', online: true, page: 1, pageSize: 100 })

  assert.deepEqual(result.items.map((item) => item.planId), ['p-1', 'p-2'])
  assert.equal(result.items[0].plan.goodsName, '本地产品')
  assert.equal(result.total, 2)
})

test('builds H5-compatible local summaries with database field fallbacks', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [{
      reportId: 'p-1',
      orderNo: 'PO-FALLBACK',
      productName: '本地产品回填',
      status: 1,
      downloadAt: '2026-09-17T08:00:00.000Z',
      jsonData: JSON.stringify({
        progress: 25,
        plan: { id: 'p-1', factoryName: '本地供应商', inspectType: '最终验货' }
      })
    }]
  })
  const repository = repositoryModule.createReportRepository(database)

  const summaries = await repository.listPlanSummaries()

  assert.equal(summaries[0].plan.clientOrderNo, 'PO-FALLBACK')
  assert.equal(summaries[0].plan.goodsName, '本地产品回填')
  assert.equal(summaries[0].plan.factoryName, '本地供应商')
  assert.equal(summaries[0].progress, 25)
})

test('lists every persisted report row with its original SQLite JSON regardless of status', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [
      { reportId: 'planned', status: 0, downloadAt: '2026-10-08', jsonData: '{"plan":{"id":"planned"}}' },
      { reportId: 'progress', status: 1, jsonData: '{"checklistData":{"item":"已检查"}}' },
      { reportId: 'done', status: 3, jsonData: '{"report":{"id":"remote-report"}}' }
    ]
  })
  const repository = repositoryModule.createReportRepository(database)

  const rows = await repository.listStoredReportRows()

  assert.deepEqual(rows.map((row) => row.reportId), ['planned', 'progress', 'done'])
  assert.equal(rows[1].jsonData, '{"checklistData":{"item":"已检查"}}')
  rows[0].reportId = 'changed'
  assert.equal(database.readTable('report')[0].reportId, 'planned')
})

test('filters each tab using H5 status rules', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [
      { reportId: 'planned', status: 0, jsonData: '{}' },
      { reportId: 'progress', status: 2, jsonData: '{}' },
      { reportId: 'done', status: 3, jsonData: '{}' }
    ]
  })
  const service = createService(database)

  assert.deepEqual((await service.loadList({ tabKey: 'planned', online: false })).items.map((item) => item.planId), ['planned'])
  assert.deepEqual((await service.loadList({ tabKey: 'progress', online: false })).items.map((item) => item.planId), ['progress'])
  assert.deepEqual((await service.loadList({ tabKey: 'report', online: false })).items.map((item) => item.planId), ['done'])
})

test('provides local counts for the home page and list badges', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [
      { reportId: 'a', status: 0, jsonData: '{}' },
      { reportId: 'b', status: 1, jsonData: '{}' },
      { reportId: 'c', status: 2, jsonData: '{}' },
      { reportId: 'd', status: 3, jsonData: '{}' }
    ]
  })
  const service = createService(database)

  assert.deepEqual(await service.getLocalCounts(), {
    planned: 1,
    progress: 2,
    report: 1
  })
})

test('provides local overview for offline list and login surfaces', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [
      {
        reportId: 'planned',
        status: 0,
        downloadAt: '2026-09-17T08:00:00.000Z',
        jsonData: JSON.stringify({
          plan: { id: 'planned', clientOrderNo: 'PO-1' },
          pendingSyncPayload: { id: 'payload-1' }
        })
      },
      {
        reportId: 'progress',
        status: 1,
        downloadAt: '2026-09-17T10:00:00.000Z',
        jsonData: JSON.stringify({
          plan: { id: 'progress', clientOrderNo: 'PO-2' },
          syncStatus: 'DIRTY'
        })
      },
      {
        reportId: 'done',
        status: 3,
        downloadAt: '2026-09-16T09:00:00.000Z',
        jsonData: JSON.stringify({
          plan: { id: 'done', clientOrderNo: 'PO-3' }
        })
      }
    ]
  })
  const service = createService(database)

  assert.deepEqual(await service.getOverview(), {
    planned: 1,
    progress: 1,
    report: 1,
    total: 3,
    pendingSyncCount: 1,
    latestDownloadedAt: '2026-09-17T10:00:00.000Z'
  })
})

test('excludes completed reports and merged child plans from pending sync count', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [
      {
        reportId: 'done',
        status: 3,
        jsonData: JSON.stringify({
          syncStatus: 'DIRTY',
          pendingSyncPayload: { status: 3 }
        })
      },
      {
        reportId: 'child',
        status: 1,
        jsonData: JSON.stringify({
          syncStatus: 'DIRTY',
          pendingSyncPayload: { planId: 'child' },
          plan: { id: 'child', mergeType: 2, parentPlanId: 'parent' }
        })
      },
      {
        reportId: 'parent',
        status: 1,
        jsonData: JSON.stringify({
          syncStatus: 'DIRTY',
          pendingSyncPayload: { planId: 'parent' },
          plan: { id: 'parent', mergeType: 2, parentPlanId: 'parent' }
        })
      }
    ]
  })
  const service = createService(database)

  const overview = await service.getOverview()

  assert.equal(overview.pendingSyncCount, 1)
})
