import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const diagnosticModule = await loadUtsModule('domain/localReportDiagnostic.uts')

/** 本地报告按详情接口的 data 字段顺序展示，结果状态和备注直接来自落库结果。 */
test('builds an API-shaped local detail without inventing a network response', () => {
  const itemResults = [{ id: 'result-1', standardItemId: 'template-1', resultStatus: 'APPROVED', remarks: '你好测试\n', fileList: [{ fileId: 'file-1' }] }]
  const stored = { report: { id: 'report-1' }, inspectionPlans: [{ id: 'plan-1' }], itemResults,
    defectRecords: [{ id: 'defect-1' }], totalItems: 1, passedItems: 1, failedItems: 0,
    template: null, standardItems: null, criticalCount: 0, majorCount: 0, minorCount: 0, totalDefects: 1,
    checklistData: { 'result-1': { result: 'pass' } }, syncStatus: 'DIRTY' }
  const response = diagnosticModule.buildLocalDetailResponse(stored)
  assert.deepEqual(Object.keys(response), ['data'])
  assert.deepEqual(Object.keys(response.data), [
    'report', 'itemResults', 'defectRecords', 'inspectionPlans', 'totalItems', 'passedItems',
    'failedItems', 'template', 'standardItems', 'criticalCount', 'majorCount', 'minorCount', 'totalDefects'
  ])
  assert.deepEqual(response.data.itemResults, itemResults)
  assert.deepEqual(response.data.defectRecords, stored.defectRecords)
  assert.equal(response.data.standardItems, null)
  assert.equal(response.data.itemResults[0].remarks, '你好测试\n')
  assert.equal(response.data.checklistData, undefined)
})

/** 旧记录只有 defects 时也按详情接口的 defectRecords 字段展示。 */
test('maps legacy local defects into detail response', () => {
  assert.deepEqual(diagnosticModule.buildLocalDetailResponse({ defects: [{ id: 'd-1' }] }).data.defectRecords, [{ id: 'd-1' }])
})

/** 离线编辑后的结果以检查点和疵点行计算，不能沿用下载时的过期统计。 */
test('uses current local result rows for response totals', () => {
  const response = diagnosticModule.buildLocalDetailResponse({
    itemResults: [{ id: 'one', resultStatus: 'APPROVED' }, { id: 'two', resultStatus: 'REJECTED' }],
    defectRecords: [{ id: 'defect' }], totalItems: 9, passedItems: 9, failedItems: 0, totalDefects: 0
  })
  assert.deepEqual([response.data.totalItems, response.data.passedItems, response.data.failedItems, response.data.totalDefects], [2, 1, 1, 1])
})

/** 完整诊断同时保留 SQLite 原始结果、页面详情及检查点实际绑定值。 */
test('builds a full local detail snapshot that exposes result status and visible state together', () => {
  const rawRows = [{ itemResultId: 'result-1', jsonData: { id: 'result-1', standardItemId: 'template-1', resultStatus: 'APPROVED', remarks: '你好测试\n' } }]
  const stored = { itemResults: [rawRows[0].jsonData] }
  const visible = { standardItems: [{ children: [{ id: 'result-1' }] }], checklistItems: [{ itemId: 'result-1' }],
    checklistData: { 'result-1': { result: 'pass', comment: '你好测试\n' } }, photos: [{ fileId: 'photo-1' }] }
  const snapshot = diagnosticModule.buildLocalDetailDebugSnapshot(stored, visible, rawRows)
  assert.equal(snapshot.resultBindings[0].resultStatus, 'APPROVED')
  assert.equal(snapshot.resultBindings[0].visibleResult, 'pass')
  assert.equal(snapshot.resultBindings[0].visibleComment, '你好测试\n')
  assert.equal(snapshot.resultBindings[0].treeItemId, 'result-1')
  assert.deepEqual(snapshot.sqliteItemResultRows, rawRows)
  assert.deepEqual(snapshot.pageDetail.photos, visible.photos)
  assert.deepEqual(snapshot.sqliteDetail, stored)
})

/** 大详情按字符段渲染以避免原生 text 一次创建过多节点，复制仍使用完整 JSON。 */
test('paginates the full diagnostic without dropping any content', () => {
  const source = '0123456789ABCDEF'
  const pages = [0, 1, 2, 3].map((index) => diagnosticModule.getLocalDetailDebugPage(source, index, 5))
  assert.equal(pages[0].total, 4)
  assert.equal(pages.map((page) => page.contentText).join(''), source)
  assert.equal(diagnosticModule.getLocalDetailDebugPage(source, 99, 5).currentIndex, 3)
})

/** 无模板 ID 的未关联结果不能误匹配树上的第一个检查点。 */
test('marks an unmatched result without inventing a checklist binding', () => {
  const snapshot = diagnosticModule.buildLocalDetailDebugSnapshot({}, {
    standardItems: [{ children: [{ id: 'other' }] }], checklistData: {}
  }, [{ itemResultId: 'result', jsonData: { id: 'result', resultStatus: 'APPROVED' } }])
  assert.equal(snapshot.resultBindings[0].treeItemId, '')
  assert.equal(snapshot.resultBindings[0].visibleResult, null)
})

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

/** 组装后的本地详情也能生成精简诊断，不依赖旧报告行的 jsonData。 */
test('diagnoses a relational local download detail', () => {
  const row = { reportId: 'parent', status: 1, data: { report: { id: 'remote-1' },
    inspectionPlans: [{ id: 'parent', goodsName: '产品' }, { id: 'child' }],
    itemResults: [{ id: 'check' }], defectRecords: [{ id: 'defect' }], standardItems: [] } }
  const result = JSON.parse(diagnosticModule.buildLocalReportDiagnostic(row))
  assert.deepEqual(result.inspectionPlanIds, ['parent', 'child'])
  assert.equal(result.reportEntityId, 'remote-1')
  assert.equal(result.itemResultsCount, 1)
  assert.equal(result.defectRecordsCount, 1)
  assert.equal(result.jsonParseError, false)
})

/** 计划原始行诊断应标出成员计划而不是把组 ID 当成单条计划。 */
test('diagnoses an original inspection plan SQLite row', () => {
  const result = JSON.parse(diagnosticModule.buildLocalReportDiagnostic({
    planId: 'child', reportId: 'parent', status: 1,
    data: { planId: 'child', id: 'child', groupPlanId: 'parent', goods_name: '子款', parent_plan_id: 'parent' }
  }))
  assert.equal(result.planId, 'child')
  assert.deepEqual(result.inspectionPlanIds, ['child'])
  assert.equal(result.hasPlanDisplayFields, true)
  assert.equal(result.jsonParseError, false)
})
