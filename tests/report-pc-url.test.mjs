import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Node 不支持直接解析 UTS 导入，测试时用生产环境地址替换配置模块导入。
const viewModelSource = (await readFile('domain/listActionViewModel.uts', 'utf8'))
  .replace("import { API_BASE_URL } from '../config/appConfig.uts'", "const API_BASE_URL = 'https://inspect.letright.com.cn'")
const viewModel = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(viewModelSource)).toString('base64')}`)

/**
 * 【显示报告】PC 报告链接契约。
 *
 * H5 卡片的 showReportInCard 打开 `/pages/report/detail-pc?planId=...`；
 * App 端没有 detail-pc 页面，必须在系统浏览器打开
 * https://inspect.letright.com.cn/#/pages/report/detail-pc?planId={planId}。
 * 链接必须由纯函数生成，planId 需 encodeURIComponent，防止 ID 含特殊字符时拆坏查询串。
 */
test('builds the browser report url from a plan id', () => {
  assert.equal(
    viewModel.buildReportPcUrl('2111252079774388226'),
    'https://inspect.letright.com.cn/#/pages/report/detail-pc?planId=2111252079774388226'
  )
  assert.equal(
    viewModel.buildReportPcUrl('plan/001 x'),
    'https://inspect.letright.com.cn/#/pages/report/detail-pc?planId=plan%2F001%20x'
  )
})

/** 空 planId 时返回空串，调用方据此提示“计划ID缺失”而不是拼出无效链接。 */
test('report url is empty without a plan id', () => {
  assert.equal(viewModel.buildReportPcUrl(''), '')
  assert.equal(viewModel.buildReportPcUrl('   '), '')
})

/** 临时验收：卡片“显示报告”直接让系统浏览器打开百度，而非在 App 内导航。 */
test('card report action opens Baidu in the system browser for verification', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.match(source, /function openReportInBrowser\(\): void/)
  assert.match(source, /openUrlInSystemBrowser\('https:\/\/www\.baidu\.com'\)/)
  const reportBranch = source.split("if (actionKey === 'report')")[1]?.split('return')[0] ?? ''
  assert.match(reportBranch, /openReportInBrowser/)
  assert.doesNotMatch(reportBranch, /openDetailPageFromMenu|openDetailPage\(\)/)
  assert.match(source, /title: t\('唤起浏览器失败'\), icon: 'none'/)
})

/** 菜单不展示无法打开外部页面的 navigator 测试占位。 */
test('action sheet has no ineffective navigator test link', async () => {
  const source = await readFile('components/common/BottomActionSheet.uvue', 'utf8')
  assert.doesNotMatch(source, /<navigator|>111|showReportTestLink|openTestLink/)
})

/** 计划ID缺失的提示需要补齐三语翻译。 */
test('missing plan id toast has translations', async () => {
  const translations = await readFile('i18n/translate.uts', 'utf8')
  assert.equal(translations.match(/\["计划ID缺失，无法查看报告",/g)?.length, 2)
})
