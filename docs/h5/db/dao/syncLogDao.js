import { transaction } from '../sqlite'

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

export async function insertSyncLog(row) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      ctx.db.sync_log.push(row)
      return
    }
    const sql = `INSERT INTO sync_log (id, reportId, action, errorMessage, retryCount, createdAt)
      VALUES ('${esc(row.id)}', '${esc(row.reportId)}', '${esc(row.action)}', '${esc(row.errorMessage)}', ${Number(row.retryCount || 0)}, '${esc(row.createdAt || new Date().toISOString())}');`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}
