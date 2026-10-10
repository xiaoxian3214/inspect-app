import assert from 'node:assert/strict'
import fs from 'node:fs'

const list = fs.readFileSync('pages/report/list.vue', 'utf8')

assert.match(list, /const inviteCopying\s*=\s*ref\(false\)/, 'invite copy button should track copying state')
assert.match(list, /const inviteCopied\s*=\s*ref\(false\)/, 'invite copy button should track copied state')
assert.match(list, /:disabled="inviteCopying"/, 'copy link button should be disabled while copying')
assert.match(list, /inviteCopying\s*\?\s*t\('复制中\.\.\.'\)/, 'copy link button should show copying feedback')
assert.match(list, /inviteCopied\s*\?\s*t\('已复制'\)/, 'copy link button should show copied feedback')
assert.match(list, /function copyTextToClipboard\(/, 'copying should use a shared clipboard helper')
assert.match(list, /navigator\.clipboard\.writeText/, 'clipboard helper should support browser clipboard API')
assert.match(list, /document\.execCommand\('copy'\)/, 'clipboard helper should provide textarea fallback')
assert.match(list, /title:\s*t\('邀请链接已复制'\)/, 'successful copy should show a success toast')
assert.match(list, /title:\s*t\('请长按复制下方链接'\)/, 'failed copy should tell the user how to recover')
