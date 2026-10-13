import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { createMemoryDatabase } = await loadUtsModule('database/memoryDatabase.uts')
const { createDefectRepository } = await loadUtsModule('repositories/defectRepository.uts')

/** 独立疵点仓库应写后端列，并在读取时保留离线照片扩展。 */
test('defect repository stores business columns and restores local media', async () => {
  const database = createMemoryDatabase()
  const repository = createDefectRepository(database)
  await repository.replaceByReportId('parent', [{ id: 'd1', defectLevel: 'MAJOR', defectDesc: '划痕', quantity: 2,
    fileList: [{ fileId: 'f1' }], photos: [{ localPath: '/offline/photo.jpg' }] }])
  const row = database.readTable('defect')[0]
  assert.equal(row.id, 'd1')
  assert.equal(row.plan_id, 'parent')
  assert.equal(row.defect_desc, '划痕')
  assert.equal(JSON.parse(row.jsonData).defectDesc, undefined)
  assert.equal((await repository.listByReportId('parent'))[0].defectDesc, '划痕')
  assert.equal((await repository.listByReportId('parent'))[0].photos[0].localPath, '/offline/photo.jpg')
})
