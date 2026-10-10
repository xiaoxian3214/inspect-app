import { transaction } from '../sqlite'

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

export async function saveDefect(defect) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      const idx = ctx.db.defect.findIndex((x) => x.defectId === defect.defectId)
      if (idx >= 0) ctx.db.defect[idx] = { ...ctx.db.defect[idx], ...defect }
      else ctx.db.defect.push(defect)
      return
    }
    const sql = `REPLACE INTO defect (defectId, reportId, itemId, defectType, desc, photoPaths, createAt)
      VALUES ('${esc(defect.defectId)}', '${esc(defect.reportId)}', '${esc(defect.itemId)}', '${esc(defect.defectType)}', '${esc(defect.desc)}', '${esc(JSON.stringify(defect.photoPaths || []))}', '${esc(defect.createAt || new Date().toISOString())}');`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

export async function listDefectByReport(reportId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.defect.filter((x) => x.reportId === reportId)
    return plus.sqlite.selectSql({ name: ctx.name, sql: `SELECT * FROM defect WHERE reportId='${esc(reportId)}';` })
  })
}
