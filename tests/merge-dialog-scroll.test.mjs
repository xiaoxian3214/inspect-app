import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * 合并/拆分验货其余弹层的滚动契约。
 *
 * 背景：列表页【确认合并以下验货数据】在数据变多后无法滑动（已在 MergePlanSheet 修复）。
 * 同族弹层存在同样的“只设面板高度、没有滚动容器”缺陷：
 * - 【拆分验货】SplitPlanSheet 直接渲染 PlanMemberTable，而成员表内部的 scroll-view
 *   没有高度约束；面板只以 min/maxHeight 兜底，合并成员一多会重现内容被裁、底部按钮够不到。
 * - 【下载验货】PlanDownloadDetails 在固定 85% 高度的弹层里用 flex:1 滚动区，
 *   但缺少 min-height:0，内容长时可能撑破弹层（复用 CopyPlanSheet 已验证的写法）。
 */

/** 拆分弹层的成员列表必须可滚动，底部操作按钮固定在滚动区之外。 */
test('split sheet keeps member rows scrollable and actions reachable', async () => {
  const source = await readFile('components/search/SplitPlanSheet.uvue', 'utf8')
  const template = source.split('</template>')[0]
  const style = source.split('<style>')[1] ?? ''
  const scrollTag = template.match(/<scroll-view[^>]*split-body[^>]*>/)?.[0] ?? ''
  assert.match(scrollTag, /direction="vertical"/)
  assert.match(scrollTag, /:style="\{ maxHeight: splitBodyMaxHeight \}"/)
  assert.match(style, /\.split-body\s*\{[^}]*flex:\s*1/s)
  assert.match(style, /\.split-body\s*\{[^}]*min-height:\s*0/s)
  assert.match(source, /const splitBodyMaxHeight = computed\(\(\): string => windowHeightPx\(0\.62\)\)/)
  // 成员表与拆分说明都在滚动区内
  const bodyStart = template.indexOf(scrollTag)
  const bodyEnd = template.indexOf('</scroll-view>', bodyStart)
  assert.ok(bodyStart > 0 && bodyEnd > bodyStart)
  const bodyBlock = template.slice(bodyStart, bodyEnd)
  assert.match(bodyBlock, /<PlanMemberTable/)
  assert.match(bodyBlock, /class="summary-text"/)
  // 面板以窗口高度兜底，底部按钮在滚动区外
  assert.match(template, /:style="\{ maxHeight: sheetMaxHeight, minHeight: sheetMinHeight \}"/)
  const actionsIndex = template.indexOf('class="sheet-actions"')
  assert.ok(actionsIndex > bodyEnd)
})

/** 下载验货弹层的详情滚动区在固定高度弹层内必须能收缩，不能撑破 85% 高度。 */
test('download confirm sheet bounds its scrolling details area', async () => {
  const details = await readFile('components/inspection/PlanDownloadDetails.uvue', 'utf8')
  const style = details.split('<style>')[1] ?? ''
  assert.match(style, /\.download-info-scroll\s*\{[^}]*flex:\s*1/s)
  assert.match(style, /\.download-info-scroll\s*\{[^}]*min-height:\s*0/s)
})