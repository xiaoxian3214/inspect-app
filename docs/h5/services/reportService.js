import { request } from '../utils/http'
import { isOnline } from '../utils/network'
import { saveReport, listReports, getReportById } from '../db/dao/reportDao'
import { upsertChecklistItems, listChecklistByReport } from '../db/dao/checklistDao'
import { listDefectByReport } from '../db/dao/defectDao'
import { listPhotosByReport } from '../db/dao/photoDao'
import { REPORT_STATUS } from '../utils/constants'
import { validateForSubmit } from '../utils/validator'
import { insertSyncLog } from '../db/dao/syncLogDao'
import { uploadPhotosForReport } from './uploadService'
import { cleanupSubmittedReportFiles } from './cleanupService'
import { t } from '../utils/i18n.js'
import { prefetchDefectTierTreeCache } from '../api/defect.js'

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function normalizePlanRow(plan) {
  const status = Number(plan.status)
  return {
    reportId: String(plan.id),
    orderNo: plan.domeNo || plan.clientOrderNo || '',
    productName: plan.goodsName || plan.goodsCname || '',
    status: status === 2 ? REPORT_STATUS.SUBMITTED : (status === 1 ? REPORT_STATUS.DRAFT : REPORT_STATUS.NEW),
    lockStatus: plan.inspectorId ? 'LOCKED' : 'UNLOCKED',
    lockerId: plan.inspectorId || '',
    raw: plan
  }
}

export async function fetchReportList() {
  const online = await isOnline()
  if (online) {
    const pageData = await request({
      url: '/api/plans',
      method: 'GET',
      query: { current: 1, size: 50 }
    })
    return (pageData?.records || []).map(normalizePlanRow)
  }
  return listReports()
}

export async function downloadReport(report, currentUserId) {
  if (report.lockStatus === 'LOCKED' && report.lockerId && report.lockerId !== currentUserId) {
    throw new Error(t('报告正在被其他质检员验货'))
  }
  const data = await request({
    url: `/api/plans/${report.reportId}/download`,
    method: 'POST',
    query: {
      inspectorId: currentUserId,
      inspectorName: currentUserId
    }
  })
  const detail = data?.plan ? data : { plan: data, standardItems: data?.standardItems || [] }
  const reportRow = {
    reportId: report.reportId,
    orderNo: detail.plan?.domeNo || report.orderNo,
    productName: detail.plan?.goodsName || report.productName,
    jsonData: JSON.stringify(detail),
    downloadAt: new Date().toISOString(),
    lockExpireAt: '',
    status: REPORT_STATUS.DRAFT,
    lockStatus: 'LOCKED',
    lockerId: currentUserId,
    syncRetry: 0
  }
  await saveReport(reportRow)
  const sourceItems = detail.standardItems || detail.itemResults || []
  const items = sourceItems.map((item) => ({
    itemId: item.itemId || uid('item'),
    reportId: report.reportId,
    skuNo: item.itemNo || item.skuNo || item.itemName || '',
    qty: item.qty || 0,
    checkedQty: item.checkedQty || 0,
    passQty: item.passQty || 0,
    defectQty: item.defectQty || 0,
    updatedAt: new Date().toISOString()
  }))
  await upsertChecklistItems(items)
  await prefetchDefectTierTreeCache()
  return reportRow
}

export async function getOfflineReport(reportId) {
  const report = await getReportById(reportId)
  if (!report) return null
  const checklist = await listChecklistByReport(reportId)
  const defects = await listDefectByReport(reportId)
  const photos = await listPhotosByReport(reportId)
  return { report, checklist, defects, photos }
}

export async function submitReport(reportId) {
  const bundle = await getOfflineReport(reportId)
  if (!bundle?.report) {
    throw new Error(t('本地报告不存在'))
  }
  const validation = validateForSubmit(bundle)
  if (!validation.valid) {
    throw new Error(validation.message)
  }
  try {
    const uploadResults = await uploadPhotosForReport(bundle.photos || [], {})
    const failed = uploadResults.filter((x) => !x.ok)
    if (failed.length) {
      throw new Error(t('有 {count} 张照片上传失败', { count: failed.length }))
    }

    await request({
      url: `/api/plans/${reportId}/submit`,
      method: 'PUT',
      data: {
        id: reportId,
        inspectedQty: bundle.checklist.reduce((sum, x) => sum + Number(x.checkedQty || 0), 0),
        passQty: bundle.checklist.reduce((sum, x) => sum + Number(x.passQty || 0), 0),
        rejectQty: bundle.checklist.reduce((sum, x) => sum + Number(x.defectQty || 0), 0),
        remark: (() => {
          try {
            return JSON.parse(bundle.report.jsonData || '{}').remark || ''
          } catch {
            return ''
          }
        })()
      }
    })
    await saveReport({ ...bundle.report, status: REPORT_STATUS.SUBMITTED })
    await cleanupSubmittedReportFiles(reportId)
  } catch (error) {
    await insertSyncLog({
      id: uid('sync'),
      reportId,
      action: 'submit_report',
      errorMessage: error.message,
      retryCount: Number(bundle.report.syncRetry || 0) + 1,
      createdAt: new Date().toISOString()
    })
    throw error
  }
}
