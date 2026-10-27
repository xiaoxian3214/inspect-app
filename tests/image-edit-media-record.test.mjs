import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const mediaViewer = await loadUtsModule('domain/mediaViewer.uts')
const mediaDisplay = await loadUtsModule('domain/mediaDisplay.uts')
const uploadPolicy = await loadUtsModule('domain/photoUploadPolicy.uts')
const submissionPolicy = await loadUtsModule('domain/finalSubmissionPolicy.uts')
const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
const photoModule = await loadUtsModule('repositories/photoRepository.uts')
const metadataModule = await loadUtsModule('domain/mediaUploadMetadata.uts')
const viewModel = await loadUtsModule('domain/detailViewModel.uts')

/** 已上传过的相册图片：本地路径、服务端文件与业务归属都齐全。 */
function uploadedPhoto(overrides = {}) {
  return {
    photoId: 'photo-1',
    reportId: 'plan-1',
    ownerType: 'checklist',
    ownerId: 'item-1',
    bizType: 'checkResult',
    bizId: 'item-1',
    sortNo: 3,
    mediaType: 'image',
    localPath: '/storage/emulated/0/DCIM/original.jpg',
    fileId: 'file-old',
    filePath: '/remote/original.jpg',
    thumbnailPath: '/remote/original-thumb.jpg',
    previewUrl: 'https://example.com/remote/original-preview.jpg',
    fileName: 'original.jpg',
    fileExt: 'jpg',
    fileSize: 204800,
    mimeType: 'image/jpeg',
    md5: 'old-md5',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    uploadStatus: 'done',
    ...overrides
  }
}

/** 编辑已上传图片后必须清空旧服务端文件字段，否则新图会被判定为"已上传"而永不重传。 */
test('edited media record drops stale server file fields and keeps business ownership', () => {
  const edited = mediaViewer.createEditedMediaRecord(uploadedPhoto(), '/documents/inspection-edit-1.png', 'plan-1')

  assert.equal(edited.photoId, 'photo-1')
  assert.equal(edited.reportId, 'plan-1')
  assert.equal(edited.localPath, '/documents/inspection-edit-1.png')
  assert.equal(edited.uploadStatus, 'pending')
  assert.equal(edited.uploadError, '')
  assert.equal(edited.retryCount, 0)
  assert.equal(edited.nextRetryAt, '')

  // 旧服务端文件信息必须清空，否则仓库把该记录当作已上传，编辑结果永远传不到服务端。
  assert.equal(edited.fileId, '')
  assert.equal(edited.filePath, '')
  assert.equal(edited.thumbnailPath, '')
  assert.equal(edited.previewUrl, '')
  assert.equal(edited.md5, '')
  assert.equal(edited.uploadedAt, '')

  // 业务归属必须保留，上传参数（bizType/bizId/ownerType）才合法。
  assert.equal(edited.ownerType, 'checklist')
  assert.equal(edited.ownerId, 'item-1')
  assert.equal(edited.bizType, 'checkResult')
  assert.equal(edited.bizId, 'item-1')
  assert.equal(edited.sortNo, 3)
  assert.equal(edited.mediaType, 'image')
})

/** 图片编辑落库后必须重新进入待上传队列，这是"编辑完还是原图"缺陷的直接回归点。 */
test('editing an uploaded photo re-enters the pending upload queue', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = photoModule.createPhotoRepository(database)
  await repository.save('plan-1', uploadedPhoto())

  // 刚上传完成时没有待上传记录。
  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), [])

  const [stored] = await repository.listByReportId('plan-1')
  const edited = mediaViewer.createEditedMediaRecord(stored, '/documents/inspection-edit-1.png', 'plan-1')
  await repository.save('plan-1', edited)

  const [reloaded] = await repository.listByReportId('plan-1')
  assert.equal(reloaded.localPath, '/documents/inspection-edit-1.png')
  assert.equal(reloaded.fileId, '')
  assert.equal(reloaded.uploadStatus, 'pending')
  // 仍保留同一行与排序，不能新增重复媒体。
  assert.equal((await repository.listByReportId('plan-1')).length, 1)
  assert.equal(reloaded.sortNo, 3)
  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), ['photo-1'])
})

