import { schemaSqlList } from './schema'
import { idbGet, idbSet, isIndexedDBAvailable } from './indexedDbStorage'

const DB_NAME = 'qarma_offline.db'
const MEMORY_DB_KEY = '__QARMA_MEMORY_DB__'
const MIGRATE_REPORT_STATUS_NUMERIC_V1_KEY = '__QARMA_MIGRATE_REPORT_STATUS_NUMERIC_V1__'

let opened = false

function isPromiseLike(value) {
  return !!value && typeof value.then === 'function'
}

function sqliteExecute(name, sql) {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (error) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve()
    }
    try {
      const ret = plus.sqlite.executeSql({
        name,
        sql,
        success: () => done(),
        fail: (error) => done(error || new Error('SQLite execute failed'))
      })
      if (isPromiseLike(ret)) {
        ret.then(() => done()).catch((error) => done(error))
      }
    } catch (error) {
      done(error)
    }
  })
}

function sqliteSelect(name, sql) {
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (error, rows = []) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(rows)
    }
    try {
      const ret = plus.sqlite.selectSql({
        name,
        sql,
        success: (rows) => done(null, rows || []),
        fail: (error) => done(error || new Error('SQLite select failed'))
      })
      if (isPromiseLike(ret)) {
        ret.then((rows) => done(null, rows || [])).catch((error) => done(error))
      } else if (Array.isArray(ret)) {
        done(null, ret)
      }
    } catch (error) {
      done(error)
    }
  })
}

function isAppSqlite() {
  return typeof plus !== 'undefined' && plus.sqlite
}

function isUniApp() {
  return typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function'
}

function getMigrationFlag(key) {
  try {
    if (isUniApp() && typeof uni.getStorageSync === 'function') {
      return !!uni.getStorageSync(key)
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key) === '1'
    }
  } catch {}
  return false
}

function setMigrationFlag(key) {
  try {
    if (isUniApp() && typeof uni.setStorageSync === 'function') {
      uni.setStorageSync(key, 1)
      return
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, '1')
    }
  } catch {}
}

async function migrateReportStatusToNumericV1() {
  if (getMigrationFlag(MIGRATE_REPORT_STATUS_NUMERIC_V1_KEY)) return
  try {
    await sqliteExecute(DB_NAME, `
      UPDATE report
      SET status = CASE
        WHEN status IS NULL OR TRIM(CAST(status AS TEXT)) = '' THEN 0
        WHEN TRIM(CAST(status AS TEXT)) IN ('0', 'NEW', 'DOWNLOADED') THEN 0
        WHEN TRIM(CAST(status AS TEXT)) IN ('1', '2', 'DRAFT', 'IN_PROGRESS') THEN 1
        WHEN TRIM(CAST(status AS TEXT)) IN ('3', 'DONE', 'COMPLETED', 'SUBMITTED') THEN 3
        ELSE status
      END;
    `)
    setMigrationFlag(MIGRATE_REPORT_STATUS_NUMERIC_V1_KEY)
  } catch (error) {
    console.warn('report.status 迁移失败:', error)
  }
}

function defaultMemoryDB() {
  return { user: [], report: [], checklist: [], defect: [], photo: [], sync_log: [] }
}

let _lastWriteTarget = ''

/**
 * 读取内存数据库
 * 优先读取 IndexedDB（容量大、不受 5MB 限制），再回退到 uni 存储
 * 当两者都有数据时，以 _lastWriteTarget 标记或 _dbVersion 更大者为准
 */
async function getMemoryDB() {
  let idbData = null
  let uniData = null

  if (isIndexedDBAvailable()) {
    try {
      const data = await idbGet(MEMORY_DB_KEY)
      if (data && typeof data === 'object') idbData = data
    } catch {}
  }

  if (isUniApp()) {
    try {
      const data = uni.getStorageSync(MEMORY_DB_KEY)
      if (data && typeof data === 'object') uniData = data
    } catch {}
  }

  if (idbData && uniData) {
    const idbVer = Number(idbData._dbVersion || 0)
    const uniVer = Number(uniData._dbVersion || 0)
    return idbVer >= uniVer ? idbData : uniData
  }

  return idbData || uniData || defaultMemoryDB()
}

/**
 * 写入内存数据库
 * 优先写入 IndexedDB（容量大），同时尝试同步到 uni 存储
 * 写入时附加 _dbVersion 递增标记，确保读取时能识别最新数据
 */
async function setMemoryDB(db) {
  db._dbVersion = (Number(db._dbVersion) || 0) + 1

  let idbOk = false
  let uniOk = false

  if (isIndexedDBAvailable()) {
    try {
      await idbSet(MEMORY_DB_KEY, db)
      idbOk = true
    } catch (error) {
      console.warn('IndexedDB 写入失败:', error)
    }
  }

  if (isUniApp()) {
    try {
      uni.setStorageSync(MEMORY_DB_KEY, db)
      uniOk = true
    } catch (error) {
      if (idbOk) {
        try { uni.removeStorageSync(MEMORY_DB_KEY) } catch {}
      } else {
        console.warn('uni 存储写入失败:', error)
      }
    }
  }

  _lastWriteTarget = idbOk ? 'idb' : (uniOk ? 'uni' : '')

  if (!idbOk && !uniOk) {
    console.error('所有持久化存储均不可用，内存数据库本次变更不会被保存')
  }
}

export async function openDatabase() {
  if (opened) return
  if (isAppSqlite()) {
    await new Promise((resolve, reject) => {
      try {
        const ret = plus.sqlite.openDatabase({
          name: DB_NAME,
          path: `_doc/${DB_NAME}`,
          success: resolve,
          fail: reject
        })
        if (isPromiseLike(ret)) ret.then(resolve).catch(reject)
      } catch (error) {
        reject(error)
      }
    })
    for (const sql of schemaSqlList) {
      await sqliteExecute(DB_NAME, sql)
    }
    await migrateReportStatusToNumericV1()
  }
  opened = true
}

export async function transaction(executor) {
  await openDatabase()
  if (!isAppSqlite()) {
    const db = await getMemoryDB()
    const draft = JSON.parse(JSON.stringify(db))
    try {
      const result = await executor({ type: 'memory', db: draft })
      await setMemoryDB(draft)
      return result
    } catch (error) {
      throw error
    }
  }
  try {
    await sqliteExecute(DB_NAME, 'BEGIN TRANSACTION;')
    const result = await executor({
      type: 'sqlite',
      name: DB_NAME,
      execute: (sql) => sqliteExecute(DB_NAME, sql),
      select: (sql) => sqliteSelect(DB_NAME, sql)
    })
    await sqliteExecute(DB_NAME, 'COMMIT;')
    return result
  } catch (error) {
    try {
      await sqliteExecute(DB_NAME, 'ROLLBACK;')
    } catch {}
    throw error
  }
}

export async function readOnlyTransaction(executor) {
  await openDatabase()
  if (!isAppSqlite()) {
    const db = await getMemoryDB()
    return executor({ type: 'memory', db })
  }
  return executor({
    type: 'sqlite',
    name: DB_NAME,
    select: (sql) => sqliteSelect(DB_NAME, sql)
  })
}

export async function executeSql(sql) {
  await openDatabase()
  if (!isAppSqlite()) throw new Error('H5 memory mode does not support raw SQL')
  return sqliteExecute(DB_NAME, sql)
}

export async function selectSql(sql) {
  await openDatabase()
  if (!isAppSqlite()) throw new Error('H5 memory mode does not support raw SQL')
  return sqliteSelect(DB_NAME, sql)
}
