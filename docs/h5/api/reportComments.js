import { del, get, post } from './request.js'

const TARGET_TYPE = 'REPORT'
const BASE_PATH = '/api/reports/comments'

export async function listTargetCommentTree({ targetId, targetType = TARGET_TYPE } = {}) {
  const normalizedTargetId = String(targetId || '').trim()
  if (!normalizedTargetId) return []
  const response = await get(BASE_PATH, {
    targetType,
    targetId: normalizedTargetId
  })
  return response?.data ?? []
}

export async function createReportComment({ reportId, targetId, content, parentId = null, targetType = TARGET_TYPE } = {}) {
  const normalizedReportId = String(reportId || '').trim()
  const normalizedTargetId = String(targetId || '').trim()
  const normalizedContent = String(content || '').trim()
  if (!normalizedReportId) throw new Error('缺少报告ID')
  if (!normalizedTargetId) throw new Error('缺少目标ID')
  if (!normalizedContent) throw new Error('评论内容不能为空')

  const response = await post(BASE_PATH, {
    reportId: normalizedReportId,
    targetType,
    targetId: normalizedTargetId,
    parentId: parentId ? String(parentId).trim() : null,
    content: normalizedContent
  })
  return response?.data ?? response
}

export async function listCommentsByReport(reportId) {
  const normalizedReportId = String(reportId || '').trim()
  if (!normalizedReportId) return []
  const response = await get(`${BASE_PATH}/by-report/${encodeURIComponent(normalizedReportId)}`)
  return response?.data ?? []
}

export async function deleteReportComment(commentId) {
  const normalizedCommentId = String(commentId || '').trim()
  if (!normalizedCommentId) throw new Error('缺少评论ID')
  const response = await del(`${BASE_PATH}/${encodeURIComponent(normalizedCommentId)}`)
  return response?.data ?? response
}
