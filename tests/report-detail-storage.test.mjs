import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const repositoryModule = await loadUtsModule('repositories/reportRepository.uts')

test('stores H5 detail fields in report checklist defect and photo tables', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)

  await repository.saveDetailSnapshot('plan-1', {
    plan: { id: 'plan-1', clientOrderNo: 'PO-1', goodsName: '产品一' },
    standardItems: [{ id: 'section-1', children: [{ id: 'item-1', itemName: '外观' }] }],
    checklistItems: [{ itemId: 'item-1', itemName: '外观', data: { result: 'fail' } }],
    defects: [{ defectId: 'defect-1', checkItemId: 'item-1', type: 'MAJOR', defectDesc: '破损', photos: [] }],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg', uploadStatus: 'pending' }]
  })

  const report = database.readTable('report')[0]
  const checklist = database.readTable('checklist')[0]
  const defect = database.readTable('defect')[0]
  const photo = database.readTable('photo')[0]

  assert.equal(report.productName, '产品一')
  assert.equal(JSON.parse(report.jsonData).standardItems[0].children[0].itemName, '外观')
  assert.equal(checklist.sourceItemId, 'item-1')
  assert.equal(defect.sourceDefectId, 'defect-1')
  assert.equal(defect.itemId, 'item-1')
  assert.equal(defect.desc, '破损')
  assert.equal(photo.sourcePhotoId, 'photo-1')
  assert.equal(photo.ownerType, 'checklist')
  assert.equal(photo.ownerId, 'item-1')
})

test('merged plans keep separate list identities but share the latest report content', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const inspectionPlans = [
    { id: 'plan-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: '产品一' },
    { id: 'plan-2', parentPlanId: 'parent-1', mergeType: 2, goodsName: '产品二' }
  ]
  await repository.savePlans(inspectionPlans.map((plan) => ({
    report: { id: 'report-shared' }, inspectionPlans, plan, planId: plan.id,
    checklistData: { 'item-1': { result: '' } }
  })))
  const changed = { ...await repository.getPlanById('plan-1'),
    checklistData: { 'item-1': { result: 'pass' } }, checklistItems: [], defects: [], photos: [] }
  await repository.saveDetailSnapshot('plan-1', changed)
  const sibling = await repository.getPlanById('plan-2')
  assert.equal(sibling.plan.id, 'plan-2')
  assert.equal(sibling.report.id, 'report-shared')
  assert.equal(sibling.checklistData['item-1'].result, 'pass')
  assert.equal(database.readTable('report').length, 2)
})

test('removing merged media does not restore a stale photo from another plan entry', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = repositoryModule.createReportRepository(database)
  const inspectionPlans = [
    { id: 'plan-1', parentPlanId: 'parent-1', mergeType: 2 },
    { id: 'plan-2', parentPlanId: 'parent-1', mergeType: 2 }
  ]
  await repository.savePlans(inspectionPlans.map((plan) => ({ plan, planId: plan.id, inspectionPlans, report: { id: 'report-1' } })))
  const shared = { ...await repository.getPlanById('plan-2'), checklistItems: [], defects: [],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', fileId: 'file-1' }] }
  await repository.saveDetailSnapshot('plan-2', shared)
  assert.equal(database.readTable('photo').length, 1)
  await repository.saveDetailSnapshot('plan-1', { ...await repository.getPlanById('plan-1'), photos: [], checklistItems: [], defects: [] })
  assert.deepEqual((await repository.getPlanById('plan-2')).photos, [])
  assert.equal(database.readTable('photo').length, 0)
})

test('stale detail snapshots do not reset uploaded photos back to pending', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reportRepository = repositoryModule.createReportRepository(database)
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const photoRepository = photoModule.createPhotoRepository(database)
  const staleDetail = {
    plan: { id: 'plan-1', clientOrderNo: 'PO-1', goodsName: '产品一' },
    checklistItems: [],
    defects: [],
    photos: [{ photoId: 'photo-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/local/one.jpg', uploadStatus: 'pending' }]
  }

  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  await photoRepository.markUploaded('plan-1', 'photo-1', { fileId: 'file-1', filePath: '/remote/one.jpg' })
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)

  assert.deepEqual(await photoRepository.listPendingByReportId('plan-1'), [])
  assert.equal((await photoRepository.listByReportId('plan-1'))[0].fileId, 'file-1')
})

test('saving an older draft does not delete a separately persisted pending photo', async () => {
  const database = memoryModule.createMemoryDatabase()
  const reportRepository = repositoryModule.createReportRepository(database)
  const photoModule = await loadUtsModule('repositories/photoRepository.uts')
  const photoRepository = photoModule.createPhotoRepository(database)
  const staleDetail = { plan: { id: 'plan-1', goodsName: '产品一' }, checklistData: { 'item-1': { photos: [] } }, checklistItems: [], defects: [], photos: [] }
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  await photoRepository.save('plan-1', { photoId: 'p1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/documents/1.jpg', uploadStatus: 'pending' })
  await reportRepository.saveDetailSnapshot('plan-1', staleDetail)
  assert.equal((await photoRepository.listByReportId('plan-1')).length, 1)
  assert.equal((await reportRepository.getPlanById('plan-1')).photos[0].photoId, 'p1')
  assert.equal((await reportRepository.getPlanById('plan-1')).checklistData?.['item-1']?.photos?.[0]?.photoId, 'p1')
})
