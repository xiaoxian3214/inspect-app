import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let shouldAcceptClick
try {
  ;({ shouldAcceptClick } = await import('../utils/clickGuard.js'))
} catch (error) {
  assert.fail(`click guard helper should be importable: ${error.message}`)
}

assert.equal(shouldAcceptClick(Number.NEGATIVE_INFINITY, 1_000, 300), true)
assert.equal(shouldAcceptClick(1_000, 1_100, 300), false)
assert.equal(shouldAcceptClick(1_000, 1_299, 300), false)
assert.equal(shouldAcceptClick(1_000, 1_300, 300), true)
assert.equal(shouldAcceptClick(1_000, 1_000, 0), true)

const appButton = readFileSync(new URL('../components/AppButton.vue', import.meta.url), 'utf8')

assert.match(appButton, /debounce:\s*\{[\s\S]*?default:\s*300/)
assert.match(appButton, /shouldAcceptClick\(lastAcceptedAt,\s*now,\s*props\.debounce\)/)
assert.match(appButton, /if\s*\(!shouldAcceptClick\([^)]*\)\)\s*return/)
