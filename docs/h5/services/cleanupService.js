import { listReports, removeReport } from '../db/dao/reportDao'
import { listAllPhotos, listPhotosByReport, removePhotoById, removePhotosByReport } from '../db/dao/photoDao'
import { REPORT_STATUS } from '../utils/constants'
import { getFileStat, removeFiles, removeReportImageDir } from '../utils/file'
import { getCleanupPolicy } from './settingsService'

function isExpired(report, now, maxDays) {
  const time = new Date(report.downloadAt || report.updatedAt || 0).getTime()
  if (!time) return false
  return now - time > maxDays * 24 * 60 * 60 * 1000
}

export async function cleanupSubmittedReportFiles(reportId) {
  const photos = await listPhotosByReport(reportId)
  await removeFiles((photos || []).map((x) => x.localPath))
  await removeReportImageDir(reportId)
  await removePhotosByReport(reportId)
}

export async function cleanupDraftReports(maxDays = 30) {
  const policy = getCleanupPolicy()
  if (!policy.enabled) return

  const reports = await listReports()
  const now = Date.now()
  const targets = (reports || []).filter((x) =>
    x.status !== REPORT_STATUS.SUBMITTED && isExpired(x, now, maxDays || policy.retentionDays)
  )
  for (const report of targets) {
    await cleanupSubmittedReportFiles(report.reportId)
    await removeReport(report.reportId)
  }

  await cleanupByCacheLimit(policy.maxCacheSizeMB)
}

export async function cleanupUnsubmittedDraftFiles() {
  const reports = await listReports()
  const targets = (reports || []).filter((x) => x.status !== REPORT_STATUS.SUBMITTED)
  for (const report of targets) {
    await cleanupSubmittedReportFiles(report.reportId)
  }
}

async function cleanupByCacheLimit(maxCacheSizeMB) {
  const maxBytes = Number(maxCacheSizeMB || 0) * 1024 * 1024
  if (!maxBytes) return

  const photos = await listAllPhotos()
  if (!photos?.length) return

  const enriched = []
  let totalBytes = 0
  for (const photo of photos) {
    const stat = await getFileStat(photo.localPath)
    totalBytes += stat.size
    enriched.push({
      ...photo,
      size: stat.size,
      touchedAt: stat.modifiedAt || 0
    })
  }
  if (totalBytes <= maxBytes) return

  const sorted = enriched.sort((a, b) => a.touchedAt - b.touchedAt)
  for (const photo of sorted) {
    await removeFiles([photo.localPath])
    await removePhotoById(photo.photoId)
    totalBytes -= Number(photo.size || 0)
    if (totalBytes <= maxBytes) break
  }
}
