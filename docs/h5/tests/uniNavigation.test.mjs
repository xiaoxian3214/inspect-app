import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detail = readFileSync(new URL('../pages/report/detail.vue', import.meta.url), 'utf8')
const listSimple = readFileSync(new URL('../pages/report/list-simple.vue', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

assert.doesNotMatch(detail, /\brouter\b/, 'report detail should not reference an undeclared router')
assert.match(
  detail,
  /uni\.reLaunch\(\{\s*url:\s*['"]\/pages\/report\/list['"]\s*\}\)/,
  'report detail should return to the report list with uni.reLaunch'
)

assert.doesNotMatch(listSimple, /useRouter|\brouter\b/, 'simple report list should use uni navigation directly')
assert.match(
  listSimple,
  /uni\.reLaunch\(\{\s*url:\s*['"]\/pages\/login\/login['"]\s*\}\)/,
  'logout should clear the page stack with uni.reLaunch'
)

assert.equal(packageJson.dependencies?.['vue-router'], undefined, 'vue-router dependency should be removed')
