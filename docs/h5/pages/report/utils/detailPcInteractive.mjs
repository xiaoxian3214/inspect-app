import { isPdfImagePreloadEnabled } from './reportPdfImagePreload.js'

function flattenItems(nodes = []) {
  const list = []
  const visit = (items) => {
    ;(Array.isArray(items) ? items : []).forEach((item) => {
      const children = Array.isArray(item?.children) ? item.children : []
      if (children.length) {
        visit(children)
        return
      }
      if (item?.id) list.push(item)
    })
  }
  visit(nodes)
  return list
}

function buildPlanLabel(plan = {}) {
  return String(plan?.clientOrderNo || plan?.planNo || plan?.subGoodsNo || '').trim()
}

function getPlanSubGoodsNo(plan = {}) {
  return String(plan?.subGoodsNo || '').trim()
}

function defectLabel(defect = {}) {
  const code = String(defect?.defectCode || '').trim()
  const desc = String(defect?.defectDesc || defect?.description || '').trim()
  if (code && desc) return `${code} ${desc}`
  return code || desc || String(defect?.id || '').trim()
}

function normalizeCommentRow(row = {}, index = 0) {
  const id = String(
    row?.id
      || row?.commentId
      || row?.reviewCommentId
      || row?.reviewId
      || `comment_${index}`
  ).trim()
  const content = String(
    row?.commentContent
      || row?.content
      || row?.comment
      || row?.remarks
      || row?.reviewComments
      || ''
  ).trim()
  const authorName = String(
    row?.createByName
      || row?.creatorName
      || row?.commenterName
      || row?.commenter
      || row?.userName
      || row?.createName
      || row?.reviewerName
      || row?.createBy
      || ''
  ).trim()
  const createdAt = String(row?.createDate || row?.createdAt || row?.updateDate || row?.updatedAt || '').trim()
  const updatedAt = String(row?.updateDate || row?.updatedAt || row?.createDate || row?.createdAt || '').trim()
  const replies = (Array.isArray(row?.replies) ? row.replies : []).map((reply, replyIndex) => normalizeCommentRow(reply, replyIndex))
  return { id, content, authorName, createdAt, updatedAt, replies, raw: row }
}

export function canEnableInteractiveFooter({ pageQuery = {}, reportId = '' } = {}) {
  return !isPdfImagePreloadEnabled(pageQuery) && !!String(reportId || '').trim()
}

export function canShowReportCommentsPanel({ pageQuery = {} } = {}) {
  return !isPdfImagePreloadEnabled(pageQuery)
}

export function canShowInteractiveUploadPanel({ pageQuery = {}, inspectorId = '', currentUserId = '' } = {}) {
  if (isPdfImagePreloadEnabled(pageQuery)) return false
  const normalizedInspectorId = String(inspectorId || '').trim()
  const normalizedCurrentUserId = String(currentUserId || '').trim()
  return !!normalizedInspectorId
    && !!normalizedCurrentUserId
    && normalizedInspectorId === normalizedCurrentUserId
}

export function buildUploadTargets({
  standardItems = [],
  inspectionPlanRows = [],
  itemResults = [],
  defects = [],
  hasMergedInspectionPlans = false,
  t = (value) => value
} = {}) {
  const leafItems = flattenItems(standardItems)
  const planRows = Array.isArray(inspectionPlanRows) ? inspectionPlanRows : []
  const resultRows = Array.isArray(itemResults) ? itemResults : []
  const defaultSubGoodsNo = getPlanSubGoodsNo(planRows[0] || {})

  const checklistItems = []
  const seenChecklist = new Set()

  leafItems.forEach((item) => {
    const itemId = String(item?.id || '').trim()
    if (!itemId) return

    if (!hasMergedInspectionPlans) {
      const label = String(item?.itemName || t('未命名检查点')).trim()
      checklistItems.push({
        key: itemId,
        bizId: itemId,
        dataKey: itemId,
        itemId,
        sonPlanId: '',
        label,
        subLabel: '',
        itemName: label,
        subGoodsNo: defaultSubGoodsNo
      })
      return
    }

    planRows.forEach((plan) => {
      const sonPlanId = String(plan?.id || plan?.planId || '').trim()
      if (!sonPlanId) return
      const matched = resultRows.find((row) => {
        if (String(row?.sonPlanId || '').trim() !== sonPlanId) return false
        const rowId = String(row?.id || row?.itemResultId || '').trim()
        const standardItemId = String(row?.standardItemId || '').trim()
        const itemStandardId = String(item?.standardItemId || '').trim()
        if (rowId === `${itemId}_${sonPlanId}`) return true
        if (itemStandardId && standardItemId && itemStandardId === standardItemId) return true
        return false
      })
      const bizId = String(matched?.id || matched?.itemResultId || '').trim() || `${itemId}_${sonPlanId}`
      const key = `${bizId}__${sonPlanId}`
      if (seenChecklist.has(key)) return
      seenChecklist.add(key)
      const itemName = String(item?.itemName || matched?.localizedItemName || t('未命名检查点')).trim()
      const planLabel = buildPlanLabel(plan)
      checklistItems.push({
        key,
        bizId,
        dataKey: `${itemId}__${sonPlanId}`,
        itemId,
        sonPlanId,
        label: planLabel ? `${itemName} · ${planLabel}` : itemName,
        subLabel: planLabel,
        itemName,
        subGoodsNo: getPlanSubGoodsNo(plan) || defaultSubGoodsNo
      })
    })
  })

  const defectItems = (Array.isArray(defects) ? defects : [])
    .map((defect, index) => ({
      key: String(defect?.id || `defect_${index}`).trim(),
      id: String(defect?.id || `defect_${index}`).trim(),
      bizId: String(defect?.id || `defect_${index}`).trim(),
      label: defectLabel(defect),
      subLabel: Number(defect?.commonFlag || 0) === 1
        ? t('普遍性疵点')
        : t('影响：{count} 件', { count: Number(defect?.quantity || 0) }),
      subGoodsNo: String(defect?.subGoodsNo || '').trim() || defaultSubGoodsNo
    }))
    .filter(item => item.id)

  return { checklistItems, defectItems }
}

export function normalizeReportComments(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.records || payload?.rows || payload?.list || payload?.data || payload?.items || []
  return (Array.isArray(rows) ? rows : []).map((row, index) => normalizeCommentRow(row, index))
}
