export function isCheckPointPhoto(photo) {
  return photo?.bizType === 'checkPoint'
}

export function toChecklistPhotos(fileList) {
  if (!Array.isArray(fileList)) return []
  return fileList
    .map(file => {
      if (!file) return ''
      if (typeof file === 'string') return file
      const fileId = String(file?.fileId || file?.id || '').trim()
      const filePath = file?.url || file?.fileUrl || file?.filePath || file?.path || ''
      const thumbnailPath = file?.thumbnailPath || file?.thumbPath || ''
      if (!fileId && !filePath && !thumbnailPath) return ''
      const record = { fileId, filePath, thumbnailPath }
      if (file.bizType) record.bizType = file.bizType
      if (file.mediaType) record.mediaType = file.mediaType
      if (file.mimeType) record.mimeType = file.mimeType
      if (file.fileType) {
        record.fileType = file.fileType
        const normalizedFileType = String(file.fileType || '').toLowerCase()
        if (!record.mediaType) {
          if (normalizedFileType.startsWith('video/')) record.mediaType = 'video'
          else if (normalizedFileType.startsWith('image/')) record.mediaType = 'image'
        }
      }
      if (file.fileExt) record.fileExt = file.fileExt
      if (file.coverUrl) record.coverUrl = file.coverUrl
      if (file.duration) record.duration = file.duration
      if (!record.mediaType && !record.mimeType) {
        const path = String(filePath || '').toLowerCase()
        if (/\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/i.test(path)) {
          record.mediaType = 'video'
        }
      }
      return record
    })
    .filter(Boolean)
}

export function getMediaPhotos(photos) {
  return Array.isArray(photos) ? photos.filter(photo => !isCheckPointPhoto(photo)) : []
}

export function getCheckPointPhotos(photos) {
  return Array.isArray(photos) ? photos.filter(isCheckPointPhoto) : []
}

export function getOriginalPhotoIndex(photos, displayedPhotos, index) {
  if (!Array.isArray(photos) || !Array.isArray(displayedPhotos)) return -1
  if (index < 0 || index >= displayedPhotos.length) return -1
  return photos.indexOf(displayedPhotos[index])
}

export function mergeSortedMediaPhotos(photos, sortedMediaPhotos) {
  let nextIndex = 0
  return photos.map(photo => isCheckPointPhoto(photo) ? photo : sortedMediaPhotos[nextIndex++])
}
