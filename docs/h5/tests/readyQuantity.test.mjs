import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getQuantityPlans, getQuantityTotals, patchReadyQuantities,
  loadReadyQuantityPlans, saveReadyQuantities
} from '../pages/report/utils/readyQuantity.js'

const first = { id: 'a', mergeType: 2, parentPlanId: 'a', requiredQuantity: '100', finishQuantity: 0 }
const second = { id: 'b', mergeType: 2, parentPlanId: 'a', requiredQuantity: '200', finishQuantity: '80' }
const merged = { plan: first, inspectionPlans: [first, second, first] }
assert.deepEqual(getQuantityPlans(merged).map(plan => plan.id), ['a', 'b'])
assert.deepEqual(getQuantityTotals(getQuantityPlans(merged)), { orderQuantity: 300, readyQuantity: 80, sampleQuantity: 0 })
assert.deepEqual(getQuantityTotals(getQuantityPlans({ plan: { ...second, mergeType: 1 }, inspectionPlans: [first, second] })), { orderQuantity: 200, readyQuantity: 80, sampleQuantity: 0 })
assert.deepEqual(getQuantityTotals([{ id: 'c', requiredQuantity: 50 }]), { orderQuantity: 50, readyQuantity: 0, sampleQuantity: 0 })
assert.deepEqual(getQuantityTotals([{ id: 'c', readyQuantity: 12, requiredQuantity: 50 }]), { orderQuantity: 50, readyQuantity: 12, sampleQuantity: 0 })

const source = { ...merged, checklistData: { photo: 'keep' }, syncStatus: 'DIRTY' }
const patched = patchReadyQuantities(source, [{ planId: 'b', finishQuantity: 90 }])
assert.equal(patched.plan.finishQuantity, 0)
assert.equal(patched.inspectionPlans[1].finishQuantity, 90)
assert.equal(patched.checklistData, source.checklistData)
assert.equal(patched.syncStatus, 'DIRTY')
assert.equal(source.inspectionPlans[1].finishQuantity, '80')

const pages = []
const loaded = await loadReadyQuantityPlans({ plan: second }, {
  getPlanDetail: async () => ({ plan: second }),
  searchPlans: async (filter, page) => {
    pages.push([filter, page])
    return { records: page === 1 ? [first] : [second], total: 2 }
  }
})
assert.deepEqual(loaded.map(plan => plan.id), ['a', 'b'])
assert.deepEqual(pages, [[{ parentPlanId: 'a' }, 1], [{ parentPlanId: 'a' }, 2]])
assert.deepEqual(await loadReadyQuantityPlans({ plan: second }, {
  getPlanDetail: async () => ({ plan: first, inspectionPlans: [first, second] }),
  searchPlans: async () => assert.fail('Complete merged details should not need searching')
}), [first, second])
assert.deepEqual(await loadReadyQuantityPlans({ plan: { ...second, mergeType: 1 } }, {
  getPlanDetail: async () => ({ plan: { ...second, mergeType: 1 }, inspectionPlans: [first, second] }),
  searchPlans: async () => assert.fail('Single inspections must not search siblings')
}), [{ ...second, mergeType: 1 }])
await assert.rejects(loadReadyQuantityPlans({ plan: second }, {
  getPlanDetail: async () => { throw new Error('offline') }
}), /offline/)

const calls = []
const updates = []
await saveReadyQuantities([
  { planId: 'a', finishQuantity: '0', originalQuantity: 0 },
  { planId: 'b', finishQuantity: '120', originalQuantity: 80 }
], async (...args) => calls.push(args), changes => updates.push(...changes))
assert.deepEqual(calls, [['b', 120]])
assert.deepEqual(updates, [{ planId: 'b', finishQuantity: 120 }])
for (const invalid of ['', ' ', -1, Infinity, 'abc', 1.5]) {
  await assert.rejects(saveReadyQuantities([
    { planId: 'a', finishQuantity: 10, originalQuantity: 0 },
    { planId: 'b', finishQuantity: invalid, originalQuantity: 80 }
  ], async () => assert.fail('Must validate all rows before saving'), () => {}))
}
const partialUpdates = []
await assert.rejects(saveReadyQuantities([
  { planId: 'a', finishQuantity: 10, originalQuantity: 0 },
  { planId: 'b', finishQuantity: 20, originalQuantity: 80 }
], async (planId) => { if (planId === 'b') throw new Error('save failed') }, changes => partialUpdates.push(...changes)), /save failed/)
assert.deepEqual(partialUpdates, [{ planId: 'a', finishQuantity: 10 }])

const popup = readFileSync(new URL('../pages/report/components/ReadyQuantityPopup.vue', import.meta.url), 'utf8')
assert.match(popup, /emit\('loaded', plans\)/)
assert.ok(popup.indexOf('await savePlanToLocal(') < popup.indexOf('row.originalQuantity = change.finishQuantity'), 'Only mark a row saved after its cache update succeeds')

const card = readFileSync(new URL('../pages/report/components/PlanListItemCard.vue', import.meta.url), 'utf8')
assert.match(card, /复制合并验货[\s\S]*?emitCardAction\('ready-quantity'\)[\s\S]*?设置备货数量/)
assert.match(card, /<ReadyQuantityPopup/)
const detail = readFileSync(new URL('../pages/report/detail.vue', import.meta.url), 'utf8')
assert.match(detail, /<ReadyQuantityPopup/)
assert.match(detail, /finishQuantityTotals\.value\.orderQuantity/)
assert.match(detail, /finishQuantityTotals\.value\.readyQuantity/)
assert.doesNotMatch(detail, /finishQuantity\s*\?\?\s*p\?\.readyQuantity\s*\?\?\s*p\?\.requiredQuantity/)
