import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const domainModule = await loadUtsModule('domain/defectCategoryHistory.uts')

test('normalizes stored rows by dropping invalid entries and backfilling tier3 code', () => {
  const result = domainModule.normalizeRecentCategories([
    { tier1Code: 'A', tier2Code: 'A1', defectCode: 'A1-01', defectDesc: '污渍' },
    { defectCode: 'X-01', defectDesc: '' },
    { defectCode: '', defectDesc: '缺编码' },
    null,
    { tier1Code: 'B', tier2Code: 'B1', tier3Code: 'B1-02', defectCode: 'B1-02', defectDesc: '破洞' }
  ])

  assert.deepEqual(result, [
    { tier1Code: 'A', tier2Code: 'A1', tier3Code: 'A1-01', defectCode: 'A1-01', defectDesc: '污渍' },
    { tier1Code: 'B', tier2Code: 'B1', tier3Code: 'B1-02', defectCode: 'B1-02', defectDesc: '破洞' }
  ])
})

test('caps the normalized history at eight entries', () => {
  const rows = []
  for (let index = 0; index < 12; index += 1) {
    rows.push({ defectCode: `C-${index}`, defectDesc: `疵点${index}` })
  }
  const result = domainModule.normalizeRecentCategories(rows)
  assert.equal(result.length, 8)
  assert.equal(result[0].defectCode, 'C-0')
})

test('pushes a selected category to the head and dedupes by defect code', () => {
  const base = domainModule.normalizeRecentCategories([
    { defectCode: 'A1-01', defectDesc: '污渍' },
    { defectCode: 'B1-02', defectDesc: '破洞' }
  ])

  const result = domainModule.pushRecentCategory(base, {
    tier1Code: 'A', tier2Code: 'A1', tier3Code: 'A1-01', defectCode: 'A1-01', defectDesc: '污渍'
  })

  assert.deepEqual(result.map((item) => item.defectCode), ['A1-01', 'B1-02'])
  assert.equal(result.length, 2)
})

test('ignores pushes without a defect code or description', () => {
  const base = domainModule.normalizeRecentCategories([{ defectCode: 'A1-01', defectDesc: '污渍' }])

  assert.deepEqual(domainModule.pushRecentCategory(base, { defectCode: '', defectDesc: '无编码' }), base)
  assert.deepEqual(domainModule.pushRecentCategory(base, null), base)
  assert.deepEqual(domainModule.pushRecentCategory(base, { defectCode: 'A1-01', defectDesc: '' }), base)
})

test('keeps at most eight entries after pushing', () => {
  const base = domainModule.normalizeRecentCategories(
    Array.from({ length: 8 }, (_, index) => ({ defectCode: `C-${index}`, defectDesc: `疵点${index}` }))
  )

  const result = domainModule.pushRecentCategory(base, { defectCode: 'NEW-1', defectDesc: '新疵点' })

  assert.equal(result.length, 8)
  assert.equal(result[0].defectCode, 'NEW-1')
  assert.equal(result[1].defectCode, 'C-0')
  assert.equal(result[7].defectCode, 'C-6')
})

test('defect category sheet delegates recent history rules to the domain module', async () => {
  const source = await readFile('components/detail/DefectCategorySheet.uvue', 'utf8')

  assert.match(source, /import \{ normalizeRecentCategories, pushRecentCategory \} from '\.\.\/\.\.\/domain\/defectCategoryHistory\.uts'/)
  assert.match(source, /normalizeRecentCategories\(getAppSetting\(RECENT_CATEGORY_KEY\)\)/)
  assert.match(source, /pushRecentCategory\(recentCategories\.value, category\)/)
  assert.match(source, /qcm_recent_defect_categories/)
  assert.match(source, /最近使用/)
  assert.doesNotMatch(source, /uni\.setStorageSync/)
})
