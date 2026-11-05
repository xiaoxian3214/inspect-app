import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'
const { createAppUpdateService } = await loadUtsModule('services/appUpdateService.uts')

/** 检查更新使用匿名请求、真实安装包版本号及三语参数，不经过会话守卫。 */
test('update check uses anonymous Android version code and locale', async () => {
  const calls = []
  const service = createAppUpdateService({
    baseUrl: 'https://example.com/qcm/',
    request: async (options) => { calls.push(options); return { statusCode: 200, data: { code: 200, data: { needUpdate: true, forceUpdate: true, versionName: '1.2', downloadUrl: 'https://example.com/qcm/api/app/version/download/a.apk' } } } }
  })
  const update = await service.check(101, 'vi')
  assert.equal(update.forceUpdate, true)
  assert.match(calls[0].url, /\/api\/app\/version\/check\?platform=android&versionCode=101&lang=vi_VN$/)
  assert.equal(calls[0].timeout, 5000)
  assert.equal(calls[0].header.Authorization, undefined)
  assert.equal(calls[0].header['Accept-Language'], 'vi_VN')
})

/** 无更新无需下载；错误状态或不合法的 APK 下载地址必须拒绝安装。 */
test('update check rejects failed responses and unsafe packages', async () => {
  for (const data of [{ code: 500, message: 'failed' }, { code: 200, data: { needUpdate: true, downloadUrl: 'http://evil.test/a.apk' } }]) {
    const service = createAppUpdateService({ baseUrl: 'https://example.com', request: async () => ({ statusCode: 200, data }) })
    await assert.rejects(() => service.check(101, 'zh'))
  }
  const service = createAppUpdateService({ baseUrl: 'https://example.com', request: async () => ({ statusCode: 200, data: { code: 200, data: { needUpdate: false } } }) })
  assert.equal(await service.check(101, 'en'), null)
})

/** 后端返回 500 时保留 HTTP 状态和服务端提示，避免笼统地误报网络故障。 */
test('update check surfaces backend status and message', async () => {
  const service = createAppUpdateService({
    baseUrl: 'https://example.com/qcm',
    request: async () => ({ statusCode: 500, data: { code: 500, message: '系统错误，请联系管理员' } })
  })
  await assert.rejects(() => service.check(101, 'zh'), /HTTP 500.*系统错误，请联系管理员/)
})

/** 即使服务器只返回通用错误，也需打印匿名请求的路径、状态和时间便于后端关联日志。 */
test('update check logs safe request and full backend response on HTTP 500', async () => {
  const original = console.error
  const logs = []
  console.error = (...values) => logs.push(values)
  try {
    const service = createAppUpdateService({
      baseUrl: 'https://example.com/qcm',
      request: async () => ({ statusCode: 500, header: { 'x-request-id': 'trace-123' }, data: { code: 500, message: '系统错误，请联系管理员', timestamp: 1792395792971, success: false } })
    })
    await assert.rejects(() => service.check(101, 'zh'))
    const serialized = JSON.stringify(logs)
    assert.match(serialized, /\/api\/app\/version\/check\?platform=android&versionCode=101&lang=zh_CN/)
    assert.match(serialized, /1792395792971/)
    assert.match(serialized, /trace-123/)
    assert.match(serialized, /系统错误，请联系管理员/)
    assert.doesNotMatch(serialized, /Authorization|Bearer/)
  } finally { console.error = original }
})

/** 列表页面把手动入口接入真实匿名接口，强更不显示取消键，确认后把下载直链交给系统浏览器。 */
test('user drawer starts the browser based update flow', async () => {
  const page = await readFile('pages/report/list.uvue', 'utf8')
  assert.match(page, /@check-for-updates="handleCheckForUpdates"/)
  assert.match(page, /uni\.getAppBaseInfo\(\)\.appVersionCode/)
  assert.match(page, /appUpdateService\.check\(/)
  assert.match(page, /showCancel: !update\.forceUpdate/)
  assert.match(page, /if \(result\.confirm\) openUpdateDownloadPage\(update\.downloadUrl\)/)
  assert.doesNotMatch(page, /检查更新功能待接入/)
  const service = await readFile('services/appUpdateService.uts', 'utf8')
  assert.doesNotMatch(service, /plus\.|document\.|window\.|localStorage/)
})

/** 确认更新后不得在应用内下载：直接把 downloadUrl 交给系统浏览器，调起失败才提示。 */
test('list page opens the APK link in the system browser', async () => {
  const page = await readFile('pages/report/list.uvue', 'utf8')
  assert.match(page, /import \{ openUrlInSystemBrowser \} from '@\/domain\/openUrlInSystemBrowser\.uts'/)
  assert.match(page, /function openUpdateDownloadPage\(downloadUrl: string\): void/)
  assert.match(page, /if \(openUrlInSystemBrowser\(downloadUrl\)\) return/)
  assert.match(page, /uni\.showToast\(\{ title: t\('唤起浏览器失败'\), icon: 'none' \}\)/)
  assert.doesNotMatch(page, /uni\.downloadFile\(/)
  assert.doesNotMatch(page, /uni\.openURL\s*\(/)
  assert.doesNotMatch(page, /uni\.showLoading/)
  assert.doesNotMatch(page, /downloadAndOpen|cancelDownload|cancelAvailableUpdate|UpdateProgressDialog/)
  const service = await readFile('services/appUpdateService.uts', 'utf8')
  assert.doesNotMatch(service, /uni\.downloadFile|uni\.openDocument|uni\.installApk|downloadAndOpen|cancelDownload/)
})

/** 普通业务模块不直接引入 UIKit 或 Android 原生 SDK，统一复用跨平台插件。 */
test('shared browser helper delegates URLs to the existing openSchema plugin', async () => {
  const shared = await readFile('domain/openUrlInSystemBrowser.uts', 'utf8')
  assert.match(shared, /import \{ openSchema \} from '@\/uni_modules\/uts-openSchema'/)
  assert.match(shared, /export function openUrlInSystemBrowser\(url: string\): boolean/)
  assert.match(shared, /const target = url\.trim\(\)/)
  assert.match(shared, /!target\.startsWith\('http/)
  assert.match(shared, /openSchema\(target\)/)
  assert.doesNotMatch(shared, /qcm-open-url|from 'UIKit'|from 'Foundation'|from 'android\.content/)
})

/** iOS 浏览器插件直接提交 HTTPS 地址，不使用可误拦截的 canOpenURL 查询。 */
test('existing openSchema plugin supports native Android and iOS URL opening', async () => {
  const android = await readFile('uni_modules/uts-openSchema/utssdk/app-android/index.uts', 'utf8')
  const ios = await readFile('uni_modules/uts-openSchema/utssdk/app-ios/index.uts', 'utf8')
  assert.match(android, /Intent\.ACTION_VIEW/)
  assert.match(ios, /UIApplication\.shared\.open\(uri!\)/)
  assert.doesNotMatch(ios.split('export const openSchema')[1]?.split('export const canOpenURL')[0] ?? '', /if \(canOpenURL\(url\)\)/)
  const card = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')
  assert.doesNotMatch(card, /from '\.\.\/\.\.\/domain\/openUrlInSystemBrowser\.uts'/)
  assert.match(card.split("if (actionKey === 'report')")[1]?.split('return')[0] ?? '', /copyReportLink/)
})
