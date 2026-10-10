import SparkMD5 from 'spark-md5'

export function md5String(content) {
  return SparkMD5.hash(content || '')
}

export function md5ArrayBuffer(buffer) {
  return SparkMD5.ArrayBuffer.hash(buffer)
}

export function md5FilePath(filePath) {
  return new Promise((resolve) => {
    if (typeof plus === 'undefined' || !plus.io) {
      resolve(md5String(filePath || ''))
      return
    }
    plus.io.resolveLocalFileSystemURL(
      filePath,
      (entry) => {
        entry.file((file) => {
          const reader = new plus.io.FileReader()
          reader.onloadend = (e) => resolve(md5ArrayBuffer(e.target.result))
          reader.onerror = () => resolve(md5String(filePath || ''))
          reader.readAsArrayBuffer(file)
        }, () => resolve(md5String(filePath || '')))
      },
      () => resolve(md5String(filePath || ''))
    )
  })
}
