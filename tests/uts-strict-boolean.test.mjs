import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('plan API avoids TypeScript truthy fallbacks rejected by UTS', async () => {
  const source = await readFile('api/planApi.uts', 'utf8')
  assert.doesNotMatch(source, /String\([^\n]*\|\|/)
  assert.doesNotMatch(source, /Number\([^)]*\|\|/)
  assert.doesNotMatch(source, /\.filter\(Boolean\)/)
})

test('report file API uses explicit UTS-safe fallbacks and token checks', async () => {
  const source = await readFile('api/reportFileApi.uts', 'utf8')
  assert.doesNotMatch(source, /String\([^\n]*\|\|/)
  assert.doesNotMatch(source, /Number\([^)]*\|\|/)
  assert.doesNotMatch(source, /if \(session\?\.token\)/)
  assert.doesNotMatch(source, /options\.(uploadTransport|downloadTransport) \|\|/)
})

/** 校验清单页使用显式布尔条件，而不误报空值合并表达式。 */
test('checklist component avoids non-boolean UTS fallback expressions', async () => {
  const source = await readFile('components/detail/ChecklistTab.uvue', 'utf8')
  assert.doesNotMatch(source, /String\([^)]*\|\|/)
  assert.doesNotMatch(source, /\?\.[A-Za-z0-9_]+\s*\|\|/)
  assert.doesNotMatch(source, /sonPlanId\s*\?(?!\?)/)
  assert.doesNotMatch(source, /v-if="getItem(Result|Comment|FirstPhoto|PhotoCount|Defects|defectThumb)\([^"\n]*\)"/)
})
