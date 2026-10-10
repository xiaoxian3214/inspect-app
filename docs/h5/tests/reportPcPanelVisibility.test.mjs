import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canShowInteractiveUploadPanel,
  canShowReportCommentsPanel
} from '../pages/report/utils/detailPcInteractive.mjs'

assert.equal(canShowReportCommentsPanel({ pageQuery: { pdf: '1' } }), false)
assert.equal(canShowReportCommentsPanel({ pageQuery: { pdf: '0' } }), true)
assert.equal(canShowReportCommentsPanel({ pageQuery: {} }), true)

assert.equal(canShowInteractiveUploadPanel({
  pageQuery: { pdf: '1' },
  inspectorId: '11928',
  currentUserId: '11928'
}), false)
assert.equal(canShowInteractiveUploadPanel({
  pageQuery: {},
  inspectorId: '11928',
  currentUserId: '11928'
}), true)
assert.equal(canShowInteractiveUploadPanel({
  pageQuery: {},
  inspectorId: '11928',
  currentUserId: '11929'
}), false)
assert.equal(canShowInteractiveUploadPanel({
  pageQuery: {},
  inspectorId: '',
  currentUserId: '11928'
}), false)

const detailPc = readFileSync(new URL('../pages/report/detail-pc.vue', import.meta.url), 'utf8')
assert.match(
  detailPc,
  /<ReportInteractiveUploadPanel\s+v-if="showInteractiveUploadPanel"/,
  'interactive upload panel should be gated by PDF mode and inspector ownership'
)
assert.match(
  detailPc,
  /<ReportCommentsPanel\s+v-if="showReportCommentsPanel"/,
  'comments panel should not mount in PDF mode'
)
