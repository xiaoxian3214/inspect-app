import assert from 'node:assert/strict'
import fs from 'node:fs'

const planApi = fs.readFileSync('api/plan.js', 'utf8')
const reportService = fs.readFileSync('services/reportService.js', 'utf8')
const detailPage = fs.readFileSync('pages/report/detail.vue', 'utf8')

assert.match(planApi, /prefetchDefectTierTreeCache/, 'downloadPlan should prefetch defect tier tree cache for offline use')
assert.match(planApi, /await\s+prefetchDefectTierTreeCache\s*\(/, 'downloadPlan should wait for cache prefetch after successful download')
assert.match(reportService, /prefetchDefectTierTreeCache/, 'legacy report download should also prefetch defect tier tree cache')
assert.match(detailPage, /loadDefectTierCache/, 'detail page should read shared defect tier cache while offline')