/**
 * 服务端下载回来的已上传照片只有文件字段：没有 subGoodsNo（计划子货号），sortNo 常为 0。
 * 这类记录编辑后如果直接用原字段上传，服务端会拒绝；必须用当前检查项上下文补齐后落库。
 * 复现路径与真机一致：真实照片仓库读回记录 → 构造编辑记录 → 落库 → 校验上传参数。
 */
test('editing a server-sourced uploaded photo keeps complete upload params after the db round-trip', async () => {
  const database = memoryModule.createMemoryDatabase()
  const repository = photoModule.createPhotoRepository(database)
  // 服务端文件行的形状：有 fileId/ownerType/ownerId，但没有任何业务上传参数。
  await repository.save('plan-1', uploadedPhoto({ bizType: '', bizId: '', subGoodsNo: '', sortNo: 0 }))

  const [stored] = await repository.listByReportId('plan-1')
  assert.equal(stored.subGoodsNo ?? '', '', '服务端记录本来就没有计划子货号')

  const context = metadataModule.buildChecklistMediaMetadata(
    { plan: { subGoodsNo: 'SG-9' }, itemResults: [] },
    { id: 'item-1' },
    '',
    1
  )
  const edited = mediaViewer.createEditedMediaRecord(stored, '/storage/emulated/0/Android/data/pkg/files/inspection_media/1-1.jpg', 'plan-1', context)
  await repository.save('plan-1', edited)

  const [reloaded] = await repository.listByReportId('plan-1')
  // 上传接口对这四项没有兜底，缺任何一个都会被服务端拒绝。
  const params = uploadPolicy.buildValidatedUploadParams('plan-1', reloaded)
  assert.equal(params.bizType, 'checkResult')
  assert.equal(params.bizId, 'item-1')
  assert.equal(params.subGoodsNo, 'SG-9')
  assert.equal(params.sortNo, 1)
  // 编辑结果仍然进入待上传队列。
  assert.deepEqual((await repository.listPendingByReportId('plan-1')).map((photo) => photo.photoId), ['photo-1'])
})

/**
 * 编辑后的记录沿用原 photoId（否则照片仓库会新增一行、服务端也会多出一张图）。
 * 若"照片身份相同"被判成"媒体未变化"，媒体库仍拿到编辑前的旧记录，
 * 用户就会看到编辑完成后媒体库里还是旧图——这是本次要求的直接回归点。
 */
test('editing a photo replaces it in the item media library immediately', () => {
  const p1 = { photoId: 'file-a', fileId: 'file-a', ownerId: 'item-1', ownerType: 'checklist', dataKey: 'item-1', filePath: 'https://api.example.com/file-a.jpg', uploadStatus: 'done', sortNo: 1 }
  const p2 = { photoId: 'file-b', fileId: 'file-b', ownerId: 'item-1', ownerType: 'checklist', dataKey: 'item-1', filePath: 'https://api.example.com/file-b.jpg', uploadStatus: 'done', sortNo: 2 }
  const detail = viewModel.normalizeInspectionDetail({
    planId: 'plan-1',
    plan: { subGoodsNo: 'SG-9' },
    checklistItems: [{ itemId: 'item-1', data: {} }],
    checklistData: { 'item-1': { result: '', comment: '', photos: [p1, p2], measurements: [] } },
    defects: [],
    photos: []
  }, 'plan-1')

  const context = metadataModule.buildChecklistMediaMetadata(detail, { itemId: 'item-1' }, '', 2)
  const edited = mediaViewer.createEditedMediaRecord(p2, '/doc/inspection_media/edited-b.jpg', 'plan-1', context)
  const next = viewModel.updateChecklistItem(detail, 'item-1', {
    photos: mediaViewer.replaceMedia(detail.checklistData['item-1'].photos, p2, edited)
  })

  // 原位替换：条数不变、顺序不变，第 2 张变成编辑后的本地新图。
  const photos = next.checklistData['item-1'].photos
  assert.equal(photos.length, 2)
  assert.equal(photos[0].photoId, 'file-a')
  assert.equal(photos[1].photoId, 'file-b')
  assert.equal(photos[1].localPath, '/doc/inspection_media/edited-b.jpg')
  assert.equal(photos[1].fileId, '')
  assert.equal(photos[1].uploadStatus, 'pending')
  // 平铺媒体列表同步替换：预览、最终提交校验读取的都是它。
  const flat = next.photos.filter((photo) => photo.photoId === 'file-b')
  assert.equal(flat.length, 1)
  assert.equal(flat[0].localPath, '/doc/inspection_media/edited-b.jpg')
})

