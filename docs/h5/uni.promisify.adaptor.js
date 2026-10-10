if (uni.addInterceptor) {
  uni.addInterceptor({
    returnValue(res) {
      if (!(!!res && (typeof res === 'object' || typeof res === 'function') && typeof res.then === 'function')) {
        return res
      }
      return new Promise((resolve, reject) => {
        res.then(
          data => {
            if (Array.isArray(data)) {
              if (data[0]) {
                reject(data[0])
              } else {
                resolve(data[1])
              }
            } else {
              resolve(data)
            }
          },
          err => reject(err)
        )
      })
    }
  })
}
