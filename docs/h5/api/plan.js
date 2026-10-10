/**
 * 验货计划相关 API
 */
import { get, post } from './request.js'
import { prefetchDefectTierTreeCache } from './defect.js'
import {
  listReports,
  listReportSummaries,
  saveReport,
  removeReport,
  getReportById,
  updateReportStatus,
  updateReportsStatus
} from '../db/dao/reportDao.js'

function compactPhotoForStorage(photo) {
  if (!photo || typeof photo !== 'object') return photo
  const next = { ...photo }
  delete next._blob
  delete next.previewUrl
  // 仅在已可回显/可追溯时清理 base64：
  // 1) 已上传成功（有 fileId/filePath）；或
  // 2) App 端已有本地路径（localPath）
  // 避免未上传成功时把唯一上传源提前清掉，导致“有待同步提示但无法真正上传”
  const uploaded = next.uploadStatus === 'done' || !!next.fileId || !!next.filePath || !!next.thumbnailPath
  const hasBlobKey = typeof next.blobKey === 'string' && next.blobKey.trim() !== ''
  const hasLocalFile = typeof next.localPath === 'string' && next.localPath.trim() !== ''
  if ((uploaded || hasBlobKey || hasLocalFile) && typeof next.dataUrl === 'string' && next.dataUrl.startsWith('data:')) {
    next.dataUrl = ''
  }
  return next
}

function compactPlanForStorage(plan) {
  if (!plan || typeof plan !== 'object') return plan
  const nextPlan = { ...plan }

  if (nextPlan.checklistData && typeof nextPlan.checklistData === 'object') {
    const compactChecklistData = {}
    Object.keys(nextPlan.checklistData).forEach((key) => {
      const row = nextPlan.checklistData[key]
      if (!row || typeof row !== 'object') {
        compactChecklistData[key] = row
        return
      }
      compactChecklistData[key] = {
        ...row,
        photos: Array.isArray(row.photos) ? row.photos.map(compactPhotoForStorage) : row.photos
      }
    })
    nextPlan.checklistData = compactChecklistData
  }

  if (Array.isArray(nextPlan.defects)) {
    nextPlan.defects = nextPlan.defects.map((defect) => ({
      ...defect,
      photos: Array.isArray(defect?.photos) ? defect.photos.map(compactPhotoForStorage) : defect?.photos
    }))
  }

  return nextPlan
}

/**
 * 搜索验货计划
 * @param {object} searchParams - 搜索参数
 * @param {string} searchParams.keyword - 关键字（模糊匹配 domeNo, subGoodsNo, clientNo）
 * @param {string} searchParams.domeNo - 采购合同号
 * @param {string} searchParams.subGoodsNo - 货号
 * @param {string} searchParams.factoryName - 工厂名称
 * @param {string} searchParams.inspectionNo - 验货编号
 * @param {number} searchParams.status - 状态 (0-待下载, 1-已下载, 2-执行中, 3-已完成)
 * @param {number} page - 页码
 * @param {number} pageSize - 每页大小
 * @returns {Promise}
 */
export async function searchPlans(searchParams = {}, page = 1, size = 100) {
  const normalizedPage = Number(page) > 0 ? Number(page) : 1
  const normalizedSize = Number(size) > 0 ? Number(size) : 100
  const query = `current=${encodeURIComponent(String(normalizedPage))}&size=${encodeURIComponent(String(normalizedSize))}`

  const response = await post(
    `/api/plans/search?${query}`,
    { ...searchParams }
  )

  // 这里的 response 直接就是你提供的结构（如果 request.js 没有完全拦截的话）
  // 考虑到后端的真实返回结构：
  // { code: 200, message: "...", data: { records: [...] } }
  
  if (response.code === 200 && response.data) {
    return {
      records: response.data.records || (Array.isArray(response.data) ? response.data : []),
      total: response.data.total || (Array.isArray(response.data) ? response.data.length : (response.data.records?.length || 0))
    }
  } else if (response.success && response.data) { // 兼容之前的逻辑
    return {
      records: response.data.records || (Array.isArray(response.data) ? response.data : []),
      total: response.data.total || (Array.isArray(response.data) ? response.data.length : 0),
    }
  }

  throw new Error(response.message || '获取计划列表失败')
}

