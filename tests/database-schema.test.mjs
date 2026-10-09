import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const schemaModule = await loadUtsModule('database/schema.uts')
const memoryModule = await loadUtsModule('database/memoryDatabase.uts')

test('defines every offline table required by the app', () => {
  assert.equal(schemaModule.DATABASE_VERSION, 1)
  assert.deepEqual(schemaModule.TABLE_NAMES, [
    'user',
    'report',
    'checklist',
    'defect',
    'photo',
    'sync_log',
    'request_queue',
    'schema_migration',
    'app_setting'
  ])

  for (const tableName of schemaModule.TABLE_NAMES) {
    assert.ok(
      schemaModule.schemaSqlList.some((sql) => sql.includes(`TABLE IF NOT EXISTS ${tableName}`)),
      `missing schema for ${tableName}`
    )
  }
})

test('rolls back all writes when a transaction fails', async () => {
  const database = memoryModule.createMemoryDatabase()

  await assert.rejects(
    database.transaction(async (transaction) => {
      transaction.upsert('report', 'reportId', { reportId: 'report-1', status: 0 })
      throw new Error('download failed')
    }),
    /download failed/
  )

  assert.deepEqual(database.readTable('report'), [])
})

test('upserts report rows without creating duplicates', async () => {
  const database = memoryModule.createMemoryDatabase()

  await database.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'report-1', status: 0, orderNo: 'PO-1' })
  })
  await database.transaction(async (transaction) => {
    transaction.upsert('report', 'reportId', { reportId: 'report-1', status: 1 })
  })

  assert.deepEqual(database.readTable('report'), [
    { reportId: 'report-1', status: 1, orderNo: 'PO-1' }
  ])
})

test('returns snapshots that cannot mutate stored state', async () => {
  const database = memoryModule.createMemoryDatabase({
    report: [{ reportId: 'report-1', status: 0 }]
  })
  const rows = database.readTable('report')
  rows[0].status = 3

  assert.equal(database.readTable('report')[0].status, 0)
})
