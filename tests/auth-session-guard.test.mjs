import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const clientModule = await loadUtsModule('api/apiClient.uts')
const guardModule = await loadUtsModule('services/authSessionGuard.uts')

function createRecorder(now) {
  const effects = []
  return {
    effects,
    userRepository: {
      clearSession: async () => effects.push('clear-session')
    },
    redirectToLoginPage: () => effects.push('redirect-login')
  }
}

test('clears session and redirects once for HTTP 401', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage, now: () => 1000 }).handleAuthFailure
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 401, data: { message: '令牌失效' } }),
    onAuthFailure
  })

  await assert.rejects(client.request({ url: '/api/plans/search' }), /登录已过期，请重新登录/)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(effects, ['clear-session', 'redirect-login'])
})

test('clears session and redirects once for missing-token business responses', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage }).handleAuthFailure
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 200, data: { code: 401, message: '请先登录' } }),
    onAuthFailure
  })

  await assert.rejects(client.request({ url: '/api/reports/comments/by-report/r-1' }), /登录已失效，请重新登录/)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(effects, ['clear-session', 'redirect-login'])
})

test('redirect only once within the cooldown window even for parallel failures', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  let clock = 1000
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage, now: () => clock }).handleAuthFailure
  const transport = async (request) => ({ statusCode: 401, data: { message: '令牌失效' } })
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport,
    onAuthFailure
  })

  await Promise.allSettled([
    client.request({ url: '/api/plans/search' }),
    client.request({ url: '/api/plans/detail' })
  ])
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(effects.filter((item) => item === 'clear-session').length, 2)
  assert.equal(effects.filter((item) => item === 'redirect-login').length, 1)
})

test('auth endpoints report failure without clearing session or redirecting', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage }).handleAuthFailure
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 401, data: { message: '账号或密码错误' } }),
    onAuthFailure
  })

  await assert.rejects(client.request({ url: '/api/auth/login', method: 'POST' }), /登录已过期，请重新登录/)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(effects, [])
})

test('redirect cooldown elapses allowing a later redirect', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  let clock = 1000
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage, now: () => clock }).handleAuthFailure
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 401, data: { message: '令牌失效' } }),
    onAuthFailure
  })

  await assert.rejects(client.request({ url: '/api/plans/first' }), /登录已过期/)
  clock += 900
  await assert.rejects(client.request({ url: '/api/plans/second' }), /登录已过期/)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(effects.filter((item) => item === 'redirect-login').length, 2)
})

test('redirects even when clearing the session fails', async () => {
  const { effects, redirectToLoginPage } = createRecorder()
  const userRepository = {
    clearSession: async () => { throw new Error('db locked') }
  }
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage }).handleAuthFailure
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue: { enqueue: (task) => task.execute() },
    transport: async () => ({ statusCode: 401, data: { message: '令牌失效' } }),
    onAuthFailure
  })

  await assert.rejects(client.request({ url: '/api/plans/search' }), /登录已过期，请重新登录/)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(effects, ['redirect-login'])
})

test('guards run even when the api client swallows the queue rejection', async () => {
  const { effects, userRepository, redirectToLoginPage } = createRecorder()
  const onAuthFailure = guardModule.createAuthSessionGuard({ userRepository, redirectToLoginPage }).handleAuthFailure
  const queue = {
    enqueue(task) {
      task.execute().catch(() => {})
      return Promise.resolve(null)
    }
  }
  const client = clientModule.createApiClient({
    baseUrl: 'https://example.com',
    queue,
    transport: async () => ({ statusCode: 401, data: { message: '令牌失效' } }),
    onAuthFailure
  })

  await client.request({ url: '/api/plans/search' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(effects, ['clear-session', 'redirect-login'])
})
