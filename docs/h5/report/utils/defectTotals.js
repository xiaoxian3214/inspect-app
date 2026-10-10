export function getAffectedDefectCounts(defects, normalizeSeverity) {
  const totals = { critical: 0, major: 0, minor: 0 }
  for (const defect of defects) {
    const severity = String(normalizeSeverity(defect?.type, defect?.typeLabel)).toLowerCase()
    const quantity = Number(defect?.quantity ?? defect?.defectCount ?? 0)
    if (Object.hasOwn(totals, severity) && Number.isFinite(quantity) && quantity > 0) {
      totals[severity] += quantity
    }
  }
  return totals
}
