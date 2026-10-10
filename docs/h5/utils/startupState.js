function getPersistedAccessToken() {
  try {
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      return uni.getStorageSync('access_token') || ''
    }
  } catch {}

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem('access_token') || ''
    }
  } catch {}

  return null
}

export function shouldFastEnterApp(authState = {}) {
  const persistedAccessToken = getPersistedAccessToken()
  if (persistedAccessToken !== null) {
    return !!persistedAccessToken
  }
  return !!(authState?.isLoggedIn || authState?.accessToken)
}

export function shouldShowLoginFallback({ isInDingTalk = false, redirected = false, error = null } = {}) {
  if (redirected) return false
  if (!isInDingTalk) return true
  return !!error
}
