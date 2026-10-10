export function resolveImageUploadConcurrency({
  networkType = '',
  effectiveType = '',
  downlink = 0,
  rtt = 0
} = {}) {
  const network = String(networkType || '').toLowerCase()
  const effective = String(effectiveType || '').toLowerCase()
  const measuredDownlink = Number(downlink || 0)
  const measuredRtt = Number(rtt || 0)
  if (network === 'none') return 0
  if (
    network === '2g'
    || network === '3g'
    || effective === 'slow-2g'
    || effective === '2g'
    || (measuredDownlink > 0 && measuredDownlink <= 0.5)
    || measuredRtt >= 800
  ) return 1

  if (
    network === '4g'
    || effective === '3g'
    || (measuredDownlink > 0 && measuredDownlink < 2)
    || measuredRtt >= 300
  ) return 2

  return 4
}

function getUniNetworkType() {
  if (typeof uni === 'undefined' || typeof uni.getNetworkType !== 'function') {
    return Promise.resolve('')
  }
  return new Promise((resolve) => {
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType || ''),
      fail: () => resolve('')
    })
  })
}

export async function detectImageUploadConcurrency() {
  const networkType = await getUniNetworkType()
  const connection = typeof navigator !== 'undefined'
    ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
    : null
  return Math.max(1, resolveImageUploadConcurrency({
    networkType,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt
  }))
}
