import assert from 'node:assert/strict'
import fs from 'node:fs'

const scanner = fs.readFileSync('pages/report/composables/useScanner.js', 'utf8')
const checkItemModal = fs.readFileSync('pages/report/components/CheckItemModal.vue', 'utf8')

assert.match(scanner, /function\s+extractScanFormat\s*\(/, 'scanner should centralize scan format extraction')
assert.match(scanner, /formatName/, 'scanner should read H5 decodedResult formatName')
assert.match(scanner, /format:\s*extractScanFormat\(res\)/, 'native scan should return extracted format')
assert.match(scanner, /format:\s*extractScanFormat\(res\)/, 'DingTalk scan should return extracted format')
assert.match(checkItemModal, /onDecoded:\s*\(decodedText,\s*decodedResult\)/, 'H5 callback should receive decodedResult')
assert.match(checkItemModal, /extractScanFormat\(decodedResult\)/, 'H5 scan should save decodedResult format')
assert.match(checkItemModal, /uniResult\.format/, 'native scan should save returned scan format')
assert.doesNotMatch(checkItemModal, /applyBarcodeScanResult\(index,\s*scannedValue,\s*"H5_SCANNER"\)/, 'H5 scan should not save scanner source as format')
assert.doesNotMatch(checkItemModal, /applyBarcodeScanResult\(index,\s*uniResult\.value,\s*"NATIVE_SCANNER"\)/, 'native scan should not save scanner source as format')