/**
 * 获取待验货计划数量
 */
export async function getPendingCount() {
  const response = await get('/api/plans/pending-count')

  if (response.success) {
    return response.data || 0
  }

  return 0
}

/**
 * 下载验货计划到本地
 * @param {string} planId - 计划ID
 * @param {string} inspectorId - 验货员ID
 * @param {string} inspectorName - 验货员姓名
 * @param {string} language - 语言代码（zh/en/vi）
 * @returns {Promise}
 */
export async function downloadPlan(planId, payload = {}) {
  const response = await post(
    `/api/reports/generate/empty/${planId}?templateId=${payload.templateId}`,
    payload,
  )

  if (response.success && response.data) {
    await prefetchDefectTierTreeCache()
    return response.data
  }

  throw new Error(response.message || '下载计划失败')
}

function normalizeLocalReportStatus(status, planStatus) {
  const s = String(status ?? '').trim().toUpperCase()
  if (s === '0') return 0
  if (s === '1') return 1
  if (s === '2') return 1
  if (s === '3') return 3
  if (s === 'DOWNLOADED' || s === 'NEW') return 0
  if (s === 'DRAFT' || s === 'IN_PROGRESS') return 1
  if (s === 'DONE' || s === 'COMPLETED' || s === 'SUBMITTED') return 3
  const n = Number(planStatus)
  if (Number.isFinite(n)) {
    if (n === 0) return 0
    if (n === 3) return 3
    if (n === 1 || n === 2) return 1
  }
  return 0
}

function summarizeLocalPlan(report) {
  try {
    const jsonData = report.jsonData ? JSON.parse(report.jsonData) : {}
    const plan = jsonData?.plan && typeof jsonData.plan === 'object' ? jsonData.plan : {}
    const reportEntityId = String(jsonData?.report?.id || '').trim()
    const normalizedStatus = normalizeLocalReportStatus(report.status, plan?.status)
    const planId = report.reportId
    return {
      id: plan?.id || planId,
      planId,
      reportId: reportEntityId || planId,
      status: normalizedStatus,
      progress: jsonData?.progress || 0,
      syncStatus: jsonData?.syncStatus || '',
      downloadedAt: report.downloadAt,
      updatedAt: jsonData?.updatedAt || jsonData?.syncedAt || report.downloadAt,
      lockStatus: report.lockStatus,
      lockerId: report.lockerId,
      lockExpireAt: report.lockExpireAt,
      plan: {
        id: plan?.id || planId,
        planId: plan?.planId || planId,
        reportId: plan?.reportId || jsonData?.reportId || reportEntityId || '',
        clientOrderNo: plan?.clientOrderNo || report.orderNo || jsonData?.clientOrderNo || '',
        domeNo: plan?.domeNo || jsonData?.domeNo || '',
        factoryName: plan?.factoryName || jsonData?.factoryName || '',
        goodsName: plan?.goodsName || plan?.goodsCname || report.productName || jsonData?.productName || '',
        goodsCname: plan?.goodsCname || '',
        subGoodsNo: plan?.subGoodsNo || '',
        batchNo: plan?.batchNo || '',
        inspectType: plan?.inspectType || jsonData?.inspectType || '',
        templateId: plan?.templateId || jsonData?.templateId || '',
        templateName: plan?.templateName || jsonData?.templateName || '',
        createDate: plan?.createDate || jsonData?.createdAt || report.downloadAt || '',
        updateDate: plan?.updateDate || jsonData?.updatedAt || '',
        inspectorId: plan?.inspectorId || jsonData?.inspectorId || '',
        lockFlag: plan?.lockFlag ?? jsonData?.lockFlag,
        mergeType: plan?.mergeType ?? jsonData?.mergeType,
        parentPlanId: plan?.parentPlanId || jsonData?.parentPlanId || '',
        goodsFlag: plan?.goodsFlag ?? jsonData?.goodsFlag,
        produceNo: plan?.produceNo || jsonData?.produceNo || '',
        modelNo: plan?.modelNo || jsonData?.modelNo || '',
        requiredQuantity: plan?.requiredQuantity ?? jsonData?.requiredQuantity
      }
    }
  } catch (error) {
    console.error('解析本地计划摘要失败:', error)
    return {
      planId: report.reportId,
      reportId: report.reportId,
      status: normalizeLocalReportStatus(report.status),
      downloadedAt: report.downloadAt,
      lockStatus: report.lockStatus,
      lockerId: report.lockerId,
      lockExpireAt: report.lockExpireAt,
      plan: {
        id: report.reportId,
        clientOrderNo: report.orderNo || '',
        goodsName: report.productName || ''
      }
    }
  }
}

