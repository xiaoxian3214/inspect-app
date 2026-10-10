import { get } from './request.js'

export const DEFECT_TIER_CACHE_KEY = 'defect_tier_tree_cache_v1'

function normalizeTierNode(node) {
  return {
    ...node,
    children: (node.children || []).map(normalizeTierNode)
  }
}

/**
 * 获取疵点分类树（三级）
 * @returns {Promise<Array>}
 */
export async function getDefectTierTree() {
  const response = await get('/api/defect-tier-config/tree')
  const rows = Array.isArray(response)
    ? response
    : (Array.isArray(response?.data) ? response.data : [])

  if (!rows.length && response?.success === false) {
    throw new Error(response.message || '获取疵点分类失败')
  }

  return rows.map(normalizeTierNode)
}

// 将疵点类别树写入本地缓存，供离线时降级使用
export function saveDefectTierCache(tree) {
  if (!Array.isArray(tree) || !tree.length) return false
  try {
    localStorage.setItem(DEFECT_TIER_CACHE_KEY, JSON.stringify({ data: tree, savedAt: Date.now() }))
    return true
  } catch {
    return false
  }
}

// 从本地缓存读取疵点类别树（返回数组或 null）
export function loadDefectTierCache() {
  try {
    const raw = localStorage.getItem(DEFECT_TIER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.data) && parsed.data.length ? parsed.data : null
  } catch {
    return null
  }
}

// 下载报告时预取并缓存疵点类别树；失败不阻断报告下载
export async function prefetchDefectTierTreeCache() {
  try {
    const tree = await getDefectTierTree()
    return saveDefectTierCache(tree)
  } catch (error) {
    console.warn('预取疵点类别树失败:', error)
    return false
  }
}

/**
 * 获取疵点严重性字典（defect_level）
 * @returns {Promise<Array>}
 */
export async function getDefectLevelDict() {
  const response = await get('/api/dict/data/code/defect_level')
  const rows = Array.isArray(response)
    ? response
    : (Array.isArray(response?.data) ? response.data : [])

  if (!rows.length && response?.success === false) {
    throw new Error(response.message || '获取疵点严重性失败')
  }

  return rows
}
