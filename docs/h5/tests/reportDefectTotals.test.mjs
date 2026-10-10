import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getAffectedDefectCounts } from '../pages/report/utils/defectTotals.js'

const normalizeSeverity = (value, label) => String(value || label || '').toUpperCase()
assert.deepEqual(getAffectedDefectCounts([
  { type: 'CRITICAL', quantity: 3 },
  { type: 'critical', quantity: '5' },
  { type: 'MAJOR', quantity: 12 },
  { typeLabel: 'MINOR', defectCount: '4' },
  { type: 'MINOR', quantity: 0, defectCount: 7 },
  { type: 'MAJOR', quantity: null, commonFlag: 1 },
  { type: 'MAJOR', quantity: -2 },
  { type: 'MINOR', quantity: 'invalid' },
  { type: 'CRITICAL', quantity: Infinity }
], normalizeSeverity), { critical: 8, major: 12, minor: 4 })
assert.deepEqual(getAffectedDefectCounts([], normalizeSeverity), { critical: 0, major: 0, minor: 0 })
const detail = readFileSync(new URL('../pages/report/detail.vue', import.meta.url), 'utf8')
assert.match(detail, /getAffectedDefectCounts\(defects\.value, normalizeSeverityValue\)/)
assert.match(detail, /actual: finishAffectedDefectCounts\.value\.critical/)
assert.match(detail, /actual: finishAffectedDefectCounts\.value\.major/)
assert.match(detail, /actual: finishAffectedDefectCounts\.value\.minor/)