export function splitDownloadDataToLocalPlans(downloadData = {}) {
  const source = downloadData || {}
  const inspectionPlans = Array.isArray(source.inspectionPlans) && source.inspectionPlans.length
    ? source.inspectionPlans
    : [source.plan || source.report || {}].filter(item => item && typeof item === 'object')

  return inspectionPlans.map((inspectionPlan) => {
    return {
      ...source,
      plan: inspectionPlan,
      status: normalizeLocalReportStatus(inspectionPlan?.status, inspectionPlan?.status),
      syncStatus: 'SYNCED',
      pendingSyncPayload: null,
      progress: 0,
      downloadedAt: new Date().toISOString()
    }
  })
}

/**
 * 获取计划详情
 * @param {string} planId - 计划ID
 * @param {string} language - 语言代码（zh/en/vi）
 * @returns {Promise}
 */
export async function getPlanDetail(planId) {
  const response = await get(`/api/reports/plan/${planId}/detail`, {})

  if (response.success && response.data) {
    return response.data
  }

  throw new Error(response.message || '获取计划详情失败')
}

/**
 * 获取报告详情
 * @param {string} reportId - 报告ID
 * @returns {Promise}
 */
export async function getReportDetail(reportId) {
  const response = await get(`/api/reports/${reportId}/detail`, {})

  if (response.success && response.data) {
    return response.data
  }

  throw new Error(response.message || '获取报告详情失败')
}

/**
 * 获取已下载的计划列表（从 SQLite）
 */
export async function getLocalPlans() {
  try {
    const reports = await listReports()

    // 解析 jsonData 字段
    return reports.map(report => {
      try {
        const jsonData = report.jsonData ? JSON.parse(report.jsonData) : {}
        // reportId = 后端生成的报告实体 ID（用于云同步、PDF 导出等 API 调用）
        // planId   = 验货计划 ID（SQLite 主键、页面导航用）
        const reportEntityId = String(jsonData?.report?.id || '').trim()
        const normalizedStatus = normalizeLocalReportStatus(report.status, jsonData?.plan?.status)
        return {
          ...jsonData,
          planId: report.reportId,
          reportId: reportEntityId || report.reportId,
          status: normalizedStatus,
          downloadedAt: report.downloadAt,
          lockStatus: report.lockStatus,
          lockerId: report.lockerId,
          lockExpireAt: report.lockExpireAt
        }
      } catch (error) {
        console.error('解析计划数据失败:', error)
        return report
      }
    })
  } catch (error) {
    console.error('读取本地计划失败:', error)
    return []
  }
}

/**
 * 获取已下载计划摘要（供列表页使用，避免把完整 checklist/photos 放入响应式渲染）。
 */
export async function getLocalPlanSummaries() {
  try {
    const reports = await listReportSummaries()
    return reports.map(summarizeLocalPlan)
  } catch (error) {
    console.error('读取本地计划摘要失败:', error)
    return []
  }
}

/**
 * 保存计划到本地（SQLite）
 */
export async function savePlanToLocal(plan) {
  try {
    const compactPlan = compactPlanForStorage(plan)
    const planSource = plan?.plan && typeof plan.plan === 'object' ? plan.plan : {}
    // SQLite 主键必须稳定使用“验货计划ID”，避免 reportId（报告实体ID）导致多计划互相覆盖
    const planKey = String(
      planSource.id || planSource.planId || plan.planId || plan.id
      || planSource.reportId || plan.reportId || ''
    )
    if (!planKey) {
      throw new Error('计划ID缺失，无法保存到本地')
    }
    const timestamp = new Date().toISOString()

    const orderNo = planSource.clientOrderNo || planSource.domeNo || plan.planNo || plan.domeNo || ''
    const productName = planSource.goodsName || planSource.goodsCname || plan.productName || plan.plan?.goodsName || ''

    // 准备存储到数据库的数据
    const statusValue = Number.isFinite(Number(plan.status)) ? Number(plan.status) : 0
    const reportData = {
      reportId: planKey,
      orderNo,
      productName,
      jsonData: JSON.stringify(compactPlan), // 将完整数据存储为 JSON
      downloadAt: plan.downloadedAt || timestamp,
      status: statusValue,
      lockStatus: plan.lockStatus || '',
      lockerId: plan.lockerId || '',
      lockExpireAt: plan.lockExpireAt || '',
      syncRetry: plan.syncRetry || 0
    }

    await saveReport(reportData)
    return plan
  } catch (error) {
    console.error('保存计划到本地失败:', error)
    throw error
  }
}

