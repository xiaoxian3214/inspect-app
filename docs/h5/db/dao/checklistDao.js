import { transaction } from '../sqlite'

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

export async function upsertChecklistItems(items = []) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      for (const item of items) {
        const idx = ctx.db.checklist.findIndex((x) => x.itemId === item.itemId)
        if (idx >= 0) ctx.db.checklist[idx] = { ...ctx.db.checklist[idx], ...item }
        else ctx.db.checklist.push(item)
      }
      return
    }
    for (const item of items) {
      const sql = `REPLACE INTO checklist (itemId, reportId, skuNo, qty, checkedQty, passQty, defectQty, updatedAt)
        VALUES ('${esc(item.itemId)}', '${esc(item.reportId)}', '${esc(item.skuNo)}', ${Number(item.qty || 0)}, ${Number(item.checkedQty || 0)}, ${Number(item.passQty || 0)}, ${Number(item.defectQty || 0)}, '${esc(item.updatedAt || new Date().toISOString())}');`
      plus.sqlite.executeSql({ name: ctx.name, sql })
    }
  })
}

export async function listChecklistByReport(reportId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.checklist.filter((x) => x.reportId === reportId)
    return plus.sqlite.selectSql({ name: ctx.name, sql: `SELECT * FROM checklist WHERE reportId='${esc(reportId)}';` })
  })
}
