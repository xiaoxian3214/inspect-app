import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const previewModule = await loadUtsModule('domain/planDownloadPreview.uts')

/** 复制当前验货的信息区仅展示 H5 的七个计划字段。 */
test('copy current preview keeps H5 seven fields and values', () => {
  const fields = previewModule.buildCopyPlanFields({ plan: {
    clientOrderNo: 'PO-1', subGoodsNo: 'SKU-1', goodsName: '鞋子',
    requiredQuantity: 0, sampleSize: 2, factoryName: '工厂', deliveryDate: '2026-10-10'
  } })
  assert.deepEqual(fields.map((field) => field.label), ['订单号', '款号', '产品名称', '总数量', '样品数量', '供应商', '计划日期'])
  assert.deepEqual(fields.map((field) => field.value), ['PO-1', 'SKU-1', '鞋子', 0, 2, '工厂', '2026-10-10'])
})

test('shows every H5 download field in order from a nested plan', () => {
  const fields = previewModule.buildDownloadPlanFields({
    plan: {
      clientOrderNo: 'PO-1', subGoodsNo: 'SKU-1', goodsName: '产品一',
      requiredQuantity: 0, sampleSize: 12, factoryName: '工厂甲',
      deliveryDate: '2026-10-12', etd: '2026-10-15T08:30:00',
      inspectType: '最终验货', batchNo: 'B-1', domeNo: 'D-1',
      produceNo: 'P-1', modelNo: 'M-1'
    }
  })

  assert.deepEqual(fields, [
    { label: '订单号', value: 'PO-1' },
    { label: '款号', value: 'SKU-1' },
    { label: '产品名称', value: '产品一' },
    { label: '总数量', value: 0 },
    { label: '样品数量', value: 12 },
    { label: '供应商', value: '工厂甲' },
    { label: '计划日期', value: '2026-10-12' },
    { label: '预计离港时间', value: '2026-10-15' },
    { label: '检查类型', value: '最终验货' },
    { label: '批次', value: 'B-1' },
    { label: '采购合同', value: 'D-1' },
    { label: '制造令', value: 'P-1' },
    { label: '模具色卡号', value: 'M-1' }
  ])
})

test('uses H5 flat-row fallbacks and placeholders when nested data is absent', () => {
  const fields = previewModule.buildDownloadPlanFields({
    plan: { requiredQuantity: '', estimatedDepartureDate: '' },
    planNo: 'PLAN-2', subGoodsNo: 'SKU-2', productName: '产品二', quantity: 8,
    sampleQty: 0, supplierName: '工厂乙', deliveryDate: '2026-10-20',
    estimatedDepartureDate: '2026-10-22', inspectType: '中期验货',
    batchNo: 'B-2', domeNo: 'D-2', produceNo: 'P-2', modelNo: 'M-2'
  })

  assert.deepEqual(fields.map((field) => field.value), [
    'D-2', 'SKU-2', '产品二', '-', 0, '工厂乙', '2026-10-20',
    '2026-10-22', '中期验货', 'B-2', 'D-2', 'P-2', 'M-2'
  ])
  assert.equal(previewModule.buildDownloadPlanFields({})[7].value, '-')
})

test('download confirmation renders all fields in a scrollable native sheet and keeps checklist selection', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const details = await readFile('components/inspection/PlanDownloadDetails.uvue', 'utf8')

  assert.match(card, /<PlanDownloadDetails[^>]*:item="props\.item"[^>]*@open-template="openDownloadTemplateSheet"/s)
  assert.match(card, /import PlanDownloadDetails from/)
  assert.match(card, /class="copy-modal download-modal"/)
  assert.match(card, /\.download-modal\s*\{[^}]*height:\s*85%/)
  assert.match(card, /<OptionSelectSheet[^>]*:visible="showDownloadTemplateSheet"[^>]*:options="downloadTemplateOptions"[^>]*@confirm="selectDownloadTemplate"/)
  assert.match(card, /function selectDownloadTemplate\(option\)/)
  assert.match(card, /downloadTemplateName\.value !== '' \? downloadTemplateName\.value : '请选择清单'/)
  assert.match(details, /<scroll-view[^>]*scroll-y="true"/)
  assert.match(details, /v-for="field in fields"/)
  assert.match(details, /buildDownloadPlanFields\(props\.item\)/)
  assert.match(details, /class="section" @click="openTemplateOptions"/)
  assert.match(details, /class="select-value"/)
  assert.match(details, /emit\('open-template'\)/)
  assert.doesNotMatch(details, /<picker\b/)
  assert.match(details, /清单/)
})

test('merged download previews group members and downloads the parent as one report', async () => {
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const details = await readFile('components/inspection/PlanDownloadDetails.uvue', 'utf8')
  const table = await readFile('components/inspection/PlanMemberTable.uvue', 'utf8')
  assert.match(card, /planApi\.searchPlans\(\{ parentPlanId \}/)
  assert.match(card, /:merged-items="downloadMergedItems"/)
  assert.match(card, /const downloadPlanId = isMerged\.value && parentPlanId !== '' \? parentPlanId : planId/)
  assert.match(details, /此合并验货包含以下验货/)
  assert.match(details, /<PlanMemberTable :items="mergedItems" :loading="mergedLoading"/)
  assert.match(table, /v-for="row in rows"[\s\S]*?row\.orderNo[\s\S]*?row\.itemBatch[\s\S]*?row\.productName/)
})
