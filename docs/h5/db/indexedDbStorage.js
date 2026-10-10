/**
 * 基于 IndexedDB 的键值存储工具
 * 用于替代 localStorage 持久化内存数据库，避免 5MB 配额限制
 */

const IDB_NAME = 'qarma_idb'
const IDB_STORE = 'kv'
const IDB_VERSION = 1

let _idbPromise = null

function openIDB() {
  if (_idbPromise) return _idbPromise
  _idbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => { _idbPromise = null; reject(req.error) }
    req.onblocked = () => { _idbPromise = null; reject(new Error('IndexedDB blocked')) }
  })
  return _idbPromise
}

export async function idbGet(key) {
  try {
    const db = await openIDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function idbSet(key, value) {
  const db = await openIDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const req = tx.objectStore(IDB_STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export function isIndexedDBAvailable() {
  return typeof indexedDB !== 'undefined'
}
