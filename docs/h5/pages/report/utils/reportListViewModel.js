export function getPlanUniqueId(item) {
  return item?.plan?.id || item?.plan?.planId || item?.planId || item?.id || item?.plan?.reportId || item?.reportId
}

export function normalizePlanStatus(itemOrStatus) {
  const rawStatus = (itemOrStatus && typeof itemOrStatus === 'object')
    ? (itemOrStatus?.status ?? itemOrStatus?.plan?.status)
    : itemOrStatus
  const numericStatus = Number(rawStatus)
  if (Number.isFinite(numericStatus)) {
    if (numericStatus === 0) return 0
    if (numericStatus === 1 || numericStatus === 2) return 1
    if (numericStatus === 3) return 3
  }

  const textStatus = String(rawStatus || '').toUpperCase()
  if (textStatus === 'DOWNLOADED' || textStatus === 'NEW') return 0
  if (textStatus === 'DRAFT' || textStatus === 'IN_PROGRESS') return 1
  if (textStatus === 'DONE' || textStatus === 'COMPLETED' || textStatus === 'SUBMITTED') return 3
  return 0
}

export function isItemInTab(item, tabKey) {
  const normalizedStatus = normalizePlanStatus(item)
  if (tabKey === 'planned') return normalizedStatus === 0
  if (tabKey === 'progress') return normalizedStatus === 1
  if (tabKey === 'report') return normalizedStatus === 3
  return false
}

export function buildLocalPlanIndex(localPlans = []) {
  const byId = new Map()
  const idSet = new Set()
  for (const plan of localPlans || []) {
    const id = getPlanUniqueId(plan)
    if (!id) continue
    byId.set(id, plan)
    idSet.add(id)
  }
  return { byId, idSet }
}

export function buildTabCounts(localPlans = [], remoteListMap = {}) {
  const counts = { planned: 0, progress: 0, report: 0 }
  const localIndex = buildLocalPlanIndex(localPlans)
  for (const key of Object.keys(counts)) {
    counts[key] += (localPlans || []).filter((plan) => isItemInTab(plan, key)).length
    counts[key] += (remoteListMap[key] || []).filter((plan) => {
      const id = getPlanUniqueId(plan)
      if (!isItemInTab(plan, key)) return false
      return !id || !localIndex.idSet.has(id)
    }).length
  }
  return counts
}

export function buildDisplayTabCounts({ tabCounts = {}, totalMap = {} } = {}) {
  return {
    planned: Math.max(Number(tabCounts.planned || 0), Number(totalMap.planned || 0)),
    progress: Math.max(Number(tabCounts.progress || 0), Number(totalMap.progress || 0)),
    report: Math.max(Number(tabCounts.report || 0), Number(totalMap.report || 0))
  }
}

export function getPagedLocalPlans(localPlans = [], statusKey = 'planned', page = 1, pageSize = 100) {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.max(1, Number(pageSize) || 100)
  const start = (normalizedPage - 1) * normalizedPageSize
  return (localPlans || [])
    .filter((plan) => isItemInTab(plan, statusKey))
    .slice(start, start + normalizedPageSize)
}

export function mergeVisiblePlans({
  localPlans = [],
  remotePlans = [],
  statusKey = 'planned',
  page = 1,
  pageSize = 100,
  localIndex = buildLocalPlanIndex(localPlans),
  includeRemote = true
} = {}) {
  const localPage = getPagedLocalPlans(localPlans, statusKey, page, pageSize)
  const merged = [...localPage]
  const mergedIds = new Set(localPage.map(getPlanUniqueId).filter(Boolean))

  if (!includeRemote) return merged

  for (const remotePlan of remotePlans || []) {
    const id = getPlanUniqueId(remotePlan)
    if (id && localIndex.idSet.has(id)) {
      continue
    }
    const finalItem = remotePlan
    if (!isItemInTab(finalItem, statusKey)) continue
    if (!id) {
      merged.push(finalItem)
      continue
    }
    if (!mergedIds.has(id)) {
      merged.push(finalItem)
      mergedIds.add(id)
    }
  }
  return merged
}

export function buildVisibleGroups({
  localPlans = [],
  remotePlans = [],
  statusKey = 'planned',
  page = 1,
  pageSize = 100,
  localIndex,
  t = (value) => value,
  formatOrderDate = defaultFormatOrderDate
} = {}) {
  const items = mergeVisiblePlans({
    localPlans,
    remotePlans,
    statusKey,
    page,
    pageSize,
    localIndex
  })
  return groupPlans(items, t, formatOrderDate)
}

export function groupPlans(items = [], t = (value) => value, formatOrderDate = defaultFormatOrderDate) {
  const groups = []
  const groupMap = new Map()
  for (const item of items || []) {
    const clientOrderNo = item?.plan?.clientOrderNo || item?.clientOrderNo || t('未分组')
    if (!groupMap.has(clientOrderNo)) {
      const group = {
        groupKey: clientOrderNo,
        clientOrderNo,
        supplierName: item?.plan?.factoryName || item?.supplierName || item?.factoryName || '-',
        orderDate: formatOrderDate(item),
        items: []
      }
      groupMap.set(clientOrderNo, group)
      groups.push(group)
    }
    groupMap.get(clientOrderNo).items.push(item)
  }
  return groups
}

function defaultFormatOrderDate() {
  return ''
}
