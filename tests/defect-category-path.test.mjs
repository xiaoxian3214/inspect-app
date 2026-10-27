import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const path = await loadUtsModule('domain/defectCategoryPath.uts')

/** 三级分类树样例：两级中间层 + 三级叶子。 */
const TREE = [
  {
    code: 'A', name: '外观', status: '0', isLeaf: false, children: [
      { code: 'A1', name: '表面', status: '0', isLeaf: false, children: [
        { code: 'A1-01', name: '污渍', status: '0', isLeaf: true, children: [] },
        { code: 'A1-02', name: '色差', status: '1', isLeaf: true, children: [] }
      ] },
      { code: 'A2', name: '印刷', status: '0', isLeaf: false, children: [
        { code: 'A2-01', name: '重影', status: '0', isLeaf: true, children: [] }
      ] }
    ]
  },
  {
    code: 'B', name: '结构', status: '0', isLeaf: false, children: [
      { code: 'B1', name: '缝合', status: '0', isLeaf: false, children: [
        { code: 'B1-01', name: '破洞', status: '0', isLeaf: true, children: [] }
      ] }
    ]
  }
]

test('resolves the full path from a stored tier3 code when tier1/tier2 are missing', () => {
  const result = path.resolveDefectCategoryPath(TREE, { tier3Code: 'A1-01', defectCode: '', defectDesc: '' })
  assert.deepEqual(result, {
    tier1Code: 'A', tier1Name: '外观',
    tier2Code: 'A1', tier2Name: '表面',
    tier3Code: 'A1-01', tier3Name: '污渍'
  })
})

test('prefers the explicit defect code over tier3 code', () => {
  const result = path.resolveDefectCategoryPath(TREE, { tier3Code: 'A1-01', defectCode: 'B1-01', defectDesc: '' })
  assert.deepEqual(result, {
    tier1Code: 'B', tier1Name: '结构',
    tier2Code: 'B1', tier2Name: '缝合',
    tier3Code: 'B1-01', tier3Name: '破洞'
  })
})

test('falls back to stored description when the leaf is not in the tree', () => {
  const result = path.resolveDefectCategoryPath(TREE, { tier3Code: 'Z-99', defectCode: '', defectDesc: '历史疵点' })
  assert.deepEqual(result, {
    tier1Code: '', tier1Name: '',
    tier2Code: '', tier2Name: '',
    tier3Code: 'Z-99', tier3Name: '历史疵点'
  })
})

test('keeps disabled ancestors usable so an edit can still restore the full path', () => {
  const result = path.resolveDefectCategoryPath(TREE, { tier3Code: 'A1-02', defectCode: '', defectDesc: '色差' })
  assert.deepEqual(result, {
    tier1Code: 'A', tier1Name: '外观',
    tier2Code: 'A1', tier2Name: '表面',
    tier3Code: 'A1-02', tier3Name: '色差'
  })
})

test('returns empty path when nothing is stored', () => {
  const result = path.resolveDefectCategoryPath(TREE, { tier3Code: '', defectCode: '', defectDesc: '' })
  assert.equal(result.tier1Code, '')
  assert.equal(result.tier3Code, '')
  assert.equal(result.tier3Name, '')
})

test('builds the breadcrumb text from resolved names', () => {
  const resolved = path.resolveDefectCategoryPath(TREE, { tier3Code: 'A1-01', defectCode: '', defectDesc: '' })
  assert.equal(path.buildCategoryBreadcrumb(resolved), '外观 / 表面 / 污渍')
})

test('breadcrumb falls back to the stored description for unknown codes', () => {
  const resolved = path.resolveDefectCategoryPath(TREE, { tier3Code: 'Z-99', defectCode: '', defectDesc: '历史疵点' })
  assert.equal(path.buildCategoryBreadcrumb(resolved), '历史疵点')
})
