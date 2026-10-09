import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const authModule = await loadUtsModule('services/authService.uts')
const repositoryModule = await loadUtsModule('repositories/userRepository.uts')
const memoryModule = await loadUtsModule('database/memoryDatabase.uts')

test('normalizes H5 login response and stores the session', async () => {
  const database = memoryModule.createMemoryDatabase()
  const userRepository = repositoryModule.createUserRepository(database)
  const authService = authModule.createAuthService({
    authApi: {
      login: async () => ({
        accessToken: 'token-1',
        refreshToken: 'refresh-1',
        userId: 12,
        username: 'inspector',
        realName: '验货员',
        roles: ['inspector'],
        expiresIn: 3600
      })
    },
    userRepository,
    isOnline: async () => true,
    now: () => 1_000
  })

  const session = await authService.login({ userName: 'inspector', password: 'secret' })

  assert.equal(session.userId, '12')
  assert.equal(session.token, 'token-1')
  assert.equal(session.userName, 'inspector')
  assert.equal(session.realName, '验货员')
  assert.equal(session.expireAt, new Date(3_601_000).toISOString())
  assert.deepEqual(await userRepository.getLastSession(), session)
})

test('uses the latest local session when offline', async () => {
  const database = memoryModule.createMemoryDatabase({
    user: [{ userId: 'u-1', userName: 'offline-user', token: 'cached-token' }]
  })
  const userRepository = repositoryModule.createUserRepository(database)
  const authService = authModule.createAuthService({
    authApi: { login: async () => assert.fail('online login must not run') },
    userRepository,
    isOnline: async () => false
  })

  const session = await authService.login({ userName: 'offline-user', password: 'ignored' })
  assert.equal(session.token, 'cached-token')
})

test('rejects offline login when no cached identity exists', async () => {
  const database = memoryModule.createMemoryDatabase()
  const userRepository = repositoryModule.createUserRepository(database)
  const authService = authModule.createAuthService({
    authApi: { login: async () => ({}) },
    userRepository,
    isOnline: async () => false
  })

  await assert.rejects(
    authService.login({ userName: 'new-user', password: 'secret' }),
    /无可用离线身份/
  )
})

test('restores and clears local sessions', async () => {
  const database = memoryModule.createMemoryDatabase({
    user: [{ userId: 'u-1', token: 'token-1' }]
  })
  const userRepository = repositoryModule.createUserRepository(database)
  const authService = authModule.createAuthService({
    authApi: { login: async () => ({}) },
    userRepository,
    isOnline: async () => true
  })

  assert.equal((await authService.restoreSession()).userId, 'u-1')
  await authService.logout()
  assert.equal(await authService.restoreSession(), null)
})
