import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/searchViewModel.uts')

test('builds H5-compatible search params without inspector id', () => {
  const params = viewModel.buildSearchParams('  PO-100  ', {
    status: 'progress',
    inspectType: 'FINAL',
    startDate: '2026-09-01',
    endDate: '2026-09-17'
  })

  assert.equal(params.keyword, 'PO-100')
  assert.equal(params.status, 1)
  assert.equal(params.inspectType, 'FINAL')
  assert.equal(params.startDate, new Date('2026-09-01T00:00:00.000').toISOString())
  assert.equal(params.endDate, new Date('2026-09-17T23:59:59.999').toISOString())
  assert.equal('inspectorId' in params, false)
})

test('omits empty filters and maps report status', () => {
  assert.deepEqual(viewModel.buildSearchParams('ABC', {
    status: 'report',
    inspectType: '',
    startDate: '',
    endDate: ''
  }), {
    keyword: 'ABC',
    status: 3
  })
})

test('local downloaded record fully overrides the same remote plan', () => {
  const remote = [{ id: 'p-1', status: 0, goodsName: 'remote' }, { id: 'p-2' }]
  const local = [{ planId: 'p-1', status: 1, goodsName: 'local', photos: [{ id: 'photo-1' }] }]

  assert.deepEqual(viewModel.mergeRemoteWithLocal(remote, local), [local[0], remote[1]])
})

test('evaluates merge base eligibility and anchor compatibility', () => {
  const anchor = {
    id: 'p-1',
    status: 0,
    lockFlag: 0,
    mergeType: 0,
    inspectType: 'FINAL',
    factoryNo: 'F-1',
    goodsClass: 'SHOES'
  }
  const compatible = { ...anchor, id: 'p-2' }
  const wrongFactory = { ...anchor, id: 'p-3', factoryNo: 'F-2' }
  const locked = { ...anchor, id: 'p-4', lockFlag: 1 }

  assert.equal(viewModel.isBaseMergeEligible(anchor, 'FINAL'), true)
  assert.equal(viewModel.isBaseMergeEligible(locked, 'FINAL'), false)
  assert.equal(viewModel.isMergeSelectable(compatible, 'FINAL', anchor), true)
  assert.equal(viewModel.isMergeSelectable(wrongFactory, 'FINAL', anchor), false)
})

test('deduplicates split preview rows and prefers local versions', () => {
  const remote = [
    { id: 'p-1', parentPlanId: 'merged-1', goodsName: 'remote' },
    { id: 'p-2', parentPlanId: 'merged-1' },
    { id: 'p-3', parentPlanId: 'other' }
  ]
  const local = [{ planId: 'p-1', parentPlanId: 'merged-1', goodsName: 'local' }]

  assert.deepEqual(viewModel.buildSplitPreview(remote, local, 'merged-1'), [local[0], remote[1]])
})

test('extracts operation ids from nested plan shapes', () => {
  assert.equal(viewModel.getPlanOperationId({ plan: { planId: 'nested-1' } }), 'nested-1')
  assert.equal(viewModel.extractCopiedPlanId({ report: { id: 'report-1' } }), 'report-1')
})