/**
 * 从本地删除计划（SQLite）
 */
export async function removePlanFromLocal(planId) {
  try {
    await removeReport(planId)
    return true
  } catch (error) {
    console.error('删除本地计划失败:', error)
    throw error
  }
}

/**
 * 更新本地计划状态（SQLite）
 */
export async function updateLocalPlanStatus(planId, status, extraData = {}) {
  try {
    const report = await getReportById(planId)

    if (!report) {
      throw new Error('计划不存在')
    }

    // 解析现有数据
    const existingData = report.jsonData ? JSON.parse(report.jsonData) : {}

    // 合并更新
    const updatedData = {
      ...existingData,
      status,
      ...extraData,
      updatedAt: new Date().toISOString()
    }

    // 保存回数据库
    await saveReport({
      ...report,
      status,
      jsonData: JSON.stringify(updatedData)
    })

    return updatedData
  } catch (error) {
    console.error('更新计划状态失败:', error)
    throw error
  }
}

export async function updateLocalPlansStatus(planIds = [], status) {
  await updateReportsStatus(planIds, status)
}

export async function updateLocalPlanStatusOnly(planId, status) {
  await updateReportStatus(planId, status)
}

/**
 * 合并验货计划
 * @param {Array<string|number>} sourcePlanIds
 * @returns {Promise<any>}
 */
export async function mergePlans(sourcePlanIds = []) {
  const response = await post('/api/plans/merge', {
    sourcePlanIds
  })

  if (response?.success === false) {
    throw new Error(response.message || '合并验货失败')
  }

  return response?.data ?? response
}

/**
 * 拆分合并验货计划
 * @param {string|number} planId
 * @returns {Promise<any>}
 */
export async function splitPlan(planId) {
  if (!planId && planId !== 0) {
    throw new Error('计划ID缺失，无法拆分')
  }

  const response = await post(`/api/plans/split/${planId}`, {})
  if (response?.success === false) {
    throw new Error(response.message || '拆分验货失败')
  }
  return response?.data ?? response
}

/**
 * 复制验货计划
 * @param {string|number} planId
 * @param {object} payload
 * @returns {Promise<any>}
 */
export async function copyPlan(planId, payload = {}) {
  if (!planId && planId !== 0) {
    throw new Error('计划ID缺失，无法复制')
  }

  const inspectType = String(payload?.inspectType || '').trim()
  const templateId = String(payload?.templateId || '').trim()
  const templateName = String(payload?.templateName || '').trim()
  const copyFlag = Number(payload?.copyFlag || 0)
  if (!inspectType) {
    throw new Error('检查类型缺失，无法复制')
  }
  if (copyFlag !== 1 && copyFlag !== 2) {
    throw new Error('复制类型缺失，无法复制')
  }

  const queryParams = [`inspectType=${encodeURIComponent(inspectType)}`]
  queryParams.push(`copyFlag=${encodeURIComponent(String(copyFlag))}`)
  if (templateId) {
    queryParams.push(`templateId=${encodeURIComponent(templateId)}`)
  }
  if (templateName) {
    queryParams.push(`templateName=${encodeURIComponent(templateName)}`)
  }
  if(planId){
    queryParams.push(`id=${encodeURIComponent(planId)}`)
  }
  const query = queryParams.join('&')
  const response = await post(`/api/plans/${planId}/copy?${query}`, null)
  if (response?.success === false) {
    throw new Error(response.message || '复制验货失败')
  }
  if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
    return {
      ...response.data,
      message: response?.message || response.data?.message || ''
    }
  }
  return response?.data ?? response
}

