const IDB_NAME = 'qarma_photo_blobs'
const IDB_STORE = 'blobs'
const IDB_VERSION = 1

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
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
    req.onerror = () => { _dbPromise = null; reject(req.error) }
    req.onblocked = () => { _dbPromise = null; reject(new Error('IndexedDB blocked')) }
  })
  return _dbPromise
}

let _counter = 0

export function generateBlobKey() {
  return `blob_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 8)}`
}

export async function saveBlob(key, blob) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    store.put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

async function resetDBConnection() {
  const previous = _dbPromise
  _dbPromise = null
  if (!previous) return
  try {
    const db = await previous
    db?.close?.()
  } catch {}
}

async function readBlobOnce(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error || new Error('IndexedDB blob read failed'))
  })
}

export async function readBlobWithStatus(key) {
  if (!key) return { status: 'missing', blob: null }
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const blob = await readBlobOnce(key)
      if (blob instanceof Blob) return { status: 'found', blob }
      if (attempt === 0) {
        await resetDBConnection()
        continue
      }
      return { status: 'missing', blob: null }
    } catch (error) {
      lastError = error
      if (attempt === 0) {
        await resetDBConnection()
        continue
      }
    }
  }
  return { status: 'unavailable', blob: null, error: lastError }
}

export async function getBlob(key) {
  const result = await readBlobWithStatus(key)
  return result.status === 'found' ? result.blob : null
}

export async function removeBlob(key) {
  if (!key) return
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
    })
  } catch {
    // 静默忽略删除失败
  }
}

export async function removeBlobsBatch(keys) {
  if (!Array.isArray(keys) || !keys.length) return
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      for (const key of keys) {
        if (key) store.delete(key)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // 静默忽略
  }
}

export async function clearAllBlobs() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    // 静默忽略
  }
}
