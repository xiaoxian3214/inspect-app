export function getQuantityPlanId(item) {
  const plan = item?.plan || item || {}
  return String(plan.id ?? plan.planId ?? item?.planId ?? item?.id ?? '').trim()
}

export function isMergedQuantityPlan(item) {
  return Number(item?.plan?.mergeType ?? item?.mergeType) === 2
}

export function getQuantityPlans(source) {
  const current = source?.plan || source || {}
  if (!isMergedQuantityPlan(source)) return [current]
  const plans = Array.isArray(source?.inspectionPlans) ? source.inspectionPlans : []
  const unique = new Map()
  for (const item of plans) {
    const plan = item?.plan || item
    const planId = getQuantityPlanId(plan)
    if (planId) unique.set(planId, plan)
  }
  const currentId = getQuantityPlanId(current)
  if (currentId && !unique.has(currentId)) unique.set(currentId, current)
  return [...unique.values()]
}

export function getQuantityTotals(plans) {
  return plans.reduce((totals, plan) => ({
    orderQuantity: totals.orderQuantity + (Number(plan.requiredQuantity) || 0),
    readyQuantity: totals.readyQuantity + (Number(plan.finishQuantity ?? plan.readyQuantity) || 0),
    sampleQuantity: totals.sampleQuantity + (Number(plan.sampleQuantity ?? plan.sampleSize) || 0)
  }), { orderQuantity: 0, readyQuantity: 0, sampleQuantity: 0 })
}

export function patchReadyQuantities(source, changes) {
  const quantities = new Map(changes.map(change => {
    const fields = { finishQuantity: change.finishQuantity }
    if (change.sampleQuantity != null) fields.sampleQuantity = change.sampleQuantity
    if (change.sampleSize != null) fields.sampleSize = change.sampleSize
    return [String(change.planId), fields]
  }))
  const patchPlan = plan => quantities.has(getQuantityPlanId(plan))
    ? { ...plan, ...quantities.get(getQuantityPlanId(plan)) }
    : plan
  const result = source?.plan ? { ...source, plan: patchPlan(source.plan) } : patchPlan(source)
  if (!Array.isArray(source?.inspectionPlans)) return result
  return { ...result, inspectionPlans: source.inspectionPlans.map(patchPlan) }
}

export async function loadReadyQuantityPlans(source, { getPlanDetail, searchPlans }) {
  const planId = getQuantityPlanId(source)
  if (!planId) throw new Error('计划ID缺失')
  const detail = await getPlanDetail(planId)
  const candidates = [detail?.plan, ...(detail?.inspectionPlans || [])].filter(Boolean)
  const current = candidates.find(plan => getQuantityPlanId(plan) === planId) || source?.plan || source
  if (!isMergedQuantityPlan(current)) return [current]
  if (Array.isArray(detail?.inspectionPlans) && detail.inspectionPlans.length > 1) {
    return getQuantityPlans({ plan: current, inspectionPlans: detail.inspectionPlans })
  }
  const parentPlanId = String(current.parentPlanId || planId)
  const plans = []
  let page = 1
  while (true) {
    const result = await searchPlans({ parentPlanId }, page, 100)
    const records = Array.isArray(result?.records) ? result.records : []
    plans.push(...records)
    if (!records.length && plans.length < Number(result?.total || 0)) throw new Error('加载失败')
    if (plans.length >= Number(result?.total || 0) || !records.length) break
    page += 1
  }
  if (!plans.length) throw new Error('加载失败')
  return getQuantityPlans({ plan: current, inspectionPlans: plans })
}

export async function saveReadyQuantities(rows, updateFinishQuantity, onSaved) {
  const validated = rows.map(row => {
    const quantity = Number(row.finishQuantity)
    if (!String(row.planId || '').trim()) throw new Error('计划ID缺失')
    if (row.finishQuantity == null || String(row.finishQuantity).trim() === '' || !Number.isSafeInteger(quantity) || quantity < 0) {
      throw new Error('请输入有效的非负整数')
    }
    return { ...row, finishQuantity: quantity }
  })
  for (const row of validated) {
    if (row.finishQuantity === Number(row.originalQuantity)) continue
    const updatedPlan = await updateFinishQuantity(row.planId, row.finishQuantity)
    const change = { planId: row.planId, finishQuantity: updatedPlan?.finishQuantity ?? row.finishQuantity }
    if (updatedPlan?.sampleQuantity != null) change.sampleQuantity = updatedPlan.sampleQuantity
    if (updatedPlan?.sampleSize != null) {
      change.sampleSize = updatedPlan.sampleSize
      if (change.sampleQuantity == null) change.sampleQuantity = updatedPlan.sampleSize
    }
    await onSaved([change])
  }
}
