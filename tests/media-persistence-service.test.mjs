import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const mediaModule = await loadUtsModule('services/mediaPersistenceService.uts')

/** 构造可断言的假复制函数：记录每次复制入参并按需模拟成功或失败。 */
function createFakeCopyFile(failure = null) {
  const calls = []
  const copyFile = (srcPath, destPath, onSuccess, onFailure) => {
    calls.push({ srcPath, destPath })
    if (failure != null) {
      onFailure(failure)
      return
    }
    onSuccess()
  }
  return { calls, copyFile }
}

test('persistent path detection separates temp capture files from already stored media', () => {
  const dir = '/data/user/0/app/apps/__UNI__1FFA0B1/doc/inspection_media'
  assert.equal(mediaModule.isPersistentMediaPath(`${dir}/1750000000000-1.jpg`, dir), true)
  assert.equal(mediaModule.isPersistentMediaPath('/cache/uni-media/175.jpeg', dir), false)
  assert.equal(mediaModule.isPersistentMediaPath('', dir), false)
  // 旧数据里带 /inspection_media/ 与 _doc/ 的路径即使拿不到当前目录也必须原样复用。
  assert.equal(mediaModule.isPersistentMediaPath('/other/doc/inspection_media/a.png'), true)
  assert.equal(mediaModule.isPersistentMediaPath('/doc/uniapp_save/abc.jpg'), true)
  assert.equal(mediaModule.isPersistentMediaPath('/cache/inspection-edit-3.png'), true)
})

test('persisted file names keep the source extension and never collide inside one batch', () => {
  assert.equal(mediaModule.buildPersistedMediaFileName('/cache/a.JPG', false, 1750000000000, 1), '1750000000000-1.jpg')
  assert.equal(mediaModule.buildPersistedMediaFileName('/cache/a.mp4', true, 1750000000000, 2), '1750000000000-2.mp4')
  assert.equal(mediaModule.buildPersistedMediaFileName('/cache/no-extension', true, 5, 0), '5-0.mp4')
  assert.equal(mediaModule.buildPersistedMediaFileName('/cache/trailing.', false, 5, 0), '5-0.jpg')
  assert.equal(mediaModule.buildPersistedMediaFileName('/cache/a.png', false, Number.NaN, Number.NaN), '0-0.png')
  assert.notEqual(
    mediaModule.buildPersistedMediaFileName('/cache/a.jpg', false, 9, 1),
    mediaModule.buildPersistedMediaFileName('/cache/a.jpg', false, 9, 2)
  )
})

test('capture temp files are copied into the persistent dir and only then reported ready', async () => {
  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const first = await service.persistMediaPath('/cache/uni-media/photo.jpeg', false)
  const second = await service.persistMediaPath('/cache/uni-media/video.mov', true)

  assert.match(first, /^\/doc\/inspection_media\/\d+-1\.jpeg$/)
  assert.match(second, /^\/doc\/inspection_media\/\d+-2\.mov$/)
  assert.equal(fake.calls.length, 2)
  assert.equal(fake.calls[0].srcPath, '/cache/uni-media/photo.jpeg')
  assert.equal(fake.calls[0].destPath, first)
  assert.equal(fake.calls[1].destPath, second)
})

test('already stored media is reused and a missing persistent dir rejects capture', async () => {
  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const stored = '/doc/inspection_media/1750000000000-1.jpg'
  assert.equal(await service.persistMediaPath(stored, false), stored)
  assert.equal(fake.calls.length, 0)

  const lazyService = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    resolvePersistentDir: () => ''
  })
  await assert.rejects(() => lazyService.persistMediaPath('/cache/uni-media/a.jpg', false), /持久目录不可用/)
  assert.equal(fake.calls.length, 0)
})

