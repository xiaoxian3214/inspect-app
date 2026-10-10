import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const detailPc = readFileSync(new URL('../pages/report/detail-pc.vue', import.meta.url), 'utf8')

assert.match(detailPc, /import\s*\{[^}]*getMediaPhotos[^}]*toChecklistPhotos[^}]*\}\s*from\s*['"]\.\/utils\/checkPointMedia\.js['"]/, 'PC detail should preserve file bizType during hydration')
assert.match(detailPc, /v-for="\(photo, idx\) in getMediaPhotos\(defect\.photos\)"/, 'defect gallery should hide checkpoint images')
assert.match(detailPc, /v-for="\(photo, idx\) in getMediaPhotos\(itemMainResult\(item\)\.photos\)"/, 'checklist gallery should hide checkpoint images')
assert.match(detailPc, /v-for="\(photo, idx\) in getMediaPhotos\(itemMainResult\(item, plan\.id\)\.photos\)"/, 'merged checklist gallery should hide checkpoint images')
assert.match(detailPc, /openPreview\(getMediaPhotos\(defect\.photos\), idx\)/, 'defect preview should use filtered indexes')
assert.match(detailPc, /openPreview\(getMediaPhotos\(itemMainResult\(item\)\.photos\), idx\)/, 'checklist preview should use filtered indexes')
assert.match(detailPc, /openPreview\(getMediaPhotos\(itemMainResult\(item, plan\.id\)\.photos\), idx\)/, 'merged checklist preview should use filtered indexes')
