import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const apiModule = await loadUtsModule('api/reportFileApi.uts')

/** 裸 /storage 原生路径不能直接给 uni.uploadFile，否则被当成项目相对路径拼到 apps/.../www/storage。 */
test('Android camera absolute file paths use file URI in native upload transport', async () => {
  const uploads = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null }, baseUrl: 'https://example.com',
    uploadTransport: async (request) => { uploads.push(request); return { statusCode: 200, data: { code: 200, data: { fileId: 'saved' } } } }
  })
  const path = '/storage/emulated/0/Android/data/uni.app.UNI1FFA0B1/cache/uni-media/Pic_1792402502873.jpg'
  await api.uploadInspectFile(path, { bizId: 'item-1', bizType: 'checkResult' })
  assert.equal(uploads[0].filePath, `file://${path}`)
  assert.equal(apiModule.normalizeUploadLocalPath('file:///storage/emulated/0/a.jpg'), 'file:///storage/emulated/0/a.jpg')
  assert.equal(apiModule.normalizeUploadLocalPath('unifile://cache/uni-media/a.jpg'), 'unifile://cache/uni-media/a.jpg')
  assert.equal(apiModule.normalizeUploadLocalPath('/local/photo.jpg'), '/local/photo.jpg')
})

test('uploads local files with auth and inspection metadata', async () => {
  const uploads = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com/',
    getSession: () => ({ token: 'token-1' }),
    uploadTransport: async (request) => {
      uploads.push(request)
      return { data: { code: 200, data: { fileId: 'file-1' } }, statusCode: 200 }
    }
  })

  const result = await api.uploadInspectFile('/local/photo.jpg', {
    bizId: 'plan-1',
    bizType: 'CHECK_ITEM',
    subGoodsNo: 'SKU-1',
    sortNo: 2
  })

  assert.deepEqual(result, { fileId: 'file-1' })
  assert.equal(uploads[0].url, 'https://example.com/api/inspect/file/upload')
  assert.equal(uploads[0].filePath, '/local/photo.jpg')
  assert.deepEqual(uploads[0].header, { Authorization: 'Bearer token-1' })
  assert.deepEqual(uploads[0].formData, {
    bizId: 'plan-1',
    bizType: 'CHECK_ITEM',
    subGoodsNo: 'SKU-1',
    sortNo: '2'
  })
})

/** 无本地路径的图片通过 H5 fileId 路径鉴权下载，返回给原生 image 可展示的临时文件。 */
test('downloads a remote inspection image with bearer auth', async () => {
  const downloads = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null }, baseUrl: 'https://example.com/qcm/',
    getSession: () => ({ token: 'token-1' }), uploadTransport: async () => null,
    downloadTransport: async (request) => { downloads.push(request); return { statusCode: 200, tempFilePath: '/tmp/file-1.jpg' } }
  })
  assert.equal(await api.downloadInspectFile('file 1', 'thumbnail'), '/tmp/file-1.jpg')
  assert.deepEqual(downloads[0].header, { Authorization: 'Bearer token-1' })
  assert.equal(downloads[0].url, 'https://example.com/qcm/api/inspect/file/file%201/thumbnail')
  assert.equal(await api.downloadInspectFile('file 1', 'preview'), '/tmp/file-1.jpg')
  assert.match(downloads[1].url, /\/preview$/)
})

/** 图片预览鉴权失效时使用上传通道相同的会话失效守卫。 */
test('routes unauthorized inspection image download to the auth guard', async () => {
  const calls = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null }, baseUrl: 'https://example.com',
    getSession: () => ({ token: 'expired' }), uploadTransport: async () => null,
    downloadTransport: async () => ({ statusCode: 401 }),
    onAuthFailure: async (failure) => { calls.push(failure); throw new Error(failure.fallbackMessage) }
  })
  await assert.rejects(() => api.downloadInspectFile('file-1'), /登录已过期/)
  assert.equal(calls[0].url, '/api/inspect/file/file-1/thumbnail')
})

test('preserves http status on upload errors for retry classification', async () => {
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com',
    getSession: () => null,
    uploadTransport: async () => ({ data: JSON.stringify({ message: 'server boom' }), statusCode: 500 })
  })

  await assert.rejects(
    () => api.uploadInspectFile('/local/photo.jpg', { bizId: 'r-1', bizType: 'defect' }),
    (error) => error.httpStatus === 500 && /server boom/.test(error.message)
  )
})

test('triggers the auth guard on upload HTTP 401', async () => {
  const guardCalls = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com',
    getSession: () => ({ token: 'expired' }),
    onAuthFailure: async (failure) => {
      guardCalls.push(failure)
      throw new Error(failure.fallbackMessage)
    },
    uploadTransport: async () => ({ data: JSON.stringify({ message: 'token expired' }), statusCode: 401 })
  })

  await assert.rejects(
    () => api.uploadInspectFile('/local/photo.jpg', { bizId: 'r-1', bizType: 'defect' }),
    /登录已过期，请重新登录/
  )
  assert.deepEqual(guardCalls, [{ url: '/api/inspect/file/upload', fallbackMessage: '登录已过期，请重新登录' }])
})

test('triggers the auth guard on upload missing-token business responses', async () => {
  const guardCalls = []
  const api = apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com',
    getSession: () => ({ token: 'expired' }),
    onAuthFailure: async (failure) => {
      guardCalls.push(failure)
      throw new Error(failure.fallbackMessage)
    },
    uploadTransport: async () => ({ data: JSON.stringify({ code: 401, message: '请先登录' }), statusCode: 200 })
  })

  await assert.rejects(
    () => api.uploadInspectFile('/local/photo.jpg', { bizId: 'r-1', bizType: 'defect' }),
    /登录已失效，请重新登录/
  )
  assert.equal(guardCalls.length, 1)
})

test('uses H5 endpoints for delete sort and move', async () => {
  const requests = []
  const api = apiModule.createReportFileApi({
    apiClient: {
      request: async (request) => {
        requests.push(request)
        return { ok: true }
      }
    },
    baseUrl: 'https://example.com',
    getSession: () => null,
    uploadTransport: async () => null
  })

  await api.deleteInspectFile('file 1')
  const sorted = [
    { fileId: '2108766832914706433', sortNo: 1 },
    { fileId: '2108766832725962754', sortNo: 2 },
    { fileId: '2108766832939872258', sortNo: 3 },
    { fileId: '2108766834466598914', sortNo: 4 }
  ]
  await api.sortInspectFiles(sorted)
  await api.moveInspectFile({ fileId: 'file-1', targetBizId: 'item-2' })

  assert.equal(requests[0].url, '/api/inspect/file/delete/file%201')
  assert.equal(requests[1].url, '/api/inspect/file/sort')
  assert.deepEqual(requests[1].data, { items: sorted })
  assert.equal(requests[2].url, '/api/inspect/file/move')
})
