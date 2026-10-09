import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const checklistModule = await loadUtsModule('repositories/checklistRepository.uts')
const defectModule = await loadUtsModule('repositories/defectRepository.uts')
const photoModule = await loadUtsModule('repositories/photoRepository.uts')

test('persists and restores complete checklist item data by report', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = checklistModule.createChecklistRepository(database)

  await repository.replaceByReportId('plan-1', [
    { itemId: 'item-1', itemName: '外观', status: 'pass', remarks: '正常', photos: [{ localPath: '/a.jpg' }] },
    { itemId: 'item-2', itemName: '尺寸', status: 'fail', measurements: [{ value: '12' }] }
  ])

  assert.deepEqual(await repository.listByReportId('plan-1'), [
    { itemId: 'item-1', itemName: '外观', status: 'pass', remarks: '正常', photos: [{ localPath: '/a.jpg' }] },
    { itemId: 'item-2', itemName: '尺寸', status: 'fail', measurements: [{ value: '12' }] }
  ])
})

test('upserts and removes local defects without affecting other reports', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = defectModule.createDefectRepository(database)

  await repository.save('plan-1', { defectId: 'defect-1', defectDesc: '划痕', severity: 'MAJOR' })
  await repository.save('plan-2', { defectId: 'defect-2', defectDesc: '污渍', severity: 'MINOR' })
  await repository.save('plan-1', { defectId: 'defect-1', defectDesc: '严重划痕', severity: 'CRITICAL' })
  await repository.remove('plan-1', 'defect-1')

  assert.deepEqual(await repository.listByReportId('plan-1'), [])
  assert.equal((await repository.listByReportId('plan-2'))[0].defectDesc, '污渍')
})

test('returns only unfinished local photos for upload recovery', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = photoModule.createPhotoRepository(database)

  await repository.saveAll('plan-1', [
    { photoId: 'pending', localPath: '/pending.jpg', uploadStatus: 'pending' },
    { photoId: 'failed', localPath: '/failed.jpg', uploadStatus: 'failed' },
    { photoId: 'done', localPath: '/done.jpg', uploadStatus: 'done', fileId: 'file-1' }
  ])
  await repository.saveAll('plan-2', [
    { photoId: 'other', localPath: '/other.jpg', uploadStatus: 'pending' }
  ])

  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), ['pending', 'failed'])
  await repository.markUploaded('plan-1', 'pending', { fileId: 'file-2', filePath: '/remote/pending.jpg' })
  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), ['failed'])
})

test('replaces report detail snapshot atomically across offline tables', async () => {
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const database = memoryModule.createMemoryDatabase()
  const repository = reportModule.createReportRepository(database)

  await repository.saveDetailSnapshot('plan-1', {
    plan: { id: 'plan-1', goodsName: '鞋子' },
    checklistItems: [{ itemId: 'item-1', status: 'pass' }],
    defects: [{ defectId: 'defect-1', defectDesc: '划痕' }],
    photos: [{ photoId: 'photo-1', localPath: '/photo.jpg', uploadStatus: 'pending' }]
  })

  const snapshot = database.snapshot()
  assert.equal(snapshot.report.length, 1)
  assert.equal(snapshot.checklist.length, 1)
  assert.equal(snapshot.defect.length, 1)
  assert.equal(snapshot.photo.length, 1)
  assert.equal((await repository.getPlanById('plan-1')).plan.goodsName, '鞋子')
})
