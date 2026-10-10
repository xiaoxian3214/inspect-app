import { readOnlyTransaction, transaction } from '../sqlite'

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

export async function saveReport(report) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      const idx = ctx.db.report.findIndex((x) => x.reportId === report.reportId)
      if (idx >= 0) ctx.db.report[idx] = { ...ctx.db.report[idx], ...report }
      else ctx.db.report.push(report)
      return
    }
    const statusValue = Number.isFinite(Number(report.status)) ? Number(report.status) : 0
    const sql = `REPLACE INTO report (reportId, orderNo, productName, jsonData, downloadAt, lockExpireAt, status, lockStatus, lockerId, syncRetry)
      VALUES ('${esc(report.reportId)}', '${esc(report.orderNo)}', '${esc(report.productName)}', '${esc(report.jsonData || '{}')}', '${esc(report.downloadAt || '')}', '${esc(report.lockExpireAt || '')}', ${statusValue}, '${esc(report.lockStatus || '')}', '${esc(report.lockerId || '')}', ${Number(report.syncRetry || 0)});`
    await ctx.execute(sql)
  })
}

export async function listReports() {
  return readOnlyTransaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.report
    return ctx.select('SELECT * FROM report ORDER BY downloadAt DESC;')
  })
}

export async function listReportSummaries() {
  return readOnlyTransaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.report
    return ctx.select('SELECT reportId, orderNo, productName, jsonData, downloadAt, lockExpireAt, status, lockStatus, lockerId, syncRetry FROM report ORDER BY downloadAt DESC;')
  })
}

export async function getReportById(reportId) {
  return readOnlyTransaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.report.find((x) => x.reportId === reportId) || null
    const rows = await ctx.select(`SELECT * FROM report WHERE reportId='${esc(reportId)}' LIMIT 1;`)
    return rows?.[0] || null
  })
}

export async function updateReportStatus(reportId, status) {
  return transaction(async (ctx) => {
    const id = String(reportId || '')
    if (!id) return
    if (ctx.type === 'memory') {
      const idx = ctx.db.report.findIndex((x) => x.reportId === id)
      if (idx >= 0) ctx.db.report[idx] = { ...ctx.db.report[idx], status }
      return
    }
    const statusValue = Number.isFinite(Number(status)) ? Number(status) : 0
    await ctx.execute(`UPDATE report SET status=${statusValue} WHERE reportId='${esc(id)}';`)
  })
}

export async function updateReportsStatus(reportIds = [], status) {
  return transaction(async (ctx) => {
    const ids = Array.isArray(reportIds)
      ? reportIds.map((x) => String(x || '').trim()).filter(Boolean)
      : []
    if (!ids.length) return
    if (ctx.type === 'memory') {
      const idSet = new Set(ids)
      ctx.db.report = ctx.db.report.map((row) => (idSet.has(row.reportId) ? { ...row, status } : row))
      return
    }
    const statusValue = Number.isFinite(Number(status)) ? Number(status) : 0
    const inList = ids.map((x) => `'${esc(x)}'`).join(',')
    await ctx.execute(`UPDATE report SET status=${statusValue} WHERE reportId IN (${inList});`)
  })
}

export async function removeReport(reportId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      ctx.db.report = ctx.db.report.filter((x) => x.reportId !== reportId)
      ctx.db.checklist = ctx.db.checklist.filter((x) => x.reportId !== reportId)
      ctx.db.defect = ctx.db.defect.filter((x) => x.reportId !== reportId)
      ctx.db.photo = ctx.db.photo.filter((x) => x.reportId !== reportId)
      return
    }
    await ctx.execute(`DELETE FROM report WHERE reportId='${esc(reportId)}';`)
    await ctx.execute(`DELETE FROM checklist WHERE reportId='${esc(reportId)}';`)
    await ctx.execute(`DELETE FROM defect WHERE reportId='${esc(reportId)}';`)
    await ctx.execute(`DELETE FROM photo WHERE reportId='${esc(reportId)}';`)
  })
}
