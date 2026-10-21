import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const photoModule = await loadUtsModule('repositories/photoRepository.uts')

test('lists every report that still has local photos waiting for upload', async () => {
  const repository = photoModule.createPhotoRepository(memoryModule.createMemoryDatabase())
  await repository.saveAll('plan-1', [
    { photoId: 'pending-1', localPath: '/local/1.jpg', uploadStatus: 'pending' },
    { photoId: 'done-1', fileId: 'file-1', uploadStatus: 'done' }
  ])
  await repository.saveAll('plan-2', [
    { photoId: 'failed-1', localPath: '/local/2.jpg', uploadStatus: 'failed' }
  ])

  assert.deepEqual(await repository.listPendingReportIds(), ['plan-1', 'plan-2'])
})

/** 疵点编辑中暂存的图片不参与自动同步，点击疵点保存后才进入待上传列表。 */
test('draft defect photos stay out of upload queue until activated on save', async () => {
  const repository = photoModule.createPhotoRepository(memoryModule.createMemoryDatabase())
  await repository.save('plan-1', { photoId: 'draft-1', ownerType: 'defect', ownerId: 'defect-1', localPath: '/local/draft.jpg', uploadStatus: 'draft' })
  assert.deepEqual(await repository.listPendingReportIds(), [])
  assert.deepEqual(await repository.listPendingByReportId('plan-1'), [])
  const draft = (await repository.listByReportId('plan-1'))[0]
  await repository.save('plan-1', { ...draft, uploadStatus: 'pending' })
  assert.deepEqual(await repository.listPendingReportIds(), ['plan-1'])
  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), ['draft-1'])
})

test('simultaneous photo additions do not replace each other', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const schemaModule = await loadUtsModule('database/schema.uts')
  const sqliteModule = await loadUtsModule('database/sqliteDatabase.uts')
  const database = sqliteModule.createSqliteDatabase({
    open: async () => {},
    query: async (sql) => sqlite.prepare(sql).all(),
    executeBatch: async (statements) => {
      sqlite.exec('BEGIN TRANSACTION')
      try { statements.forEach((statement) => sqlite.exec(statement)); sqlite.exec('COMMIT') }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }, schemaModule.schemaSqlList)
  await database.open()
  const repository = photoModule.createPhotoRepository(database)
  await Promise.all([
    repository.save('plan-1', { photoId: 'p1', localPath: '/documents/1.jpg', uploadStatus: 'pending' }),
    repository.save('plan-1', { photoId: 'p2', localPath: '/documents/2.jpg', uploadStatus: 'pending' })
  ])
  assert.deepEqual((await repository.listByReportId('plan-1')).map((photo) => photo.photoId).sort(), ['p1', 'p2'])
  sqlite.close()
})
