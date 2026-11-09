import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { loadUtsModule } from './load-uts-module.mjs'

const { createMemoryDatabase } = await loadUtsModule('database/memoryDatabase.uts')
const { createSqliteDatabase } = await loadUtsModule('database/sqliteDatabase.uts')
const { schemaSqlList } = await loadUtsModule('database/schema.uts')
const { createReportRepository } = await loadUtsModule('repositories/reportRepository.uts')
const { createInspectionDetailService } = await loadUtsModule('services/inspectionDetailService.uts')
const viewModel = await loadUtsModule('domain/detailViewModel.uts')

/** 上传后读取当前报告不能快照或组装其它报告的数据。 */
test('single report loading never snapshots the whole database', async () => {
  const db = createMemoryDatabase()
  const repo = createReportRepository(db)
  await repo.saveDetailSnapshot('one', { plan: { id: 'one', goodsName: 'One' }, photos: [], checklistItems: [] })
  await repo.saveDetailSnapshot('two', { plan: { id: 'two', goodsName: 'Two' }, photos: [], checklistItems: [] })
  db.snapshot = () => { throw new Error('whole database snapshot is forbidden') }
  assert.equal((await repo.getPlanById('one')).plan.goodsName, 'One')
  assert.equal((await repo.getPlanById('two')).plan.goodsName, 'Two')
  assert.equal(await repo.getPlanById('missing'), null)
})

/** 完成上传时只替换普通草稿 payload，不重写检查项、疵点和照片表。 */
test('upload refresh updates existing dirty payload without rewriting business rows', async () => {
  const calls = []
  const detail = { planId: 'one', plan: { id: 'one', status: 1 }, status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { finishFlag: 0 }, checklistItems: [], checklistData: {}, defects: [], photos: [{ photoId: 'p', fileId: 'remote' }] }
  const repo = {
    refreshPendingPhotoPayload: async (id, buildPayload) => { calls.push(id); return buildPayload(detail) },
    saveDetailSnapshot: async () => { throw new Error('full snapshot forbidden') },
    saveDraftChanges: async () => { throw new Error('draft row rewrite forbidden') }
  }
  const service = createInspectionDetailService({ reportRepository: repo, viewModel })
  const payload = await service.refreshUploadedPhotoPayload('one')
  assert.deepEqual(calls, ['one'])
  assert.equal(payload.finishFlag, '0')
})

/** 上传完成回填只写已存在的普通草稿，同时包含最新服务端图片 ID。 */
test('photo refresh updates dirty draft payload but keeps clean report and media rows untouched', async () => {
  const sqlite = new DatabaseSync(':memory:')
  const batches = []
  const db = createSqliteDatabase({
    open: async () => {},
    query: async (sql) => sqlite.prepare(sql).all(),
    executeBatch: async (sqls) => { batches.push(sqls); sqlite.exec('BEGIN'); try { sqls.forEach((sql) => sqlite.exec(sql)); sqlite.exec('COMMIT') } catch (error) { sqlite.exec('ROLLBACK'); throw error } }
  }, schemaSqlList)
  try {
    await db.open()
    const repo = createReportRepository(db)
    const service = createInspectionDetailService({ reportRepository: repo, viewModel })
    const raw = { plan: { id: 'p1', goodsName: 'Product' }, report: { id: 'report-1' }, standardItems: [{ id: 'section', children: [{ id: 'item-1', itemName: 'Item' }] }], itemResults: [{ id: 'item-1', standardItemId: 'item-1' }], checklistData: { 'item-1': { result: 'pass', photos: [{ photoId: 'local-1', localPath: '/one.jpg' }] } }, photos: [{ photoId: 'local-1', ownerType: 'checklist', ownerId: 'item-1', localPath: '/one.jpg', uploadStatus: 'pending' }] }
    const dirty = await service.saveDraft('p1', raw, { markDirty: true })
    assert.equal(dirty.syncStatus, 'DIRTY')
    await db.transaction(async (tx) => {
      const row = tx.readWhere('photo', (photo) => photo.sourcePhotoId === 'local-1')[0]
      tx.upsert('photo', 'photoId', { ...row, uploadStatus: 'done', fileId: 'remote-1', jsonData: JSON.stringify({ ...JSON.parse(row.jsonData), fileId: 'remote-1', uploadStatus: 'done' }) })
    })
    batches.length = 0
    const payload = await service.refreshUploadedPhotoPayload('p1')
    assert.equal(payload.finishFlag, '0')
    assert.ok(payload.itemResults.some((item) => item.fileList?.some((file) => String(file.fileId) === 'remote-1')), 'uploaded fileId is included in report payload')
    assert.equal(batches.flat().filter((sql) => /INSERT OR REPLACE INTO/.test(sql)).length, 1, 'only shared draft row is rewritten')
    assert.ok(batches.flat().every((sql) => sql.includes('app_setting')), 'photo, item and defect tables are not rewritten')
    const current = await repo.getPlanById('p1')
    assert.equal(current.syncStatus, 'DIRTY')
    assert.ok(current.pendingSyncPayload.itemResults.some((item) => item.fileList?.some((file) => String(file.fileId) === 'remote-1')))
    await repo.saveDetailSnapshot('clean', { plan: { id: 'clean', goodsName: 'Clean' }, photos: [] })
    batches.length = 0
    assert.equal(await service.refreshUploadedPhotoPayload('clean'), null)
    assert.equal(batches.length, 0, 'clean report is not dirtied merely by photo upload')
  } finally { sqlite.close() }
})