/**
 * 获取清单模板列表
 * @returns {Promise<Array<{id: string, name: string, raw: object}>>}
 */
export async function getPlanTemplates() {
  const response = await get('/api/plans/templates')
  const rows = Array.isArray(response)
    ? response
    : (Array.isArray(response?.data)
      ? response.data
      : (Array.isArray(response?.records)
        ? response.records
        : (Array.isArray(response?.data?.records) ? response.data.records : [])))

  if (!rows.length && response?.success === false) {
    throw new Error(response.message || '获取清单列表失败')
  }

  const options = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const rawId = item.id ?? item.templateId ?? item.value ?? item.code ?? item.name ?? item.templateName
    const rawName = item.templateName ?? item.name ?? item.label ?? item.templateLabel ?? item.value ?? item.code
    const id = String(rawId ?? '').trim()
    const name = String(rawName ?? '').trim()
    if (!id || !name) continue
    options.push({
      id,
      name,
      raw: item
    })
  }

  return Array.from(new Map(options.map(option => [option.id, option])).values())
}

/**
 * 获取验货类型字典（inspect_type）
 * @returns {Promise<Array<{value: string, label: string, sortOrder: number}>>}
 */
export async function getInspectTypeDict() {
  const response = await get('/api/dict/data/code/inspect_type')
  const rows = Array.isArray(response)
    ? response
    : (Array.isArray(response?.data) ? response.data : [])

  if (!rows.length && response?.success === false) {
    throw new Error(response.message || '获取验货类型失败')
  }

  const options = []
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const rawValue = item.dictValue ?? item.value ?? item.code
    const rawLabel = item.dictLabel ?? item.label ?? item.name
    const value = String(rawValue ?? '').trim()
    const label = String(rawLabel ?? '').trim()
    if (!value || !label) continue
    options.push({
      value,
      label,
      sortOrder: Number(item.sortOrder || 0)
    })
  }

  const deduped = Array.from(new Map(options.map(option => [option.value, option])).values())
  return deduped.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
}

/**
 * 复制检查点
 * @param {object} params
 * @param {string} params.sourcePlanId - 源计划ID
 * @param {Array<string>} params.sourceItemIds - 源检查项ID列表
 * @param {Array<string>} params.targetPlanIds - 目标计划ID列表
 * @param {boolean} params.copyPhotos - 是否复制照片和视频
 * @param {boolean} params.copyStatus - 是否复制状态
 * @param {boolean} params.copySpecs - 是否复制规格
 * @param {boolean} params.copyText - 是否复制文本
 * @param {boolean} params.copyBarcode - 是否复制条码
 * @param {boolean} params.copyRemarks - 是否复制评论
 * @returns {Promise<any>}
 */
export async function copyCheckItems(params = {}) {
  const { sourcePlanId, sourceItemId, targetItemIds, targetPlanIds } = params
  if (!sourcePlanId) {
    throw new Error('源计划ID不能为空')
  }
  if (!Array.isArray(targetPlanIds) || !targetPlanIds.length) {
    throw new Error('目标计划ID列表不能为空')
  }

  const response = await post('/api/plans/copy-items', {
    sourcePlanId,
    sourceItemId: sourceItemId || '',
    targetItemIds: targetItemIds || [],
    targetPlanIds,
    copyPhotos: params.copyPhotos ?? false,
    copyStatus: params.copyStatus ?? false,
    copySpecs: params.copySpecs ?? false,
    copyText: params.copyText ?? false,
    copyBarcode: params.copyBarcode ?? false,
    copyRemarks: params.copyRemarks ?? false
  })
  if (response?.success === false) {
    throw new Error(response.message || '复制检查点失败')
  }
  return response?.data ?? response
}

