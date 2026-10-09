import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const repositoryModule = await loadUtsModule('repositories/requestQueueRepository.uts')
const serviceModule = await loadUtsModule('services/persistentOperationService.uts')

test('deduplicates persistent file delete tasks', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createRequestQueueRepository(database)

  await repository.enqueue({ taskType: 'FILE_DELETE', dedupeKey: 'file-delete:file-1', payload: { fileId: 'file-1' } })
  await repository.enqueue({ taskType: 'FILE_DELETE', dedupeKey: 'file-delete:file-1', payload: { fileId: 'file-1' } })

  assert.equal((await repository.listPending()).length, 1)
})

test('keeps delete task offline and removes it after a successful retry', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createRequestQueueRepository(database)
  let online = false
  const deleted = []
  const service = serviceModule.createPersistentOperationService({
    requestQueueRepository: repository,
    reportFileApi: { deleteInspectFile: async (fileId) => deleted.push(fileId) },
    isOnline: async () => online,
    createId: () => 'task-1'
  })

  await service.enqueueFileDelete('file-1')
  assert.deepEqual(await service.processPending(), { pendingCount: 1, completedCount: 0, failedCount: 0 })
  online = true
  assert.deepEqual(await service.processPending(), { pendingCount: 1, completedCount: 1, failedCount: 0 })
  assert.deepEqual(deleted, ['file-1'])
  assert.equal((await repository.listPending()).length, 0)
})
