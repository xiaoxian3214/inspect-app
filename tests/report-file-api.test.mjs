import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const apiModule = await loadUtsModule('api/reportFileApi.uts')

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
  await api.sortInspectFiles([{ fileId: 'file-1', sortNo: 1 }])
  await api.moveInspectFile({ fileId: 'file-1', targetBizId: 'item-2' })

  assert.equal(requests[0].url, '/api/inspect/file/delete/file%201')
  assert.deepEqual(requests[1].data, { items: [{ fileId: 'file-1', sortNo: 1 }] })
  assert.equal(requests[2].url, '/api/inspect/file/move')
})
