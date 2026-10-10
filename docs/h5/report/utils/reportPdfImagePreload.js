import { isCheckPointPhoto } from './checkPointMedia.js'

export function isPdfImagePreloadEnabled(query = {}) {
  return query?.pdf === '1'
}

export function getReportImageLoadingMode(query = {}) {
  return isPdfImagePreloadEnabled(query) ? 'eager' : 'lazy'
}

export function collectReportImageUrls(
  { defects = [], checklistData = {} } = {},
  { getUrl, isVideo } = {}
) {
  if (typeof getUrl !== 'function' || typeof isVideo !== 'function') return []

  const photos = [
    ...(Array.isArray(defects) ? defects : []).flatMap((defect) => defect?.photos || []),
    ...Object.values(checklistData || {}).flatMap((item) => item?.photos || [])
  ]

  return [...new Set(
    photos
      .filter((photo) => photo && !isCheckPointPhoto(photo) && !isVideo(photo))
      .map((photo) => String(getUrl(photo) || '').trim())
      .filter(Boolean)
  )]
}

export function preloadImageUrls(
  urls = [],
  { createImage, timeoutMs = 15000 } = {}
) {
  const imageFactory = createImage || (
    typeof Image === 'function' ? () => new Image() : null
  )
  if (!imageFactory) return Promise.resolve([])

  const uniqueUrls = [...new Set(
    (Array.isArray(urls) ? urls : [])
      .map((url) => String(url || '').trim())
      .filter(Boolean)
  )]

  return Promise.all(uniqueUrls.map((url) => new Promise((resolve) => {
    const image = imageFactory()
    let settled = false
    const finish = (status) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve({ url, status })
    }
    const timer = setTimeout(() => finish('timeout'), timeoutMs)
    image.onload = () => finish('loaded')
    image.onerror = () => finish('error')
    image.loading = 'eager'
    image.src = url
  })))
}
