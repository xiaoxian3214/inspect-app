import { isOnline } from '../utils/network'
import { listReports, saveReport } from '../db/dao/reportDao'
import { submitReport, getOfflineReport } from './reportService'
import { REPORT_STATUS } from '../utils/constants'
import { validateForSubmit } from '../utils/validator'
import { t } from '../utils/i18n.js'

async function notifyLocal(title, content) {
  if (typeof plus === 'undefined' || !plus.push) return
  plus.push.createMessage(content, JSON.stringify({ title }), { title })
}

export async function syncPendingReports() {
  const online = await isOnline()
  if (!online) return
  const reports = await listReports()
  const targets = reports.filter((x) => x.status === REPORT_STATUS.DRAFT)

  for (const report of targets) {
    const bundle = await getOfflineReport(report.reportId)
    const valid = validateForSubmit(bundle || {})
    if (!valid.valid) continue
    try {
      await submitReport(report.reportId)
    } catch (error) {
      const retry = Number(report.syncRetry || 0) + 1
      const nextStatus = retry > 3 ? REPORT_STATUS.ERROR : REPORT_STATUS.DRAFT
      await saveReport({ ...report, syncRetry: retry, status: nextStatus })
      if (retry > 3) {
        await notifyLocal(t('同步失败'), t('报告 {orderNo} 同步失败超过 3 次', { orderNo: report.orderNo }))
      }
    }
  }
}
