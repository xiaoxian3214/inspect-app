import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const diagnosticModule = await loadUtsModule('domain/localReportDiagnostic.uts')

/** 诊断剪贴板只包含定位离线完整性所需的计数和 ID，不复制大体积报告与照片。 */
test('builds a compact offline detail diagnostic from the stored report row', () => {
  const row = {
    reportId: 'plan-1', status: 1,
    jsonData: JSON.stringify({
      plan: { id: 'plan-1', goodsName: '产品一', clientOrderNo: 'PO-1' },
      report: { id: 'report-1' },
      inspectionPlans: [{ id: 'plan-1' }, { id: 'plan-2' }],
      standardItems: [{ id: 'section-1', children: [{ id: 'item-1' }] }],
      itemResults: [{ id: 'item-1' }],
      checklistItems: [],
      photos: [{ filePath: '/private/very-long-photo.jpg' }]
    })
  }

  const result = JSON.parse(diagnosticModule.buildLocalReportDiagnostic(row))
  assert.equal(result.reportId, 'plan-1')
  assert.equal(result.reportEntityId, 'report-1')
  assert.deepEqual(result.inspectionPlanIds, ['plan-1', 'plan-2'])
  assert.equal(result.standardItemsCount, 1)
  assert.equal(result.checklistLeafCount, 1)
  assert.equal(result.itemResultsCount, 1)
  assert.equal(result.checklistItemsCount, 0)
  assert.equal(result.hasPlanDisplayFields, true)
  assert.equal(result.jsonLength, row.jsonData.length)
  assert.doesNotMatch(JSON.stringify(result), /very-long-photo|产品一|PO-1/)
})

/** 旧记录 JSON 损坏时也能复制可定位的简短错误，而不抛出异常。 */
test('reports invalid stored JSON without failing the diagnostic copy', () => {
  const result = JSON.parse(diagnosticModule.buildLocalReportDiagnostic({ reportId: 'plan-2', jsonData: '{broken' }))
  assert.equal(result.reportId, 'plan-2')
  assert.equal(result.jsonParseError, true)
})
