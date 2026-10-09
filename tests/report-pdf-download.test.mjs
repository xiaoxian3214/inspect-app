import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadUtsModule } from './load-uts-module.mjs'

const domainModule = await loadUtsModule('domain/reportPdf.uts')
const apiModule = await loadUtsModule('api/reportFileApi.uts')

function createPdfApi(overrides = {}) {
  return apiModule.createReportFileApi({
    apiClient: { request: async () => null },
    baseUrl: 'https://example.com/',
    getSession: () => ({ token: 'token-1' }),
    uploadTransport: async () => null,
    downloadTransport: async () => null,
    ...overrides
  })
}

test('resolves the pdf report id from the server report record first', () => {
  const detail = { report: { id: 'report-9' }, plan: { reportId: 'report-8' }, reportId: 'report-7' }
  assert.equal(domainModule.resolveReportPdfDownloadId(detail, 'plan-1'), 'report-9')
})

test('resolves the pdf report id from plan reportId before the top-level fallback', () => {
  const detail = { plan: { reportId: 'report-8' }, reportId: 'plan-1' }
  assert.equal(domainModule.resolveReportPdfDownloadId(detail, 'plan-1'), 'report-8')
})

test('treats the top-level reportId as downloadable only when it is not the plan id fallback', () => {
  assert.equal(domainModule.resolveReportPdfDownloadId({ reportId: 'plan-1' }, 'plan-1'), '')
  assert.equal(domainModule.resolveReportPdfDownloadId({ reportId: 'report-7' }, 'plan-1'), 'report-7')
  assert.equal(domainModule.resolveReportPdfDownloadId(null, 'plan-1'), '')
})

test('downloads the report pdf with auth headers and returns the temp file path', async () => {
  const downloads = []
  const api = createPdfApi({
    downloadTransport: async (request) => {
      downloads.push(request)
      return { statusCode: 200, tempFilePath: '_doc/report.pdf' }
    }
  })

  const filePath = await api.downloadReportPdf('report 1')

  assert.equal(filePath, '_doc/report.pdf')
  assert.equal(downloads.length, 1)
  assert.equal(downloads[0].url, 'https://example.com/api/reports/report%201/pdf')
  assert.equal(downloads[0].header.Accept, 'application/pdf')
  assert.equal(downloads[0].header.Authorization, 'Bearer token-1')
  assert.equal(downloads[0].timeout > 0, true)
})

test('omits the authorization header when there is no session token', async () => {
  const downloads = []
  const api = createPdfApi({
    getSession: () => null,
    downloadTransport: async (request) => {
      downloads.push(request)
      return { statusCode: 200, tempFilePath: '/tmp/report.pdf' }
    }
  })

  await api.downloadReportPdf('report-1')

  assert.equal('Authorization' in downloads[0].header, false)
})

test('rejects non-2xx or missing temp file responses with the http status', async () => {
  const api = createPdfApi({
    downloadTransport: async () => ({ statusCode: 404, tempFilePath: '/tmp/none.pdf' })
  })
  await assert.rejects(
    () => api.downloadReportPdf('report-1'),
    (error) => error.httpStatus === 404 && /下载报告失败/.test(error.message)
  )

  const emptyApi = createPdfApi({
    downloadTransport: async () => ({ statusCode: 200, tempFilePath: '' })
  })
  await assert.rejects(
    () => emptyApi.downloadReportPdf('report-1'),
    (error) => error.httpStatus === 200 && /下载报告失败/.test(error.message)
  )
})

test('routes download http 401 through the auth session guard', async () => {
  const guardCalls = []
  const api = createPdfApi({
    onAuthFailure: async (failure) => {
      guardCalls.push(failure)
      throw new Error(failure.fallbackMessage)
    },
    downloadTransport: async () => ({ statusCode: 401, tempFilePath: '' })
  })

  await assert.rejects(
    () => api.downloadReportPdf('report-1'),
    /登录已过期，请重新登录/
  )
  assert.deepEqual(guardCalls, [
    { url: '/api/reports/report-1/pdf', fallbackMessage: '登录已过期，请重新登录' }
  ])
})

test('rejects empty report ids before starting a download', async () => {
  let transportCalls = 0
  const api = createPdfApi({
    downloadTransport: async () => {
      transportCalls += 1
      return { statusCode: 200, tempFilePath: '/tmp/report.pdf' }
    }
  })

  await assert.rejects(() => api.downloadReportPdf('  '), /报告ID不能为空/)
  assert.equal(transportCalls, 0)
})

test('detail page exposes the pdf download action in the more actions menu', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')

  assert.match(source, /resolveReportPdfDownloadId/)
  assert.match(source, /key: 'pdf', label: '下载报告PDF', icon: 'download'/)
  assert.match(source, /reportFileApi\.downloadReportPdf/)
  assert.match(source, /uni\.openDocument/)
  assert.match(source, /fileType: 'pdf'/)
  assert.match(source, /showMenu: true/)
  assert.match(source, /报告尚未生成/)
  assert.match(source, /下载报告需要联网/)
})
