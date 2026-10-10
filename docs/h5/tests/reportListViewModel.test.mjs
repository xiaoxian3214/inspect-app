import assert from 'node:assert/strict'
import {
  buildLocalPlanIndex,
  buildTabCounts,
  buildDisplayTabCounts,
  buildVisibleGroups,
  getPagedLocalPlans,
  normalizePlanStatus
} from '../pages/report/utils/reportListViewModel.js'

const makePlan = (id, status, orderNo = 'ORD-1') => ({
  planId: id,
  status,
  plan: {
    id,
    clientOrderNo: orderNo,
    factoryName: `Factory ${orderNo}`,
    createDate: '2026-06-01T00:00:00.000Z',
    goodsName: `Product ${id}`
  }
})

assert.equal(normalizePlanStatus({ status: 0 }), 0)
assert.equal(normalizePlanStatus({ status: 2 }), 1)
assert.equal(normalizePlanStatus({ status: 'COMPLETED' }), 3)

const localPlans = [
  makePlan('1', 0, 'A'),
  makePlan('2', 0, 'A'),
  makePlan('3', 1, 'B'),
  makePlan('4', 3, 'C')
]
const remoteMap = {
  planned: [makePlan('2', 0, 'A'), makePlan('5', 0, 'D')],
  progress: [makePlan('6', 1, 'E')],
  report: [makePlan('7', 3, 'F')]
}

const index = buildLocalPlanIndex(localPlans)
assert.equal(index.idSet.has('1'), true)
assert.equal(index.idSet.has('missing'), false)
assert.equal(index.byId.get('2').plan.goodsName, 'Product 2')

const counts = buildTabCounts(localPlans, remoteMap)
assert.deepEqual(counts, { planned: 3, progress: 2, report: 2 })

const displayCounts = buildDisplayTabCounts({
  tabCounts: counts,
  totalMap: { planned: 350, progress: 0, report: 0 }
})
assert.deepEqual(displayCounts, { planned: 350, progress: 2, report: 2 })

assert.deepEqual(getPagedLocalPlans(localPlans, 'planned', 1, 1).map((item) => item.planId), ['1'])
assert.deepEqual(getPagedLocalPlans(localPlans, 'planned', 2, 1).map((item) => item.planId), ['2'])

const groups = buildVisibleGroups({
  localPlans,
  remotePlans: remoteMap.planned,
  statusKey: 'planned',
  page: 1,
  pageSize: 1,
  localIndex: index,
  t: (value) => value
})

assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.planId)), ['1', '5'])
assert.equal(groups[0].clientOrderNo, 'A')
assert.equal(groups[1].clientOrderNo, 'D')
