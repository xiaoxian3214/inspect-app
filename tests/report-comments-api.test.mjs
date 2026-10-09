import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const apiModule = await loadUtsModule('api/reportCommentsApi.uts')

test('lists comments by report via H5 endpoint', async () => {
  const requests = []
  const api = apiModule.createReportCommentsApi({
    request: async (request) => {
      requests.push(request)
      return [{ id: 'c-1' }]
    }
  })

  const rows = await api.listCommentsByReport('r-1')

  assert.deepEqual(rows, [{ id: 'c-1' }])
  assert.equal(requests[0].url, '/api/reports/comments/by-report/r-1')
  assert.equal(requests[0].method, 'GET')
  assert.deepEqual(await api.listCommentsByReport('  '), [])
  assert.equal(requests.length, 1)
})

test('creates comment with report target and optional parent', async () => {
  const requests = []
  const api = apiModule.createReportCommentsApi({
    request: async (request) => {
      requests.push(request)
      return { id: 'c-2' }
    }
  })

  const created = await api.createReportComment({ reportId: 'r-1', content: 'hello', parentId: 'c-1' })

  assert.deepEqual(created, { id: 'c-2' })
  assert.equal(requests[0].url, '/api/reports/comments')
  assert.equal(requests[0].method, 'POST')
  assert.deepEqual(requests[0].data, {
    reportId: 'r-1',
    targetType: 'REPORT',
    targetId: 'r-1',
    parentId: 'c-1',
    content: 'hello'
  })

  await api.createReportComment({ reportId: 'r-1', content: 'root comment' })
  assert.equal(requests[1].data.parentId, null)
  assert.notEqual(requests[0].key, requests[1].key)
})

test('rejects invalid create or delete inputs like H5', async () => {
  const api = apiModule.createReportCommentsApi({ request: async () => ({}) })

  await assert.rejects(() => api.createReportComment({ reportId: '', content: 'x' }), /缺少报告ID/)
  await assert.rejects(() => api.createReportComment({ reportId: 'r-1', content: ' ' }), /评论内容不能为空/)
  await assert.rejects(() => api.deleteReportComment(''), /缺少评论ID/)
})

test('deletes comment via H5 endpoint', async () => {
  const requests = []
  const api = apiModule.createReportCommentsApi({
    request: async (request) => {
      requests.push(request)
      return { success: true }
    }
  })

  const result = await api.deleteReportComment('c/1')

  assert.deepEqual(result, { success: true })
  assert.equal(requests[0].url, '/api/reports/comments/c%2F1')
  assert.equal(requests[0].method, 'DELETE')
})
