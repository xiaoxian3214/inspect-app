import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const { normalizeScanFormat } = await loadUtsModule('domain/barcodeScan.uts')

/** 原生扫码格式统一转换成与 H5 一致的服务端格式。 */
test('normalizes native barcode formats like H5', () => {
  assert.equal(normalizeScanFormat('CODE128'), 'CODE_128')
  assert.equal(normalizeScanFormat('qrCode'), 'QR_CODE')
  assert.equal(normalizeScanFormat('ean-13'), 'EAN_13')
  assert.equal(normalizeScanFormat('PDF417'), 'PDF_417')
  assert.equal(normalizeScanFormat(''), '')
})
