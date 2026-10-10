function pickLocalizedText(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    return value.zh || value.en || value.vi || ''
  }
  return ''
}

function normalizeSpecAttributes(specAttributes) {
  if (!Array.isArray(specAttributes)) return []
  return specAttributes.map((attr) => ({
    attrId: attr?.attrId || '',
    attrName: attr?.displayName || pickLocalizedText(attr?.attrKey) || attr?.attrName || attr?.attrId || ''
  }))
}

function sortByOrder(a, b) {
  const aOrder = Number(a?.sortOrder || 0)
  const bOrder = Number(b?.sortOrder || 0)
  return aOrder - bOrder
}

export function buildStandardItemsFromItemResults(itemResults = []) {
  // 过滤掉合并计划产生的 sonPlanId 行（这些行只用于追踪各子计划的结果，不属于清单树结构）
  const rows = Array.isArray(itemResults)
    ? itemResults.filter(row => !row?.sonPlanId)
    : []
  if (!rows.length) return []

  // nodeMap: id → node（以行的数据库 id 为键）
  // nodeByStandardItemId: standardItemId → node（以各行自身的 standardItemId 为键）
  // 父级查找同时支持 parentItemId 指向父行 id 或父行 standardItemId 两种情况
  const nodeMap = new Map()
  const nodeByStandardItemId = new Map()

  rows.forEach((row) => {
    const rowId = String(row?.id || row?.itemResultId || '')
    const standardItemId = String(row?.standardItemId || row?.itemId || row?.standardId || '')
    const nodeId = rowId || standardItemId
    if (!nodeId) return
    if (nodeMap.has(nodeId)) return

    const parentIdRaw = row?.parentItemId ?? ''
    const parentId = parentIdRaw ? String(parentIdRaw) : ''

    const node = {
      id: nodeId,
      standardItemId,
      parentItemId: parentId,
      itemName: row?.localizedItemName || pickLocalizedText(row?.itemName) || '',
      itemDescription: row?.localizedItemDescription || pickLocalizedText(row?.itemDescription) || '',
      itemType: row?.itemType || 'Standard',
      isRequired: Number(row?.isRequired || 0),
      isPhotoRequired: Number(row?.isPhotoRequired || 0),
      sortOrder: Number(row?.sortOrder || 0),
      specAttributes: normalizeSpecAttributes(row?.specAttributes),
      children: []
    }

    nodeMap.set(nodeId, node)
    if (standardItemId && !nodeByStandardItemId.has(standardItemId)) {
      nodeByStandardItemId.set(standardItemId, node)
    }
  })

  const roots = []
  nodeMap.forEach((node) => {
    const parentId = String(node.parentItemId || '')
    if (!parentId) {
      roots.push(node)
      return
    }
    // 父级查找：先按数据库 id，再按 standardItemId（兼容 parentItemId 存两种值的情况）
    const parentNode = nodeMap.get(parentId) || nodeByStandardItemId.get(parentId)
    if (parentNode && parentNode.id !== node.id) {
      parentNode.children.push(node)
      return
    }
    roots.push(node)
  })

  const sortNodes = (nodes) => {
    nodes.sort(sortByOrder)
    nodes.forEach((node) => {
      if (Array.isArray(node.children) && node.children.length) {
        sortNodes(node.children)
      }
    })
  }
  sortNodes(roots)

  return roots
}
