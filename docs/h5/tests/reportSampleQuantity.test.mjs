import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getQuantityPlans, getQuantityTotals, patchReadyQuantities, saveReadyQuantities } from '../pages/report/utils/readyQuantity.js'

const first = { id: 'a', mergeType: 2, sampleQuantity: '12' }
const second = { id: 'b', mergeType: 2, sampleQuantity: 8 }
assert.equal(getQuantityTotals(getQuantityPlans({ plan: first, inspectionPlans: [first, second, first] })).sampleQuantity, 20)
assert.equal(getQuantityTotals(getQuantityPlans({ plan: { ...first, mergeType: 1 }, inspectionPlans: [first, second] })).sampleQuantity, 12)
assert.equal(getQuantityTotals([{ sampleQuantity: 0, sampleSize: 30 }, { sampleSize: '5' }, {}]).sampleQuantity, 5)
assert.equal(getQuantityTotals([]).sampleQuantity, 0)

let current = { plan: first, inspectionPlans: [first, second], checklistData: { keep: true }, syncStatus: 'DIRTY' }
await saveReadyQuantities([{ planId: 'a', finishQuantity: 10, originalQuantity: 0 }], async () => ({
  id: 'a', finishQuantity: 10, sampleQuantity: 2, sampleSize: 2, status: 1
}), changes => { current = patchReadyQuantities(current, changes) })
assert.equal(current.plan.sampleQuantity, 2)
assert.equal(current.plan.sampleSize, 2)
assert.equal(current.inspectionPlans[0].sampleQuantity, 2)
assert.equal(getQuantityTotals(getQuantityPlans(current)).sampleQuantity, 10)
assert.deepEqual(current.checklistData, { keep: true })
assert.equal(current.syncStatus, 'DIRTY')
assert.equal(current.plan.status, undefined)
await saveReadyQuantities([{ planId: 'a', finishQuantity: 0, originalQuantity: 10 }], async () => ({
  finishQuantity: 0, sampleQuantity: 0, sampleSize: 0
}), changes => { current = patchReadyQuantities(current, changes) })
assert.equal(current.plan.sampleQuantity, 0)
assert.equal(current.inspectionPlans[0].sampleSize, 0)
assert.equal(getQuantityTotals(getQuantityPlans(current)).sampleQuantity, 8)
await saveReadyQuantities([{ planId: 'a', finishQuantity: 5, originalQuantity: 0 }], async () => undefined,
  changes => { current = patchReadyQuantities(current, changes) })
assert.equal(current.plan.sampleQuantity, 0)

const detail = readFileSync(new URL('../pages/report/detail.vue', import.meta.url), 'utf8')
assert.match(detail, /const localSampleQuantity = computed\(\(\) => finishQuantityTotals\.value\.sampleQuantity\)/)
assert.match(detail, /finishQuantityLoading \? t\('加载中\.\.\.'\) : localSampleQuantity/)
assert.doesNotMatch(detail, /openSampleQuantityDialog|showSampleQuantityDialog|updateSampleQuantity|applySampleQty|showSampleQtyDialog|tempSampleQuantity/)