test('copy failures surface the file system errCode instead of an empty message', async () => {
  const imageService = mediaModule.createMediaPersistenceService({
    copyFile: createFakeCopyFile({ errCode: 1300002, errMsg: 'fail no such file or directory' }).copyFile,
    persistentDir: '/doc/inspection_media'
  })
  await assert.rejects(
    () => imageService.persistMediaPath('/cache/uni-media/missing.jpg', false),
    (error) => {
      assert.match(error.message, /图片本地保存失败，请重试/)
      assert.match(error.message, /1300002/)
      assert.match(error.message, /no such file or directory/)
      return true
    }
  )

  const videoService = mediaModule.createMediaPersistenceService({
    copyFile: createFakeCopyFile({ errCode: 1300021 }).copyFile,
    persistentDir: '/doc/inspection_media'
  })
  await assert.rejects(
    () => videoService.persistMediaPath('/cache/uni-media/dir', true),
    (error) => {
      assert.match(error.message, /视频本地保存失败，请重试/)
      assert.match(error.message, /1300021/)
      return true
    }
  )

  const blankService = mediaModule.createMediaPersistenceService({
    copyFile: createFakeCopyFile({}).copyFile,
    persistentDir: '/doc/inspection_media'
  })
  await assert.rejects(
    () => blankService.persistMediaPath('', false),
    /媒体本地路径不能为空/
  )
})

/** 原生外置缓存超出文件 API 白名单时，完成拍照必须明确失败，不能生成永远卡住的上传任务。 */
test('custom camera cannot enqueue an external file rejected by the sandbox', async () => {
  const denied = createFakeCopyFile({ errCode: 1300013, errMsg: 'fail 路径不在沙盒目录内' })
  const service = mediaModule.createMediaPersistenceService({ copyFile: denied.copyFile, persistentDir: '/doc/inspection_media' })
  await assert.rejects(() => service.persistMediaPath('/storage/emulated/0/DCIM/Camera/a.jpg', false), /1300013.*路径不在沙盒目录内/)
  assert.equal(denied.calls.length, 1)
})

test('batch persistence keeps capture order and maps every entry to its media type', async () => {
  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const paths = await service.persistMediaPaths([
    { path: '/cache/uni-media/1.jpg', mediaType: 'image' },
    { path: '/cache/uni-media/2.mp4', mediaType: 'video' },
    { path: '/doc/inspection_media/keep.jpg', mediaKind: 'image' }
  ])

  assert.equal(paths.length, 3)
  assert.match(paths[0], /^\/doc\/inspection_media\/\d+-1\.jpg$/)
  assert.match(paths[1], /^\/doc\/inspection_media\/\d+-2\.mp4$/)
  assert.equal(paths[2], '/doc/inspection_media/keep.jpg')
  assert.equal(fake.calls.length, 2)
})

/** 自定义相机直接使用 takePhoto.tempImagePath，不经过 copyFile；系统相机仍可复制暂存。 */
test('custom camera temp image remains unchanged for direct upload', async () => {
  const source = '/storage/emulated/0/Android/data/com.example.app/cache/uni-media/Pic_1.jpg'
  const fake = createFakeCopyFile({ errCode: 1300002 })
  const service = mediaModule.createMediaPersistenceService({ copyFile: fake.copyFile, persistentDir: '/doc/inspection_media' })
  assert.equal(await service.persistMediaPath(source, false), source)
  assert.equal(fake.calls.length, 0)
})

/** 应用内相机路径保持原样；其他外置路径不属于 takePhoto，仍走已有复制分支。 */
test('external camera originals keep their returned path', async () => {
  assert.equal(mediaModule.isExternalStorageMediaPath('/storage/emulated/0/Android/data/app/cache/uni-media/Pic_1.jpg'), true)
  assert.equal(mediaModule.isExternalStorageMediaPath('file:///storage/emulated/0/DCIM/Camera/a.jpg'), true)
  assert.equal(mediaModule.isExternalStorageMediaPath('/mnt/sdcard/DCIM/a.jpg'), true)
  assert.equal(mediaModule.isExternalStorageMediaPath('/data/user/0/app/cacheuni-media/a.jpg'), false)
  assert.equal(mediaModule.isExternalStorageMediaPath('unifile://cache/uni-media/a.jpg'), false)
  assert.equal(mediaModule.isExternalStorageMediaPath(''), false)

  assert.equal(mediaModule.needsPersistentMediaCopy('/storage/emulated/0/Android/data/app/cache/uni-media/Pic_1.jpg', '/doc/inspection_media'), false)
  assert.equal(mediaModule.needsPersistentMediaCopy('/storage/emulated/0/DCIM/Camera/Pic_1.jpg', '/doc/inspection_media'), true)
  assert.equal(mediaModule.needsPersistentMediaCopy('/data/user/0/app/cacheuni-media/1792377957939.jpg', '/doc/inspection_media'), true)
  assert.equal(mediaModule.needsPersistentMediaCopy('/doc/inspection_media/1750000000000-1.jpg', '/doc/inspection_media'), false)

  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const externalPath = '/storage/emulated/0/Android/data/app/cache/uni-media/Pic_1792377957939.jpg'
  assert.equal(await service.persistMediaPath(externalPath, false), externalPath)
  assert.equal(fake.calls.length, 0)
})

