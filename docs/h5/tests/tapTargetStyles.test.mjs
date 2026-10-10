import assert from 'node:assert/strict'
import fs from 'node:fs'

function getCssBlock(file, selector) {
  const source = fs.readFileSync(file, 'utf8')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))
  assert.ok(match, `${selector} block should exist in ${file}`)
  return match[1]
}

function assertTapTarget(block, selector) {
  assert.match(block, /(?:min-)?width\s*:\s*(?:88|96|100|112|120)rpx/, `${selector} should declare a large tap width`)
  assert.match(block, /(?:min-)?height\s*:\s*(?:80|88|96|100|112|120)rpx/, `${selector} should declare a large tap height`)
}

assertTapTarget(getCssBlock('pages/report/search.vue', '.back-btn'), '.back-btn')
assertTapTarget(getCssBlock('pages/report/components/ReportDetailHeader.vue', '.back'), '.back')
