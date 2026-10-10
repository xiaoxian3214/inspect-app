import assert from 'node:assert/strict'
import { shouldFastEnterApp, shouldShowLoginFallback } from '../utils/startupState.js'
import { resolveBackAction } from '../utils/navigation.js'

assert.equal(shouldFastEnterApp({ isLoggedIn: true, accessToken: 'token' }), true)
assert.equal(shouldFastEnterApp({ isLoggedIn: false, accessToken: 'token' }), true)
assert.equal(shouldFastEnterApp({ isLoggedIn: false, accessToken: '' }), false)

global.localStorage = {
  getItem(key) {
    if (key === 'access_token') return ''
    return null
  }
}
assert.equal(shouldFastEnterApp({ isLoggedIn: true, accessToken: 'stale-token' }), false)
delete global.localStorage

assert.equal(shouldShowLoginFallback({ isInDingTalk: false, redirected: false, error: null }), true)
assert.equal(shouldShowLoginFallback({ isInDingTalk: true, redirected: false, error: new Error('sdk timeout') }), true)
assert.equal(shouldShowLoginFallback({ isInDingTalk: true, redirected: true, error: null }), false)

assert.deepEqual(resolveBackAction({ pageCount: 2, fallbackUrl: '/pages/report/list' }), {
  type: 'navigateBack',
  delta: 1
})
assert.deepEqual(resolveBackAction({ pageCount: 1, fallbackUrl: '/pages/report/list' }), {
  type: 'reLaunch',
  url: '/pages/report/list'
})
assert.deepEqual(resolveBackAction({ pageCount: 0, fallbackUrl: '/pages/report/list' }), {
  type: 'reLaunch',
  url: '/pages/report/list'
})
