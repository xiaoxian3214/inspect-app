import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const clientModule = await loadUtsModule('api/apiClient.uts')

test('routes requests through the queue with auth and language headers', async () => {
  const queued = []
  const transported = []
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com/qcm/',
    queue: {
      enqueue(task) {
        queued.push({ key: task.key, priority: task.priority })
        return task.execute()
      }
    },
    transport: async (request) => {
      transported.push(request)
      return { statusCode: 200, data: { code: 200, data: { ok: true } } }
    },
    getSession: () => ({ token: 'token-1' }),
    getLanguage: () => 'zh'
  })

  const result = await client.request({
    url: '/api/plans/search',
    method: 'POST',
    query: { current: 1 },
    data: { status: 0 },
    key: 'plans:0',
    priority: 5
  })

  assert.deepEqual(queued, [{ key: 'plans:0', priority: 5 }])
  assert.equal(transported[0].url, 'https://example.com/qcm/api/plans/search?language=zh&current=1')
  assert.equal(transported[0].headers.Authorization, 'Bearer token-1')
  assert.deepEqual(result, { ok: true })
})

test('normalizes backend and HTTP failures', async () => {
  const queue = { enqueue: (task) => task.execute() }
  const backendClient = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue,
    transport: async () => ({ statusCode: 200, data: { code: 500, message: '业务失败' } })
  })
  await assert.rejects(backendClient.request({ url: '/api/test' }), /业务失败/)

  const httpClient = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue,
    transport: async () => ({ statusCode: 401, data: { message: '登录失效' } })
  })
  await assert.rejects(httpClient.request({ url: '/api/test' }), /登录失效/)
})
