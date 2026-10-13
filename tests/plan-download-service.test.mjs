import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/planDownloadService.uts')
const viewModelModule = await loadUtsModule('domain/planViewModel.uts')
const detailViewModel = await loadUtsModule('domain/detailViewModel.uts')
const detailServiceModule = await loadUtsModule('services/inspectionDetailService.uts')
const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const repositoryModule = await loadUtsModule('repositories/reportRepository.uts')
const offlineChecklist = [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }]

/** 为下载测试注入真实完整性判定，并阻止测试意外通过详情接口补数据。 */
function createTestDownloadService(options) {
  const planApi = {
    getPlanDetail: async () => assert.fail('下载不应请求详情接口'),
    ...options.planApi
  }
  return serviceModule.createPlanDownloadService({ ...options, planApi, detailViewModel })
}

/** 禁止绕过详情完整性校验创建下载服务，避免测试或新入口保存空壳报告。 */
test('requires a detail completeness policy when constructing the downloader', () => {
  assert.throws(() => serviceModule.createPlanDownloadService({ planApi: {}, reportRepository: {}, planViewModel: viewModelModule }), /详情完整性/)
})

test('downloads, splits, and saves all local plan records', async () => {
  const saved = []
  const service = createTestDownloadService({
    planApi: {
      downloadPlan: async () => ({
        report: { id: 'report-1' },
        plans: [{ id: 'p-1', goodsName: '产品一' }, { id: 'p-2', goodsName: '产品二' }],
        standardItems: offlineChecklist
      })
    },
    reportRepository: {
      savePlans: async (plans) => saved.push(...plans)
    },
    planViewModel: viewModelModule
  })

  const result = await service.downloadToLocal('p-1', { templateId: 'template-1' })

  assert.equal(result.length, 2)
  assert.deepEqual(saved.map((item) => item.planId), ['p-1', 'p-2'])
  assert.equal(saved[0].status, 0)
})

/** 下载接口省略卡片信息时，将下载前的计划展示字段保存到 SQLite。 */
test('persists original card fields when the download response omits them', async () => {
  const saved = []
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1', status: 0 }], standardItems: offlineChecklist }) },
    reportRepository: { savePlans: async (plans) => saved.push(...plans) },
    planViewModel: viewModelModule
  })

  await service.downloadToLocal('p-1', { templateId: 't-1' }, [], [{ plan: {
    id: 'p-1', goodsName: '原产品', subGoodsNo: 'SKU-1', clientOrderNo: 'PO-1', factoryName: '原供应商'
  } }])

  assert.equal(saved[0].plan.goodsName, '原产品')
  assert.equal(saved[0].plan.subGoodsNo, 'SKU-1')
  assert.equal(saved[0].plan.clientOrderNo, 'PO-1')
  assert.equal(saved[0].plan.factoryName, '原供应商')
  assert.equal(saved[0].plan.status, 0)
})

/** 远程卡片的嵌套 ID 与实际计划 ID 不同时，重登仍能从下载记录还原展示字段。 */
test('matches downloaded plan by planId rather than a different nested id', async () => {
  const saved = []
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1' }], standardItems: offlineChecklist }) },
    reportRepository: { savePlans: async (plans) => saved.push(...plans) },
    planViewModel: viewModelModule
  })

  await service.downloadToLocal('p-1', {}, [], [{
    planId: 'p-1', supplierName: '工厂甲',
    plan: { id: 'report-1', planId: 'p-1', goodsName: '产品一', inspectType: 'FINAL', domeNo: '合同甲' }
  }])

  assert.equal(saved[0].plan.factoryName, '工厂甲')
  assert.equal(saved[0].plan.inspectType, 'FINAL')
  assert.equal(saved[0].plan.domeNo, '合同甲')
})

/** 下载落库并重新读取后，工厂、验货类型和采购合同仍可在列表卡片显示。 */
test('keeps card fields in local summaries after reopening the repository', async () => {
  const database = memoryModule.createMemoryDatabase()
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1' }], standardItems: offlineChecklist }) },
    reportRepository: repositoryModule.createReportRepository(database),
    planViewModel: viewModelModule
  })

  await service.downloadToLocal('p-1', {}, [], [{
    planId: 'p-1', supplierName: '工厂甲',
    plan: { id: 'report-1', planId: 'p-1', goodsName: '产品一', inspectType: 'FINAL', inspectTypeName: '最终验货', domeNo: '合同甲' }
  }])

  const [card] = await repositoryModule.createReportRepository(database).listPlanSummaries()
  assert.equal(card.plan.factoryName, '工厂甲')
  assert.equal(card.plan.inspectType, 'FINAL')
  assert.equal(card.plan.inspectTypeName, '最终验货')
  assert.equal(card.plan.domeNo, '合同甲')
})

