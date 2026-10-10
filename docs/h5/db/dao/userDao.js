import { transaction } from '../sqlite'

let sessionCache = null

function now() {
  return new Date().toISOString()
}

function upsertMemoryUser(db, user) {
  const idx = db.user.findIndex((item) => item.userId === user.userId)
  if (idx >= 0) db.user[idx] = user
  else db.user.push(user)
}

export async function saveUserSession(user) {
  sessionCache = user
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      upsertMemoryUser(ctx.db, user)
      return
    }
    const sql = `REPLACE INTO user (userId, userName, token, role, expireAt, encryptedPassword, autoLogin, rememberPwd)
      VALUES ('${user.userId}', '${user.userName || ''}', '${user.token || ''}', '${user.role || ''}', '${user.expireAt || now()}', '${user.encryptedPassword || ''}', ${user.autoLogin ? 1 : 0}, ${user.rememberPwd ? 1 : 0});`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

export async function getLastUserSession() {
  if (sessionCache) return sessionCache
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      const record = ctx.db.user[0] || null
      sessionCache = record
      return record
    }
    const rows = plus.sqlite.selectSql({ name: ctx.name, sql: 'SELECT * FROM user LIMIT 1;' })
    sessionCache = rows?.[0] || null
    return sessionCache
  })
}

export function getCachedSession() {
  return sessionCache
}

export async function clearUserSession() {
  sessionCache = null
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      ctx.db.user = []
      return
    }
    plus.sqlite.executeSql({ name: ctx.name, sql: 'DELETE FROM user;' })
  })
}
