import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('finish sheet offers H5 APPROVED REJECTED PENDING result options', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes(`value: 'APPROVED'`))
  assert.ok(source.includes(`value: 'REJECTED'`))
  assert.ok(source.includes(`value: 'PENDING'`))
  assert.ok(!source.includes(`value: 'PASS'`))
  assert.ok(!source.includes(`value: 'FAIL'`))
})

test('finish sheet limits remarks to the H5 3000 character cap', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes('maxlength'))
  assert.ok(source.includes('3000'))
})

test('finish sheet renders AQL defect stats and failed checkpoints with exceed highlight', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes('defect-stats') || source.includes('defectStats'))
  assert.ok(source.includes('failed-checkpoints') || source.includes('failedCheckpoints'))
  assert.ok(source.includes('exceed'))
  assert.ok(source.includes('疵点数量超出AQL允许最大值'))
})

test('detail page wires finish summary props and H5 overall result values', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes('buildFinishSummary'))
  assert.ok(source.includes('normalizeOverallResult'))
  assert.ok(source.includes('defect-stats') || source.includes(':defect-stats'))
  assert.ok(source.includes('exceeds-aql'))
  assert.ok(source.includes('failed-checkpoints'))
  assert.ok(!source.includes(`value: 'PASS'`))
})

test('detail page confirms missing mandatory data before blocking final submit', async () => {
  const source = await readFile('pages/report/detail.uvue', 'utf8')
  assert.ok(source.includes('强制性数据缺失'))
  assert.ok(source.includes('有的检查项目要求必须有相关信息或图片'))
  assert.match(source, /validation\.reason === 'missing-results' \|\| validation\.reason === 'missing-photos'/)
  assert.ok(source.includes('showMissingDataConfirm.value = true'))
  assert.ok(source.includes('variant="dialog"'))
})

/** 总结弹层展示 H5 数量区并允许从已备好数量进入原生设置弹层。 */
test('finish sheet includes H5 quantities and ready quantity action', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.ok(source.includes('订单数量'))
  assert.ok(source.includes('已备好数量'))
  assert.ok(source.includes('预计抽样数量'))
  assert.ok(source.includes("emit('set-ready-quantity')"))
})

/** 只把疵点、状态和评语按 H5 调整，标题、数量、提示和双按钮沿用原生弹层。 */
test('finish sheet preserves its original chrome while matching H5 defect status and remarks', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  for (const part of ['modal-header', '总结并提交', '最终提交需要联网', 'section-title', 'ready-label', 'actions', 'button cancel', 'button submit', '确认提交', 'finish-defect-header', 'finish-status-tag', 'finish-set-status-btn', 'finish-remarks', 'finish-status-sheet-option', 'finish-status-reset-btn']) {
    assert.ok(source.includes(part), `${part} should be present`)
  }
  assert.ok(source.includes('总结评论'))
  assert.ok(!source.includes('finish-topbar-more'))
  assert.ok(!source.includes('result-row'), 'status must be set in its own sheet')
  assert.match(source, /windowHeightPx\(0\.92\)/)
  assert.match(source, /height: dialogHeight/)
  assert.match(source, /windowHeightPx\(0\.88\)/)
  assert.match(source, /\.modal-content\s*\{[^}]*flex:\s*1/)
})

/** 沿用原生弹层既有的确认提交入口及详情页的最终提交校验。 */
test('finish sheet keeps its original final submission flow', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const sheet = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.match(page, /@submit="submitFinalReport"/)
  assert.match(sheet, /emit\('submit'\)/)
  assert.match(page, /async function submitFinalReport\(\)[\s\S]*?validateFinalSubmission\(/)
  assert.ok(!sheet.includes('finish-confirm-overlay'))
  assert.ok(sheet.includes('重置状态'))
  assert.match(page, /finishFlag: 1/)
  assert.match(page, /waitForCurrentPlanReported\(\(currentPlanId\) => planApi\.getPlanDetail\(currentPlanId\), payload\.planId\)/)
  assert.match(page, /saveDetailSnapshot\(planId\.value, completed\)/)
})

/** 报告生成后若详情页已卸载，不应继续更新被销毁的原生视图或预约延迟返回。 */
test('final submission does not mutate unmounted detail page or retain a navigation timer', async () => {
  const page = await readFile('pages/report/detail.uvue', 'utf8')
  const submit = page.split('async function submitFinalReport()')[1].split('/** 打开详情更多操作菜单')[0]
  assert.match(submit, /await reportRepository\.saveDetailSnapshot\(planId\.value, completed\)/)
  assert.match(submit, /if \(pageDisposed\) return/)
  assert.match(submit, /scheduleFinishNavigation\(\)/)
  assert.doesNotMatch(submit, /setTimeout\(\(\) => uni\.navigateBack\(\), 500\)/)
  assert.match(page, /function handlePageUnload\(\)[^{]*\{[^}]*clearFinishNavigation\(\)/)
  assert.match(page, /finally \{ if \(!pageDisposed\) submitting\.value = false \}/)
})

/** 每次重新打开总结弹层时，失败检查点应恢复为 H5 默认展开状态。 */
test('reopening finish summary expands failed checkpoints', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.match(source, /watch\(\(\): boolean => props\.visible,[\s\S]*?failedCheckpointsExpanded\.value = true/)
})

/** 原生按钮内建行高会令总结弹层的文字偏移，改用与 AppButton 一致的居中容器。 */
test('finish sheet centers every action label without native button line height', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.doesNotMatch(source, /<button\b/)
  for (const part of ['finish-set-status-btn', 'button cancel', 'button submit', 'finish-status-reset-btn', 'finish-status-sheet-cancel']) {
    assert.ok(source.includes(`class="${part}"`), `${part} must be a centered action view`)
  }
  for (const part of ['.button', '.finish-set-status-btn', '.finish-status-reset-btn', '.finish-status-sheet-cancel']) {
    assert.match(source, new RegExp(`\\${part}\\s*\\{[^}]*align-items:\\s*center;[^}]*justify-content:\\s*center;`))
  }
  assert.match(source, /function submit\(\) \{ if \(!props\.submitting\) emit\('submit'\) \}/)
})

/** 疵点表头和三项数据共用固定数值列，减少行高并给总结评语清晰边界。 */
test('finish defect columns align compactly and remarks have a visible border', async () => {
  const source = await readFile('components/detail/FinishInspectionSheet.uvue', 'utf8')
  assert.match(source, /class="info-row finish-defect-row"/)
  assert.match(source, /class="finish-defect-label"/)
  assert.match(source, /\.finish-defect-spacer\s*\{\s*flex:\s*1;/)
  assert.match(source, /\.finish-defect-label\s*\{\s*flex:\s*1;/)
  assert.match(source, /\.finish-defect-row\s*\{[^}]*min-height:\s*5[0-9]rpx;/)
  assert.match(source, /\.finish-defect-col-hd\s*\{[^}]*width:\s*128rpx;/)
  assert.match(source, /\.finish-defect-col\s*\{[^}]*width:\s*128rpx;/)
  assert.match(source, /\.finish-remarks\s*\{[^}]*border-width:\s*2rpx;[^}]*border-color:\s*#[\da-f]{6};/)
})