/** 合并报告若从共享父组 ID 进入，轻量回填必须保留当前脏草稿的真实子计划 ID。 */
test('merged group upload refresh preserves member-specific pending payload', async () => {
  const { createPhotoRepository } = await loadUtsModule('repositories/photoRepository.uts')
  const db = createMemoryDatabase()
  const repo = createReportRepository(db)
  const media = createPhotoRepository(db)
  const service = createInspectionDetailService({ reportRepository: repo, viewModel })
  const plans = [{ id: 'parent-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: 'Parent' }, { id: 'child-1', parentPlanId: 'parent-1', mergeType: 2, goodsName: 'Child' }]
  await repo.savePlans(plans.map((plan) => ({ planId: plan.id, plan, inspectionPlans: plans, report: { id: 'report-1', planId: 'parent-1' }, standardItems: [{ id: 'section', children: [{ id: 'item-1', itemName: 'Item' }] }], itemResults: [{ id: 'item-1' }], checklistData: { 'item-1': { result: 'pass' } }, photos: [] })))
  const child = await repo.getPlanById('child-1')
  await service.saveDraft('child-1', child)
  assert.equal((await repo.getPlanById('parent-1')).pendingSyncPayload.planId, 'child-1')
  await media.save('parent-1', { photoId: 'new', ownerType: 'checklist', ownerId: 'item-1', localPath: '/new.jpg', uploadStatus: 'done', fileId: 'remote-1' })
  const refreshed = await service.refreshUploadedPhotoPayload('parent-1')
  assert.equal(refreshed.planId, 'child-1', 'group ID may not silently redirect the draft to parent')
  assert.equal((await repo.getPlanById('child-1')).pendingSyncPayload.planId, 'child-1')
  assert.ok(refreshed.itemResults.some((item) => item.fileList?.some((file) => file.fileId === 'remote-1')))
})

/** Runtime 的完成回填入口不得重新 normalize/saveDraft 整份报告。 */
test('runtime upload completion uses lightweight pending payload refresh', async () => {
  const source = await readFile('runtime/appRuntime.uts', 'utf8')
  const body = source.slice(source.indexOf('async function refreshDraftPhotosAfterUpload'), source.indexOf('/** 查找尚未到期'))
  assert.match(body, /inspectionDetailService\.refreshUploadedPhotoPayload\(planId\)/)
  assert.doesNotMatch(body, /saveDraft\(|getPlanById\(|mergeDetailPhotos\(/)
})
