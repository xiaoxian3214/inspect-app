import CryptoJS from 'crypto-js'

const KEY_SIZE = 32

function normalizeKey(rawKey) {
  const hash = CryptoJS.SHA256(rawKey).toString()
  return CryptoJS.enc.Hex.parse(hash.slice(0, KEY_SIZE * 2))
}

export function aesEncrypt(plainText, rawKey) {
  if (!plainText) return ''
  const key = normalizeKey(rawKey)
  const iv = CryptoJS.lib.WordArray.random(16)
  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return `${CryptoJS.enc.Base64.stringify(iv)}:${encrypted.toString()}`
}

export function aesDecrypt(cipherText, rawKey) {
  if (!cipherText) return ''
  const [ivBase64, encrypted] = cipherText.split(':')
  const key = normalizeKey(rawKey)
  const iv = CryptoJS.enc.Base64.parse(ivBase64)
  const decrypted = CryptoJS.AES.decrypt(encrypted, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}
