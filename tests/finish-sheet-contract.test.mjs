import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('finish sheet offers H5 APPROVED REJECTED PENDING result options', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes(`value: 'APPROVED'`))
  assert.ok(source.includes(`value: 'REJECTED'`))
  assert.ok(source.includes(`value: 'PENDING'`))
  assert.ok(!source.includes(`value: 'PASS'`))
  assert.ok(!source.includes(`value: 'FAIL'`))
})

test('finish sheet limits remarks to the H5 3000 character cap', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes('maxlength'))
  assert.ok(source.includes('3000'))
})

test('finish sheet renders AQL defect stats and failed checkpoints with exceed highlight', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes('defect-stats') || source.includes('defectStats'))
  assert.ok(source.includes('failed-checkpoints') || source.includes('failedCheckpoints'))
  assert.ok(source.includes('exceed'))
  assert.ok(source.includes('疵点数量超出AQL允许最大值'))
})

test('detail page wires finish summary props and H5 overall result values', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes('buildFinishSummary'))
  assert.ok(source.includes('normalizeOverallResult'))
  assert.ok(source.includes('defect-stats') || source.includes(':defect-stats'))
  assert.ok(source.includes('exceeds-aql'))
  assert.ok(source.includes('failed-checkpoints'))
  assert.ok(!source.includes(`value: 'PASS'`))
})

test('detail page confirms missing mandatory data before blocking final submit', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes('强制性数据缺失'))
  assert.ok(source.includes('有的检查项目要求必须有相关信息或图片'))
})