/** 与 takePhoto 相同，camera 组件录像返回的 app 私有临时地址也不交给 copyFile。 */
test('external app camera videos keep their temporary path', async () => {
  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const externalVideo = '/storage/emulated/0/Android/data/app/cache/uni-media/Video_1.mp4'
  assert.equal(await service.persistMediaPath(externalVideo, true), externalVideo)
  assert.equal(fake.calls.length, 0)
})

/** 批量结果须保持拍照路径与顺序；只有系统相机路径触发文件接口复制。 */
test('custom camera paths remain unchanged while system temp paths are copied inside one batch', async () => {
  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const externalImage = '/storage/emulated/0/Android/data/app/cache/uni-media/Pic_1.jpg'
  const sandboxImage = 'file:///data/user/0/app/cacheuni-media/1792377957939.jpg'
  const stored = '/doc/inspection_media/1750000000000-1.jpg'
  const paths = await service.persistMediaPaths([
    { path: externalImage, mediaType: 'image' },
    { path: sandboxImage, mediaType: 'image' },
    { path: stored, mediaType: 'image' }
  ])

  assert.equal(paths[0], externalImage)
  assert.match(paths[1], /^\/doc\/inspection_media\/\d+-1\.jpg$/)
  assert.equal(paths[2], stored)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].srcPath, '/data/user/0/app/cacheuni-media/1792377957939.jpg')
  assert.equal(fake.calls[0].destPath, paths[1])
})

test('file:// prefixed sandbox paths are normalized before the copy', async () => {
  assert.equal(mediaModule.normalizeLocalFilePath('file:///data/user/0/app/cache/uni-media/a.jpg'), '/data/user/0/app/cache/uni-media/a.jpg')
  assert.equal(mediaModule.normalizeLocalFilePath('unifile://usr//inspection_media/a.jpg'), 'unifile://usr//inspection_media/a.jpg')
  assert.equal(mediaModule.normalizeLocalFilePath('  /tmp/a.jpg  '), '/tmp/a.jpg')

  const fake = createFakeCopyFile()
  const service = mediaModule.createMediaPersistenceService({
    copyFile: fake.copyFile,
    persistentDir: '/doc/inspection_media'
  })

  const saved = await service.persistMediaPath('file:///data/user/0/app/cacheuni-media/1792377957939.jpg', false)
  assert.match(saved, /^\/doc\/inspection_media\/\d+-1\.jpg$/)
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].srcPath, '/data/user/0/app/cacheuni-media/1792377957939.jpg')
})

test('app persistence service copies original bytes without re-encoding media', async () => {
  const service = await readFile('services/mediaPersistenceService.uts', 'utf8')
  // 压缩接口对超过 1.5MB 的照片会按 inSampleSize=2 采样，属于画质损失，不能再作为落盘通道。
  assert.doesNotMatch(service, /compressImage/)
  assert.doesNotMatch(service, /buildSandboxBridgeSourcePath/)
  assert.doesNotMatch(service, /moveIntoSandbox/)
  assert.match(service, /uni\.getFileSystemManager\(\)\.copyFile\(\{/)
  assert.match(service, /needsPersistentMediaCopy\(normalizedPath, dir\)/)
})