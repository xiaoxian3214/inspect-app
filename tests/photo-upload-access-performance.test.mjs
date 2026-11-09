import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { loadUtsModule } from './load-uts-module.mjs'

const { createSqliteDatabase } = await loadUtsModule('database/sqliteDatabase.uts')
const { schemaSqlList } = await loadUtsModule('database/schema.uts')
const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')

/** Build a real SQLite fixture with unrelated photo records and track committed SQL. */
async function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  const batches = []
  let failCommit = false
  const database = createSqliteDatabase({
    open: async () => {},
    query: async (sql) => sqlite.prepare(sql).all(),
    executeBatch: async (statements) => {
      if (failCommit) throw new Error('commit failed')
      batches.push(statements)
      sqlite.exec('BEGIN')
      try { for (const sql of statements) sqlite.exec(sql); sqlite.exec('COMMIT') }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }, schemaSqlList)
  await database.open()
  await database.transaction(async (tx) => {
    for (let i = 0; i < 200; i++) tx.upsert('photo', 'photoId', {
      photoId: `other::${i}`, sourcePhotoId: String(i), reportId: 'other', localPath: `/other/${i}.jpg`,
      uploadStatus: 'done', fileId: `remote-${i}`, sortNo: i,
      jsonData: JSON.stringify({ photoId: String(i), fileId: `remote-${i}`, uploadStatus: 'done', marker: 'UNRELATED_PHOTO_PAYLOAD' })
    })
  })
  const repository = createPhotoRepository(database)
  await repository.save('target', { photoId: 'one', localPath: '/one.jpg', uploadStatus: 'pending' })
  batches.length = 0
  return { sqlite, database, repository, batches, fail: () => { failCommit = true } }
}

/** Count unrelated payload serialization deterministically, without timing-sensitive thresholds. */
async function countUnrelatedSerialization(action) {
  const original = JSON.stringify
  let count = 0
  JSON.stringify = function (value, ...rest) {
    const encoded = original.call(JSON, value, ...rest)
    if (encoded?.includes('UNRELATED_PHOTO_PAYLOAD')) count++
    return encoded
  }
  try { await action() } finally { JSON.stringify = original }
  return count
}

/** Single-photo upload transitions and filtered queue reads must not serialize unrelated photos. */
test('photo upload save, markUploaded and queue reads avoid whole-photo-table JSON copies', async () => {
  const f = await fixture()
  try {
    const count = await countUnrelatedSerialization(async () => {
      await f.repository.save('target', { photoId: 'one', uploadStatus: 'uploading' })
      assert.equal((await f.repository.listPendingByReportId('target')).length, 1)
      assert.equal((await f.repository.listPending()).length, 1)
      assert.deepEqual(await f.repository.listPendingReportIds(), ['target'])
      assert.equal((await f.repository.listByReportId('target')).length, 1)
      await f.repository.markUploaded('target', 'one', { fileId: 'uploaded' })
      assert.equal((await f.repository.listPending()).length, 0)
    })
    assert.equal(count, 0, 'unrelated photo JSON must not be cloned or compared during target upload')
    assert.equal(f.batches.flat().length, 2)
    assert.ok(f.batches.flat().every((sql) => sql.includes('target::one')))
    assert.equal((await f.repository.listByReportId('target'))[0].localPath, '/one.jpg')
  } finally { f.sqlite.close() }
})

/** Conditional reads return detached values and preserve transaction rollback and mutation isolation. */
test('conditional reads and COW writes preserve detached transaction reads and rollback', async () => {
  const f = await fixture()
  try {
    const selected = f.database.readWhere('photo', (row) => row.reportId === 'target')
    selected[0].localPath = 'outside'
    assert.equal((await f.repository.listByReportId('target'))[0].localPath, '/one.jpg')
    await assert.rejects(f.database.transaction(async (tx) => {
      const rows = tx.read('photo')
      rows[0].localPath = 'mutated-copy'
      tx.upsert('photo', 'photoId', { photoId: 'target::one', localPath: 'uncommitted' })
      assert.equal(tx.readWhere('photo', (row) => row.photoId === 'target::one')[0].localPath, 'uncommitted')
      throw new Error('abort')
    }), /abort/)
    assert.equal((await f.repository.listByReportId('target'))[0].localPath, '/one.jpg')
    f.fail()
    await assert.rejects(f.database.transaction(async (tx) => tx.upsert('photo', 'photoId', { photoId: 'target::one', localPath: 'failed' })), /commit failed/)
    assert.equal((await f.repository.listByReportId('target'))[0].localPath, '/one.jpg')
  } finally { f.sqlite.close() }
})

/** Dirty-key bookkeeping must retain SQL semantics when removals, replacements and upserts mix. */
test('COW dirty keys support removeWhere, replace, no-op writes and sequential transactions', async () => {
  const f = await fixture()
  try {
    await f.database.transaction(async (tx) => {
      tx.removeWhere('photo', (row) => row.reportId === 'target')
      tx.upsert('photo', 'photoId', { photoId: 'target::one', reportId: 'target', sourcePhotoId: 'one', localPath: '/new.jpg' })
    })
    assert.equal(f.sqlite.prepare("SELECT localPath FROM photo WHERE photoId='target::one'").get().localPath, '/new.jpg')
    await f.database.transaction(async (tx) => tx.replace('photo', [{ photoId: 'only', reportId: 'target', localPath: '/only.jpg' }]))
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM photo').get().count, 1)
    f.batches.length = 0
    await f.database.transaction(async (tx) => tx.upsert('photo', 'photoId', { photoId: 'only', localPath: '/only.jpg' }))
    assert.equal(f.batches.length, 0)
    await Promise.all(['/a.jpg', '/b.jpg'].map((path) => f.database.transaction(async (tx) => {
      tx.upsert('photo', 'photoId', { photoId: path, localPath: path })
    })))
    assert.equal(f.database.readTable('photo').length, 3)
  } finally { f.sqlite.close() }
})