/** 下载接口仅提供详情时，原列表卡片的全部未知字段也必须在离线重登后保留。 */
test('persists the whole source card for offline listing without overwriting downloaded details', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1', goodsName: '详情产品', status: 0 }], report: { id: 'r-1' }, standardItems: offlineChecklist }) },
    reportRepository: repository,
    planViewModel: viewModelModule
  })
  const sourceCard = {
    planId: 'p-1', supplierName: '列表工厂', planNo: '列表单号', sampleQty: 19, status: 3,
    raw: { factoryNo: 'F-1', arbitraryListField: '保留原始字段' },
    plan: { id: 'p-1', goodsName: '列表产品', factoryNo: 'F-1', deliveryDate: '2026-10-20',
      etd: '2026-11-01', customListField: '自定义卡片字段', requiredQuantity: 100 }
  }

  await service.downloadToLocal('p-1', {}, [], [sourceCard])
  assert.deepEqual(JSON.parse(database.readTable('inspection_plan')[0].jsonData).listCard, sourceCard)
  const reopened = repositoryModule.createReportRepository(database)
  const [card] = await reopened.listPlanSummaries()
  assert.equal(card.supplierName, '列表工厂')
  assert.equal(card.planNo, '列表单号')
  assert.equal(card.sampleQty, 19)
  assert.deepEqual(card.raw, sourceCard.raw)
  assert.equal(card.plan.factoryNo, 'F-1')
  assert.equal(card.plan.deliveryDate, '2026-10-20')
  assert.equal(card.plan.etd, '2026-11-01')
  assert.equal(card.plan.customListField, '自定义卡片字段')
  assert.equal(card.plan.requiredQuantity, 100)
  assert.equal(card.plan.goodsName, '详情产品')
  assert.equal(card.status, 0)
  assert.equal((await reopened.getPlanById('p-1')).plan.goodsName, '详情产品')
})

/** 合并下载时每条成员卡片独立保存，且详情草稿保存不能清除原卡片快照。 */
test('keeps distinct merged member cards after a detail snapshot is saved', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ report: { id: 'r-1' }, inspectionPlans: [{ id: 'p-1', goodsName: '产品一' }, { id: 'p-2', goodsName: '产品二' }], standardItems: offlineChecklist }) },
    reportRepository: repository,
    planViewModel: viewModelModule
  })
  await service.downloadToLocal('parent-1', {}, ['p-1', 'p-2'], [
    { planId: 'p-1', plan: { id: 'p-1', customListField: '成员一' } },
    { planId: 'p-2', plan: { id: 'p-2', customListField: '成员二' } }
  ])
  await repository.saveDetailSnapshot('p-1', { ...await repository.getPlanById('p-1'), status: 1 })

  const cards = await repositoryModule.createReportRepository(database).listPlanSummaries()
  assert.deepEqual(cards.map((card) => card.plan.customListField), ['成员一', '成员二'])
  assert.equal(cards[0].status, 1)
})

/** 合并下载的共享检查结果必须随生成响应完整保存，离线进入不请求详情接口。 */
test('merged download persists renderable details for every member before going offline', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const planApi = {
    downloadPlan: async () => ({
      report: { id: 'report-1' },
      inspectionPlans: [{ id: 'p-1', parentPlanId: 'p-1', mergeType: 2, goodsName: '产品一' }, { id: 'p-2', parentPlanId: 'p-1', mergeType: 2, goodsName: '产品二' }],
      standardItems: null,
      itemResults: [{ id: 'section-1', itemName: '章节' }, { id: 'item-1', parentItemId: 'section-1', itemName: '外观' }]
    }),
    getPlanDetail: async () => assert.fail('下载与离线详情不应请求详情接口')
  }
  const downloader = createTestDownloadService({ planApi, reportRepository: repository, planViewModel: viewModelModule })
  await downloader.downloadToLocal('parent-1', {}, ['p-1', 'p-2'])

  const offlineDetail = detailServiceModule.createInspectionDetailService({
    reportRepository: repositoryModule.createReportRepository(database), planApi,
    isOnline: async () => false, viewModel: detailViewModel
  })
  for (const planId of ['p-1', 'p-2']) {
    const detail = await offlineDetail.loadDetail(planId)
    assert.equal(detail.plan.id, planId)
    assert.equal(detail.checklistItems.length, 1)
  }
})