/** 此前编辑失败的记录已经落库缺参，重试按钮必须补齐参数，否则永远传不上去。 */
test('retrying a failed upload repairs missing upload params', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const retry = page.split('async function retryMediaUpload(')[1].split('async function ')[0]
  assert.match(retry, /const retryItem = \(payload\?\.item \?\? payload\?\.defect \?\? \{\}\) as UTSJSONObject/)
  assert.match(retry, /mergePhotoUploadMetadata\(photo, resolvePhotoUploadMetadata\(photo, retryItem, retryOwnerType, retryPhotos\)\)/)
  // 参数补齐后再重置状态，保证这一轮同步先删旧图再上传。
  assert.ok(retry.indexOf('retryContext') < retry.indexOf("uploadStatus: 'pending'"), '补齐参数要发生在重置上传状态之前')
})

/** 页面必须走统一构造：内联保留 fileId 会让编辑结果永远停在本机。 */
test('report detail builds edited media through the shared record builder', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  assert.match(page, /createEditedMediaRecord\(latest, localPath, planId\.value, resolvePhotoUploadMetadata\(latest, previewItem\.value, previewOwnerType\.value, contextPhotos\)\)/)
  // 回归点：历史实现直接展开 latest 并只改 localPath/uploadStatus，fileId 被原样保留。
  assert.doesNotMatch(page, /\.\.\.latest, localPath, uploadStatus: 'pending'/)
})
/** 编辑后的记录要能直接展示、参与上传参数校验，并在重传完成前拦住最终提交。 */
test('edited media record stays displayable, uploadable and blocks premature submit', () => {
  const edited = mediaViewer.createEditedMediaRecord(uploadedPhoto(), '/documents/inspection-edit-1.png', 'plan-1')

  // 展示优先用本地新图，编辑结果立即生效，不再回落到旧的服务端图片。
  assert.equal(mediaDisplay.getMediaDisplayUrl(edited, 'preview', 'https://api.example.com'), '/documents/inspection-edit-1.png')
  assert.equal(mediaDisplay.getMediaDisplayUrl(edited, 'thumbnail', 'https://api.example.com'), '/documents/inspection-edit-1.png')
  // 仍按图片通道上传，且上传参数所需业务字段齐全。
  assert.equal(uploadPolicy.isVideoMedia(edited), false)
  const params = uploadPolicy.buildValidatedUploadParams('plan-1', edited)
  assert.equal(params.bizType, 'checkResult')
  assert.equal(params.bizId, 'item-1')
  // 重传完成前必须拦住最终提交，避免把旧服务端文件当成果提交。
  assert.equal(submissionPolicy.isPhotoUploaded(edited), false)
  assert.equal(submissionPolicy.evaluateFinalSubmissionPhotos([edited]).ready, false)
})

/** 点完成时必须先把旧服务端文件排进删除队列，再由同步流程"先删旧图、再传新图"。 */
test('editing an uploaded photo queues deletion of the replaced server file', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const save = page.split('async function savePreviewEdit(')[1].split('async function deletePreviewPhoto(')[0]

  // 旧 fileId 必须在清空前取出。
  assert.match(save, /const replacedFileId = String\(latest\?\.fileId \?\? ''\)\.trim\(\)/)
  // 本地状态先变：编辑结果立即生效并重新进入待上传队列。
  assert.match(save, /await photoRepository\.save\(planId\.value, edited\)/)
  // 旧服务端文件入持久队列（离线不丢、按 fileId 去重）。
  assert.match(save, /await persistentOperationService\.enqueueFileDelete\(replacedFileId\)/)
  // 必须先排删除任务再触发同步，否则本轮同步可能先上传新图。
  assert.ok(save.indexOf('enqueueFileDelete(replacedFileId)') < save.indexOf('persistDraft('), '删除任务必须排在触发同步之前')

  // 同步流程的执行顺序：先处理持久操作（删旧图），再上传待上传图片（新图）。
  const sync = await readFile('services/automaticSyncService.uts', 'utf8')
  const processIndex = sync.indexOf('await processPendingOperations()')
  const uploadIndex = sync.indexOf('await uploadPendingPhotos(planId)')
  assert.ok(processIndex >= 0 && uploadIndex > processIndex, '自动同步必须先删除旧服务端文件，再上传编辑后的图片')
})

