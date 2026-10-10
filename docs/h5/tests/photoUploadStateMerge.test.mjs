import assert from 'node:assert/strict'
import fs from 'node:fs'

const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

assert.match(detail, /function\s+mergeLivePhotoUploadState\s*\(/, 'detail should merge live upload state before saving modal data')
assert.match(detail, /function\s+buildCurrentItemSaveData\s*\(/, 'detail should centralize current item save payload building')
assert.match(detail, /const\s+nextData\s*=\s*\{\s*\n\s*\.\.\.currentItemData\.value,/, 'current item save payload should start from modal data')
assert.match(detail, /return\s+mergeLivePhotoUploadState\(nextData,\s*existingData\)/, 'current item save payload should preserve existing photo upload status')
assert.match(detail, /existingStatus\s*===\s*'retry_wait'/, 'modal saves should preserve a photo waiting for automatic retry')
assert.match(detail, /existingStatus\s*===\s*'needs_attention'/, 'modal saves should preserve permanent upload errors')
assert.match(detail, /nextRetryAt:\s*existing\.nextRetryAt/, 'modal saves should preserve the persisted retry schedule')
assert.match(detail, /checklistData\.value\[dataKey\]\s*=\s*buildCurrentItemSaveData\(/, 'auto-save paths should not write stale currentItemData directly')
assert.doesNotMatch(detail, /checklistData\.value\[dataKey\]\s*=\s*\{\s*\n\s*\.\.\.currentItemData\.value,\s*\n\s*completed:/, 'currentItemData should not overwrite checklistData photo statuses directly')
