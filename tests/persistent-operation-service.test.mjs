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

/** 移图先持久化操作，恢复网络时使用 H5 专用接口，不依赖普通报告草稿重新关联图片。 */
test('persists photo copies and sends them after reconnecting', async () => {
  const repository = repositoryModule.createRequestQueueRepository(memoryModule.createMemoryDatabase())
  let online = false
  const copied = []
  const service = serviceModule.createPersistentOperationService({
    requestQueueRepository: repository,
    reportFileApi: { deleteInspectFile: async () => {} },
    planApi: { copyPhotosToItems: async (payload) => copied.push(payload) },
    isOnline: async () => online
  })
  const payload = { sourcePlanId: 'plan', sourceItemId: 'source', targetPlanIds: ['plan'], targetItemIds: ['target'], fileIds: ['file'] }
  await service.enqueuePhotoCopy(payload)
  await service.enqueuePhotoCopy(payload)
  assert.equal((await repository.listUnfinished()).length, 1)
  await service.processPending()
  assert.deepEqual(copied, [])
  online = true
  await service.processPending()
  assert.deepEqual(copied, [payload])
  assert.equal((await repository.listUnfinished()).length, 0)
})
