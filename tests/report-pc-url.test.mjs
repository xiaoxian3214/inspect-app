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

/** 按实际配置选择正式或测试环境报告链接，避免硬编码环境导致误报。 */
test('current environment builds its corresponding report link', async () => {
  const config = await readFile('config/appConfig.uts', 'utf8')
  const base = config.match(/^export const API_BASE_URL = '([^']+)'/m)?.[1]
  assert.ok(base)
  const current = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(viewModelSource.replace("const API_BASE_URL = 'https://inspect.letright.com.cn'", `const API_BASE_URL = '${base}'`))).toString('base64')}`)
  const site = base.includes('test') ? 'https://inspecttest.letright.com.cn/qcm' : 'https://inspect.letright.com.cn'
  assert.equal(current.buildReportPcUrl('2111252079774388226'),
    `${site}/#/pages/report/detail-pc?planId=2111252079774388226`)
})

/** 显示报告直接用 App 跨平台浏览器能力打开当前环境链接；失败提示而不复制链接。 */
test('card report action opens report URL in the system browser', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  const handler = source.split('function openReportInBrowser(): void {')[1]?.split('\n\t\t}')[0] ?? ''
  assert.match(source, /import \{ openUrlInSystemBrowser \} from '\.\.\/\.\.\/domain\/openUrlInSystemBrowser\.uts'/)
  assert.match(handler, /buildReportPcUrl\(getDetailPlanId\(\)\)/)
  assert.match(handler, /if \(reportUrl === ''\)[\s\S]*?计划ID缺失，无法查看报告/)
  assert.match(handler, /if \(!openUrlInSystemBrowser\(reportUrl\)\)[\s\S]*?唤起浏览器失败/)
  assert.doesNotMatch(handler, /setClipboardData|window\.open|document\.|https:\/\/www\.baidu\.com/)
  const reportBranch = source.split("if (actionKey === 'report')")[1]?.split('return')[0] ?? ''
  assert.match(reportBranch, /openReportInBrowser\(\)/)
})

/** 菜单不展示无法打开外部页面的 navigator 测试占位。 */
test('action sheet has no ineffective navigator test link', async () => {
  const source = await readFile('components/common/BottomActionSheet.uvue', 'utf8')
  assert.doesNotMatch(source, /<navigator|>111|showReportTestLink|openTestLink/)
})

/** 计划ID缺失的提示需要补齐三语翻译。 */
test('report link clipboard messages have translations', async () => {
  const translations = await readFile('i18n/translate.uts', 'utf8')
  for (const message of ['计划ID缺失，无法查看报告', '报告链接已复制', '请前往浏览器粘贴打开报告链接', '复制报告链接失败，请重试']) {
    assert.equal(translations.split(`\u0022${message}\u0022,`).length - 1, 2, `${message} 需要英文及越南文翻译`)
  }
})
