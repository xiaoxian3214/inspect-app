import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/planDownloadService.uts')
const viewModelModule = await loadUtsModule('domain/planViewModel.uts')

test('downloads, splits, and saves all local plan records', async () => {
  const saved = []
  const service = serviceModule.createPlanDownloadService({
    planApi: {
      downloadPlan: async () => ({
        report: { id: 'report-1' },
        plans: [{ id: 'p-1' }, { id: 'p-2' }]
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

test('does not write local data when the download response is empty', async () => {
  let saveCalled = false
  const service = serviceModule.createPlanDownloadService({
    planApi: { downloadPlan: async () => ({}) },
    reportRepository: { savePlans: async () => { saveCalled = true } },
    planViewModel: viewModelModule
  })

  await assert.rejects(service.downloadToLocal('p-1', {}), /下载数据为空/)
  assert.equal(saveCalled, false)
})

test('supports the inspectionPlans field returned by the H5 download API', async () => {
  const saved = []
  const service = serviceModule.createPlanDownloadService({
    planApi: {
      downloadPlan: async () => ({
        report: { id: 'report-1' },
        inspectionPlans: [{ id: 'p-1' }, { id: 'p-2' }]
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
  const service = serviceModule.createPlanDownloadService({
    planApi: { downloadPlan: async (id) => { requested.push(id); return {
      report: { id: 'report-merged' },
      inspectionPlans: [{ id: 'p-1', parentPlanId: 'parent-1' }, { id: 'p-2', parentPlanId: 'parent-1' }]
    } } },
    reportRepository: { savePlans: async (plans) => saved.push(...plans) },
    planViewModel: viewModelModule
  })
  await service.downloadToLocal('parent-1', { templateId: 't-1' }, ['p-1', 'p-2'])
  assert.deepEqual(requested, ['parent-1'])
  assert.deepEqual(saved.map((plan) => plan.planId), ['p-1', 'p-2'])
  assert.ok(saved.every((plan) => plan.report.id === 'report-merged' && plan.inspectionPlans.length === 2))

  const incomplete = serviceModule.createPlanDownloadService({
    planApi: { downloadPlan: async () => ({ inspectionPlans: [{ id: 'p-1' }] }) },
    reportRepository: { savePlans: async () => assert.fail('must not save partial merged download') },
    planViewModel: viewModelModule
  })
  await assert.rejects(incomplete.downloadToLocal('parent-1', {}, ['p-1', 'p-2']), /合并验货数据不完整/)
})
