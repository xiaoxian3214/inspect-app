import { BASE_IMAGE_DIR } from './constants'
import { t } from './i18n.js'

function getFs() {
  if (typeof plus === 'undefined' || !plus.io) return null
  return plus.io
}

export function ensureDir(path) {
  return new Promise((resolve, reject) => {
    const fs = getFs()
    if (!fs) {
      resolve(path)
      return
    }
    fs.resolveLocalFileSystemURL(path, () => resolve(path), () => {
      fs.resolveLocalFileSystemURL('_doc/', (root) => {
        root.getDirectory(path.replace('_doc/', ''), { create: true }, () => resolve(path), reject)
      }, reject)
    })
  })
}

export async function ensureReportImageDir(reportId) {
  const dir = `${BASE_IMAGE_DIR}/${reportId}`
  await ensureDir(dir)
  return dir
}

export function joinRelativePath(reportId, fileName) {
  return `${BASE_IMAGE_DIR}/${reportId}/${fileName}`
}

export function toAbsolutePath(relativePath) {
  if (!relativePath) return ''
  if (relativePath.startsWith('_doc/')) {
    return relativePath
  }
  return `_doc/${relativePath}`
}

export function removeFile(path) {
  return new Promise((resolve) => {
    const fs = getFs()
    if (!fs) {
      resolve()
      return
    }
    fs.resolveLocalFileSystemURL(path, (entry) => {
      entry.remove(() => resolve(), () => resolve())
    }, () => resolve())
  })
}

export async function removeFiles(paths = []) {
  for (const path of paths) {
    await removeFile(toAbsolutePath(path))
  }
}

export function removeDirectory(path) {
  return new Promise((resolve) => {
    const fs = getFs()
    if (!fs) {
      resolve()
      return
    }
    fs.resolveLocalFileSystemURL(path, (entry) => {
      entry.removeRecursively(() => resolve(), () => resolve())
    }, () => resolve())
  })
}

export async function removeReportImageDir(reportId) {
  const dir = `${BASE_IMAGE_DIR}/${reportId}`
  await removeDirectory(toAbsolutePath(dir))
}

export function getFileStat(path) {
  return new Promise((resolve) => {
    const fs = getFs()
    if (!fs) {
      resolve({ size: 0, modifiedAt: 0 })
      return
    }
    fs.resolveLocalFileSystemURL(
      toAbsolutePath(path),
      (entry) => {
        entry.getMetadata(
          (meta) => {
            const modifiedAt = new Date(meta.modificationTime || 0).getTime() || 0
            resolve({ size: Number(meta.size || 0), modifiedAt })
          },
          () => resolve({ size: 0, modifiedAt: 0 })
        )
      },
      () => resolve({ size: 0, modifiedAt: 0 })
    )
  })
}

export function saveImageToReportDir({ tempPath, reportId, itemId }) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!tempPath) throw new Error(t('无有效图片路径'))
      const dir = await ensureReportImageDir(reportId)
      const fileName = `${reportId}_${itemId}_${Date.now()}.jpg`
      const relative = joinRelativePath(reportId, fileName)
      const absolute = toAbsolutePath(relative)

      if (typeof plus === 'undefined' || !plus.io) {
        uni.saveFile({
          tempFilePath: tempPath,
          success: (res) => resolve({ relativePath: res.savedFilePath, absolutePath: res.savedFilePath, fileName }),
          fail: reject
        })
        return
      }

      plus.io.resolveLocalFileSystemURL(tempPath, (entry) => {
        plus.io.resolveLocalFileSystemURL(dir, (targetDir) => {
          entry.copyTo(
            targetDir,
            fileName,
            () => resolve({ relativePath: relative, absolutePath: absolute, fileName }),
            reject
          )
        }, reject)
      }, reject)
    } catch (error) {
      reject(error)
    }
  })
}
