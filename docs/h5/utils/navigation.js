const DEFAULT_FALLBACK_URL = '/pages/report/list'

export function resolveBackAction({ pageCount = 0, fallbackUrl = DEFAULT_FALLBACK_URL, delta = 1 } = {}) {
  const normalizedDelta = Math.max(1, Number(delta) || 1)
  if (Number(pageCount || 0) > normalizedDelta) {
    return { type: 'navigateBack', delta: normalizedDelta }
  }
  return { type: 'reLaunch', url: fallbackUrl || DEFAULT_FALLBACK_URL }
}

export function safeBack(options = {}) {
  const fallbackUrl = options.fallbackUrl || DEFAULT_FALLBACK_URL
  const delta = Math.max(1, Number(options.delta) || 1)
  let pageCount = 0
  try {
    if (typeof getCurrentPages === 'function') {
      const pages = getCurrentPages()
      pageCount = Array.isArray(pages) ? pages.length : 0
    }
  } catch {}

  const action = resolveBackAction({ pageCount, fallbackUrl, delta })
  if (typeof uni === 'undefined') return action

  if (action.type === 'navigateBack' && typeof uni.navigateBack === 'function') {
    uni.navigateBack({ delta: action.delta })
    return action
  }

  if (typeof uni.reLaunch === 'function') {
    uni.reLaunch({ url: action.url })
    return action
  }

  if (typeof uni.redirectTo === 'function') {
    uni.redirectTo({ url: action.url })
  }
  return action
}
