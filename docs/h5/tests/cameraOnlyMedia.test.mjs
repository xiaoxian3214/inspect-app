import assert from 'node:assert/strict'
import fs from 'node:fs'

const mediaGrid = fs.readFileSync('pages/report/components/MediaGrid.vue', 'utf8')
const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

assert.match(mediaGrid, /sourceType:\s*options\.sourceType\s*\|\|\s*\["camera"\]/, 'MediaGrid should default to camera source')
assert.match(mediaGrid, /function pickViaFileInput\([^)]*\)/, 'MediaGrid should provide browser capture fallback')
assert.match(mediaGrid, /input\.type\s*=\s*["']file["']/, 'browser fallback should use native file input')
assert.match(mediaGrid, /input\.accept\s*=\s*options\.imageOnly\s*\?\s*["']image\/\*["']\s*:\s*["']image\/\*,video\/\*["']/, 'browser fallback should capture images or videos by default')
assert.match(mediaGrid, /input\.setAttribute\(["']capture["'],\s*["']environment["']\)/, 'browser fallback should request rear camera capture')
assert.match(mediaGrid, /else\s*\{\s*pickViaFileInput\([^)]*\);?\s*\}/, 'MediaGrid should use browser capture fallback when camera APIs are missing')
assert.match(mediaGrid, /defineExpose\(\{\s*handleAdd,\s*captureFromCamera:\s*handleAdd,\s*pickCheckPointImage\s*\}\)/, 'MediaGrid should expose captureFromCamera for camera buttons')
assert.doesNotMatch(mediaGrid, /拍照\/相册/, 'MediaGrid add button should not mention album')
assert.doesNotMatch(mediaGrid, /当前环境不支持现场拍照/, 'MediaGrid should not show unsupported camera toast')
assert.doesNotMatch(detail, /sourceType:\s*\['album',\s*'camera'\]/, 'detail pickLocalFiles should not request album source')
assert.match(detail, /sourceType:\s*\['camera'\]/, 'detail pickLocalFiles should request camera source only')
assert.match(detail, /input\.type\s*=\s*['"]file['"]/, 'detail should provide browser capture fallback')
assert.match(detail, /input\.accept\s*=\s*['"]image\/\*,video\/\*['"]/, 'detail browser fallback should accept images or videos')
assert.match(detail, /input\.setAttribute\('capture',\s*capture\)/, 'detail browser fallback should request capture')
assert.doesNotMatch(detail, /当前环境不支持现场拍照/, 'detail camera flow should not show unsupported camera toast')