/**
 * 已上传照片的服务端记录只有文件字段：subGoodsNo（计划子货号）与 sortNo（检查项内序号）都不在里面，
 * 而 buildValidatedUploadParams 对这两项没有兜底。编辑后必须用当前检查项上下文补齐，
 * 否则上传请求缺字段被服务端拒绝——这正是"本地新拍的图编辑后能传、已上传的图编辑后传不上去"的原因。
 */
test('editing an uploaded photo rebuilds upload params missing from the server record', () => {
  const uploaded = uploadedPhoto({ bizType: '', bizId: '', subGoodsNo: '', sortNo: 0 })
  const context = metadataModule.buildChecklistMediaMetadata({ plan: { subGoodsNo: 'SG-9' }, itemResults: [] }, { id: 'item-1' }, '', 2)
  const edited = mediaViewer.createEditedMediaRecord(uploaded, '/storage/emulated/0/Android/data/pkg/files/inspection_media/1-1.jpg', 'plan-1', context)

  assert.equal(edited.bizType, 'checkResult')
  assert.equal(edited.bizId, 'item-1')
  assert.equal(edited.subGoodsNo, 'SG-9')
  assert.equal(edited.sortNo, 2)
  // 上传参数四件套齐全，服务端不会再因为缺子货号/序号拒绝。
  const params = uploadPolicy.buildValidatedUploadParams('plan-1', edited)
  assert.equal(params.bizType, 'checkResult')
  assert.equal(params.bizId, 'item-1')
  assert.equal(params.subGoodsNo, 'SG-9')
  assert.equal(params.sortNo, 2)
})

/** 记录里已有的业务参数不能被上下文覆盖：检查点图片编辑后仍按 checkPoint 上传。 */
test('editing keeps upload params already carried by the record', () => {
  const uploaded = uploadedPhoto({ bizType: 'checkPoint', bizId: 'point-1', subGoodsNo: 'SG-OLD', sortNo: 5 })
  const context = metadataModule.buildChecklistMediaMetadata({ plan: { subGoodsNo: 'SG-9' }, itemResults: [] }, { id: 'item-1' }, '', 2)
  const edited = mediaViewer.createEditedMediaRecord(uploaded, '/storage/emulated/0/Android/data/pkg/files/inspection_media/1-2.jpg', 'plan-1', context)

  assert.equal(edited.bizType, 'checkPoint')
  assert.equal(edited.bizId, 'point-1')
  assert.equal(edited.subGoodsNo, 'SG-OLD')
  assert.equal(edited.sortNo, 5)
})

/** 编辑保存时必须把当前检查项/疵点上下文算出的上传参数传进去，否则已上传图片仍会缺字段。 */
test('detail page passes the item context into the edited media record', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const save = page.split('async function savePreviewEdit(')[1].split('async function deletePreviewPhoto(')[0]
  assert.match(save, /createEditedMediaRecord\(latest, localPath, planId\.value, resolvePhotoUploadMetadata\(latest, previewItem\.value, previewOwnerType\.value, contextPhotos\)\)/)
  assert.match(page, /function resolvePhotoUploadMetadata\(photo: UTSJSONObject, item: UTSJSONObject, ownerType: string, photos: UTSJSONObject\[\]\): UTSJSONObject \{/)
  assert.match(page, /const sonPlanId = String\(photo\?\.sonPlanId \?\? item\?\.sonPlanId \?\? ''\)/)
  assert.match(page, /buildChecklistMediaMetadata\(detail\.value, item, sonPlanId, sortNo\)/)
  assert.match(page, /buildDefectMediaMetadata\(detail\.value, defectId, sortNo\)/)
})