/** 生成响应缺清单时整组下载失败，不留下无法离线打开的记录。 */
test('rejects incomplete merged details without saving any member', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const downloader = createTestDownloadService({
    planApi: {
      downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1' }, { id: 'p-2' }] }),
      getPlanDetail: async () => assert.fail('不应请求详情接口')
    },
    reportRepository: repository, planViewModel: viewModelModule, detailViewModel
  })

  await assert.rejects(downloader.downloadToLocal('parent-1', {}, ['p-1', 'p-2']), /下载数据不完整/)
  assert.equal(database.readTable('report').length, 0)
})

/** 下载响应已含完整清单时直接落库，不为每个合并成员重复发起详情请求。 */
test('does not refetch merged details when the download already contains the checklist', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const downloader = createTestDownloadService({
    planApi: {
      downloadPlan: async () => ({
        report: { id: 'r-1' },
        inspectionPlans: [{ id: 'p-1', goodsName: '产品一' }, { id: 'p-2', goodsName: '产品二' }],
        standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }]
      }),
      getPlanDetail: async () => assert.fail('完整下载无需重新请求详情')
    },
    reportRepository: repository, planViewModel: viewModelModule, detailViewModel
  })

  await downloader.downloadToLocal('parent-1', {}, ['p-1', 'p-2'])
  assert.equal(database.readTable('report').length, 2)
})

/** 生成接口返回缺失清单时不可再请求详情补丁，也不可留下无法离线打开的下载记录。 */
test('rejects incomplete generation responses without requesting plan details', async () => {
  const database = memoryModule.createMemoryDatabase()
  let detailRequests = 0
  const downloader = createTestDownloadService({
    planApi: {
      downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1', goodsName: '产品一' }] }),
      getPlanDetail: async () => {
        detailRequests += 1
        return { plan: { id: 'p-1', goodsName: '产品一' }, standardItems: [{ children: [{ id: 'item-1' }] }] }
      }
    },
    reportRepository: repositoryModule.createReportRepository(database), planViewModel: viewModelModule
  })

  await assert.rejects(downloader.downloadToLocal('p-1', {}), /下载数据.*不完整/)
  assert.equal(detailRequests, 0)
  assert.equal(database.readTable('report').length, 0)
})

test('does not write local data when the download response is empty', async () => {
  let saveCalled = false
  const service = createTestDownloadService({
    planApi: { downloadPlan: async () => ({}) },
    reportRepository: { savePlans: async () => { saveCalled = true } },
    planViewModel: viewModelModule
  })

  await assert.rejects(service.downloadToLocal('p-1', {}), /下载数据为空/)
  assert.equal(saveCalled, false)
})

test('supports the inspectionPlans field returned by the H5 download API', async () => {
  const saved = []
  const service = createTestDownloadService({
    planApi: {
      downloadPlan: async () => ({
        report: { id: 'report-1' },
        inspectionPlans: [{ id: 'p-1', goodsName: '产品一' }, { id: 'p-2', goodsName: '产品二' }],
        standardItems: offlineChecklist
      })
    },
    reportRepository: {
      savePlans: async (plans) => saved.push(...plans)
    },
    planViewModel: viewModelModule
  })

  const result = await service.downloadToLocal('p-1', { templateId: 'template-1' })

  assert.equal(result.length, 2)
  assert.deepEqual(saved.map((item) => item.planId), ['p-1', 'p-2'])
})

test('merged download saves every member from one response or rejects an incomplete group', async () => {
  const saved = []
  const requested = []
  const service = createTestDownloadService({
    planApi: { downloadPlan: async (id) => { requested.push(id); return {
      report: { id: 'report-merged' },
      inspectionPlans: [{ id: 'p-1', goodsName: '产品一', parentPlanId: 'parent-1' }, { id: 'p-2', goodsName: '产品二', parentPlanId: 'parent-1' }],
      standardItems: offlineChecklist
    } } },
    reportRepository: { savePlans: async (plans) => saved.push(...plans) },
    planViewModel: viewModelModule
  })
  await service.downloadToLocal('parent-1', { templateId: 't-1' }, ['p-1', 'p-2'])
  assert.deepEqual(requested, ['parent-1'])
  assert.deepEqual(saved.map((plan) => plan.planId), ['p-1', 'p-2'])
  assert.ok(saved.every((plan) => plan.report.id === 'report-merged' && plan.inspectionPlans.length === 2))

  const incomplete = createTestDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1' }] }) },
    reportRepository: { savePlans: async () => assert.fail('must not save partial merged download') },
    planViewModel: viewModelModule
  })
  await assert.rejects(incomplete.downloadToLocal('parent-1', {}, ['p-1', 'p-2']), /合并验货数据不完整/)
})