export async function copyPhotosToItems(params = {}) {
  const sourcePlanId = String(params?.sourcePlanId || '').trim()
  const sourceItemId = String(params?.sourceItemId || '').trim()
  const targetPlanIds = Array.isArray(params?.targetPlanIds) ? params.targetPlanIds.map(x => String(x)).filter(Boolean) : []
  const targetItemIds = Array.isArray(params?.targetItemIds) ? params.targetItemIds.map(x => String(x)).filter(Boolean) : []
  const fileIds = Array.isArray(params?.fileIds) ? params.fileIds.map(x => String(x)).filter(Boolean) : []
  if (!sourcePlanId) throw new Error('源计划ID不能为空')
  if (!sourceItemId) throw new Error('源检查点ID不能为空')
  if (!targetPlanIds.length) throw new Error('目标计划ID列表不能为空')
  if (!targetItemIds.length) throw new Error('目标检查点ID列表不能为空')
  if (!fileIds.length) throw new Error('文件ID列表不能为空')

  const response = await post('/api/plans/copy-photos-to-items', {
    sourcePlanId,
    sourceItemId,
    targetPlanIds,
    targetItemIds,
    copyPhotos: true,
    fileIds
  })
  if (response?.success === false) {
    throw new Error(response.message || '复制照片失败')
  }
  return response?.data ?? response
}

/**
 * 修改完工数量
 * @param {string|number} planId - 计划ID
 * @param {number} finishQuantity - 完工数量
 * @returns {Promise<any>}
 */
export async function updateFinishQuantity(planId, finishQuantity) {
  if (!planId && planId !== 0) {
    throw new Error('计划ID缺失')
  }
  const qty = Number(finishQuantity)
  if (isNaN(qty) || qty < 0) {
    throw new Error('完工数量无效')
  }

  const response = await post(`/api/plans/${planId}/finish-quantity?finishQuantity=${encodeURIComponent(qty)}`, null)
  if (response?.success === false) {
    throw new Error(response.message || '修改完工数量失败')
  }
  return response?.data ?? response
}

/**
 * 修改样品数量
 * @param {string|number} planId - 计划ID
 * @param {number} sampleQuantity - 样品数量
 * @returns {Promise<any>}
 */
export async function updateSampleQuantity(planId, sampleQuantity) {
  if (!planId && planId !== 0) {
    throw new Error('计划ID缺失')
  }
  const qty = Number(sampleQuantity)
  if (isNaN(qty) || qty < 0) {
    throw new Error('样品数量无效')
  }

  const response = await post(`/api/plans/${planId}/sample-quantity?sampleQuantity=${encodeURIComponent(qty)}`, null)
  if (response?.success === false) {
    throw new Error(response.message || '修改样品数量失败')
  }
  return response?.data ?? response
}

/**
 * 拆分船期（按数量拆分）
 * @param {string|number} planId - 计划ID
 * @param {number} quantity - 拆分数量
 * @returns {Promise<any>}
 */
export async function splitByQuantity(planId, quantity) {
  if (!planId && planId !== 0) {
    throw new Error('计划ID缺失')
  }
  const qty = Number(quantity)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('拆分数量无效')
  }

  const response = await post(`/api/plans/${planId}/split-by-quantity?quantity=${encodeURIComponent(qty)}`, null)
  if (response?.success === false) {
    throw new Error(response.message || '拆分船期失败')
  }
  return response?.data ?? response
}

/**
 * 格式化计划数据（统一字段名）
 */
export function formatPlanData(plan) {
  return {
    planId: plan.id || plan.planId,
    id: plan.id || plan.planId,
    planNo: plan.inspectionNo || plan.domeNo || plan.planNo,
    domeNo: plan.domeNo,
    subGoodsNo: plan.subGoodsNo,
    productName: plan.goodsName || plan.goodsCname || plan.productName,
    supplierName: plan.factoryName || plan.supplierName,
    factoryNo: plan.factoryNo,
    factoryName: plan.factoryName,
    quantity: plan.requiredQuantity || plan.quantity || 0,
    inspectionDate: plan.deliveryDate || plan.inspectionDate,
    clientNo: plan.clientNo,
    clientName: plan.clientName,
    inspectType: plan.inspectType || plan.plan?.inspectType || '',
    batchNo: plan.batchNo || plan.plan?.batchNo || '',
    status: plan.status,
    progress: plan.progress || 0,
    inspectorId: plan.inspectorId,
    inspectorName: plan.inspectorName,
    downloadedAt: plan.downloadedAt,
    startedAt: plan.startedAt,
    updatedAt: plan.updatedAt || plan.updateTime || plan.updateDate,
    createdAt: plan.createdAt || plan.createTime || plan.createDate,
    raw: plan // 保留原始数据
  }
}
