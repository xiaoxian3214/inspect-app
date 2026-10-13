import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const apiModule = await loadUtsModule('api/planApi.uts')

test('plan search uses the independent read request lane', async () => {
  const requests = []
  const api = apiModule.createPlanApi({ request: async (options) => {
    requests.push(options)
    return { records: [], total: 0 }
  } })
  await api.searchPlans({ status: 0 })
  assert.equal(requests[0].lane, 'read')
})

/**
 * 创建记录请求并按 URL 返回预设数据的计划 API 测试夹具。
 */
function createFixture(responses = {}) {
  const requests = []
  const api = apiModule.createPlanApi({
    request: async (options) => {
      requests.push(options)
      return responses[options.url]
    }
  })
  return { api, requests }
}

test('loads and normalizes inspect types and checklist templates', async () => {
  const { api, requests } = createFixture({
    '/api/dict/data/code/inspect_type': [
      { dictValue: 'FINAL', dictLabel: '最终验货', sortOrder: 2 },
      { value: 'INLINE', label: '中期验货', sortOrder: 1 }
    ],
    '/api/plans/templates': [
      { templateId: 't-1', templateName: '鞋类清单' },
      { id: 't-1', name: '重复项' },
      { id: 't-2', name: '服装清单' }
    ]
  })

  assert.deepEqual(await api.getInspectTypeDict(), [
    { value: 'INLINE', label: '中期验货', sortOrder: 1 },
    { value: 'FINAL', label: '最终验货', sortOrder: 2 }
  ])
  assert.deepEqual(await api.getPlanTemplates(), [
    { id: 't-1', name: '鞋类清单', raw: { templateId: 't-1', templateName: '鞋类清单' } },
    { id: 't-2', name: '服装清单', raw: { id: 't-2', name: '服装清单' } }
  ])
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[1].method, 'GET')
})

test('uses H5 contracts for merge and split operations', async () => {
  const { api, requests } = createFixture({
    '/api/plans/merge': { id: 'merged-1' },
    '/api/plans/split/merged-1': [{ id: 'p-1' }, { id: 'p-2' }]
  })

  assert.deepEqual(await api.mergePlans(['p-1', 'p-2']), { id: 'merged-1' })
  assert.deepEqual(await api.splitPlan('merged-1'), [{ id: 'p-1' }, { id: 'p-2' }])
  assert.deepEqual(requests[0], {
    url: '/api/plans/merge',
    method: 'POST',
    data: { sourcePlanIds: ['p-1', 'p-2'] },
    key: 'plans:merge:p-1,p-2',
    priority: 60,
    timeout: 60000
  })
  assert.equal(requests[1].url, '/api/plans/split/merged-1')
  assert.equal(requests[1].method, 'POST')
})

test('sends copy query parameters and release delete flag', async () => {
  const { api, requests } = createFixture({
    '/api/plans/source-1/copy': { id: 'copy-1' },
    '/api/reports/generate/release/source-1': { released: true }
  })

  await api.copyPlan('source-1', {
    inspectType: 'FINAL',
    copyFlag: 2,
    templateId: 't-1',
    templateName: '鞋类清单'
  })
  await api.releasePlan('source-1', 0)

  assert.deepEqual(requests[0].query, {
    inspectType: 'FINAL',
    copyFlag: 2,
    templateId: 't-1',
    templateName: '鞋类清单',
    id: 'source-1'
  })
  assert.equal(requests[0].data, null)
  assert.equal(requests[1].url, '/api/reports/generate/release/source-1')
  assert.deepEqual(requests[1].query, { reportDeleteFlag: 0 })
})

test('rejects invalid operation payloads before requesting', async () => {
  const { api, requests } = createFixture()
  await assert.rejects(api.mergePlans(['p-1']), /至少选择两个计划/)
  await assert.rejects(api.splitPlan(''), /计划ID缺失/)
  await assert.rejects(api.copyPlan('p-1', { copyFlag: 1 }), /检查类型缺失/)
  await assert.rejects(api.copyPlan('p-1', { inspectType: 'FINAL', copyFlag: 9 }), /复制类型缺失/)
  assert.equal(requests.length, 0)
})

test('loads plan detail with the same endpoint as H5', async () => {
  const { api, requests } = createFixture({
    '/api/reports/plan/plan%201/detail': { plan: { id: 'plan 1' } }
  })

  assert.deepEqual(await api.getPlanDetail('plan 1'), { plan: { id: 'plan 1' } })
  assert.deepEqual(requests[0], {
    url: '/api/reports/plan/plan%201/detail',
    method: 'GET',
    key: 'reports:plan-detail:plan 1',
    priority: 40
  })
})

test('requires final submission verification before sending finishFlag one', async () => {
  const { api, requests } = createFixture({
    '/api/reports/generate': { reportId: 'report-1' }
  })

  await assert.rejects(
    api.generateReport({ planId: 'plan-1', finishFlag: 1 }),
    /最终提交必须先完成联网和图片上传校验/
  )
  assert.equal(requests.length, 0)

  const result = await api.generateReport(
    { planId: 'plan-1', finishFlag: 1 },
    { finalSubmissionVerified: true }
  )
  assert.deepEqual(result, { reportId: 'report-1' })
  assert.equal(requests.length, 1)
})

test('loads report detail and pending count with H5 endpoints', async () => {
  const { api, requests } = createFixture({
    '/api/reports/report%201/detail': { report: { id: 'report 1' } },
    '/api/plans/pending-count': 6
  })

  assert.deepEqual(await api.getReportDetail('report 1'), { report: { id: 'report 1' } })
  assert.equal(await api.getPendingCount(), 6)
  assert.equal(requests[0].url, '/api/reports/report%201/detail')
  assert.equal(requests[1].url, '/api/plans/pending-count')
})

test('copies checklist data and photos with H5 payloads', async () => {
  const { api, requests } = createFixture({
    '/api/plans/copy-items': { copied: true },
    '/api/plans/copy-photos-to-items': { copied: 2 }
  })

  await api.copyCheckItems({
    sourcePlanId: 'source',
    sourceItemId: 'item-1',
    targetPlanIds: ['target'],
    targetItemIds: ['item-2'],
    copyStatus: true,
    copyRemarks: true
  })
  await api.copyPhotosToItems({
    sourcePlanId: 'source',
    sourceItemId: 'item-1',
    targetPlanIds: ['target'],
    targetItemIds: ['item-2'],
    fileIds: ['file-1']
  })

  assert.deepEqual(requests[0].data, {
    sourcePlanId: 'source',
    sourceItemId: 'item-1',
    targetItemIds: ['item-2'],
    targetPlanIds: ['target'],
    copyPhotos: false,
    copyStatus: true,
    copySpecs: false,
    copyText: false,
    copyBarcode: false,
    copyRemarks: true
  })
  assert.deepEqual(requests[1].data, {
    sourcePlanId: 'source',
    sourceItemId: 'item-1',
    targetPlanIds: ['target'],
    targetItemIds: ['item-2'],
    copyPhotos: true,
    fileIds: ['file-1']
  })
})

test('updates sample quantity and splits shipment by quantity', async () => {
  const { api, requests } = createFixture({
    '/api/plans/plan-1/sample-quantity': { updated: true },
    '/api/plans/plan-1/split-by-quantity': { split: true }
  })

  await api.updateSampleQuantity('plan-1', 12)
  await api.splitByQuantity('plan-1', 5)

  assert.deepEqual(requests[0].query, { sampleQuantity: 12 })
  assert.deepEqual(requests[1].query, { quantity: 5 })
})
