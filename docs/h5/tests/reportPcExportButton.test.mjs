import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailPc = readFileSync(new URL('../pages/report/detail-pc.vue', import.meta.url), 'utf8')

assert.match(
  detailPc,
  /<button class="download-btn" disabled[^>]*>\s*<Icon name="share-o"[^>]*\/>\s*<text>\{\{ t\('导出'\) \}\}<\/text>\s*<\/button>\s*<button class="download-btn" :disabled="downloadPdfDisabled" @click="downloadReportPdf">/,
  'PC report should show a disabled export placeholder before PDF download'
)
