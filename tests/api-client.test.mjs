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

/** 顶层 code=200 不应丢失 data 中按目标统计的批量复制失败信息。 */
test('keeps per-target copy failures inside a successful API envelope', async () => {
  const batchResult = {
    successCount: 0, failCount: 4, message: '批量复制完成：成功0个，失败4个',
    results: [{ targetPlanId: 'target-1', success: false, errorMessage: '目标检查项与源检查项不属于同一验货计划' }]
  }
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com/qcm',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 200, data: { code: 200, success: true, message: '操作成功', data: batchResult } })
  })
  assert.deepEqual(await client.request({ url: '/api/plans/copy-items', method: 'POST' }), batchResult)
})

/** 开发环境打印真实请求和响应，同时隐藏凭据字段及 URL 中的令牌。 */
test('native transport logs sanitized request parameters and response data in development', async () => {
  const previousEnvironment = process.env.NODE_ENV
  const previousUni = globalThis.uni
  const previousLog = console.log
  const entries = []
  process.env.NODE_ENV = 'development'
  console.log = (...args) => entries.push(args)
  globalThis.uni = {
    request(options) {
      options.success({ statusCode: 200, data: { list: [{ id: 'file-1' }], token: 'server-secret' } })
    }
  }
  try {
    const response = await clientModule.createUniTransport()({
      url: 'https://example.com/listData?folderId=123&access_token=url-secret',
      method: 'POST',
      data: { pageNo: 1, password: 'client-secret', nested: { accessToken: 'nested-secret' } },
      headers: { Authorization: 'Bearer header-secret' }
    })
    assert.equal(response.data.list[0].id, 'file-1')
    assert.match(JSON.stringify(entries), /folderId=123|pageNo/)
    assert.match(JSON.stringify(entries), /file-1/)
    assert.match(JSON.stringify(entries.find((entry) => entry[0] === '【返回结果】')), /listData\?folderId=123/)
    assert.doesNotMatch(JSON.stringify(entries), /client-secret|nested-secret|server-secret|url-secret|header-secret/)
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnvironment
    globalThis.uni = previousUni
    console.log = previousLog
  }
})

/** 正式构建不输出请求参数或响应数据。 */
test('native transport does not log request or response data in production', async () => {
  const previousEnvironment = process.env.NODE_ENV
  const previousUni = globalThis.uni
  const previousLog = console.log
  const entries = []
  process.env.NODE_ENV = 'production'
  console.log = (...args) => entries.push(args)
  globalThis.uni = { request(options) { options.success({ statusCode: 200, data: { ok: true } }) } }
  try {
    await clientModule.createUniTransport()({ url: 'https://example.com/api/test', data: { id: 1 } })
    assert.deepEqual(entries, [])
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnvironment
    globalThis.uni = previousUni
    console.log = previousLog
  }
})
