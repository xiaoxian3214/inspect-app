export function getNetworkType() {
  return new Promise((resolve) => {
    uni.getNetworkType({
      success: ({ networkType }) => resolve(networkType),
      fail: () => resolve('none')
    })
  })
}

export async function isOnline() {
  const networkType = await getNetworkType()
  return networkType !== 'none'
}
