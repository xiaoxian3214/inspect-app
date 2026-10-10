import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode'
import * as dingtalkJsApi from 'dingtalk-jsapi'

const dd = dingtalkJsApi?.default || dingtalkJsApi
console.log('[scanner] dingtalk-jsapi imported:', {
  hasDefault: !!dingtalkJsApi?.default,
  ddKeys: dd ? Object.keys(dd).slice(0, 20) : [],
  ddEnv: dd?.env,
  ddBiz: !!dd?.biz
})

function normalizeScanFormat(format) {
  const raw = String(format || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(/[\s-]+/g, '_')
  if (/^code_?128$/i.test(normalized)) return 'CODE_128'
  if (/^code_?39$/i.test(normalized)) return 'CODE_39'
  if (/^code_?93$/i.test(normalized)) return 'CODE_93'
  if (/^qr_?code$/i.test(normalized) || /^qr$/i.test(normalized)) return 'QR_CODE'
  if (/^bar_?code$/i.test(normalized) || /^bar$/i.test(normalized)) return 'BAR_CODE'
  if (/^ean_?13$/i.test(normalized)) return 'EAN_13'
  if (/^ean_?8$/i.test(normalized)) return 'EAN_8'
  if (/^pdf_?417$/i.test(normalized)) return 'PDF_417'
  if (/^data_?matrix$/i.test(normalized)) return 'DATA_MATRIX'
  return normalized.toUpperCase()
}

function extractScanText(res) {
  return String(
    res?.text ??
    res?.result ??
    res?.code ??
    res?.value ??
    res?.content ??
    ''
  ).trim()
}

export function useScanner(options = {}) {
  const t = typeof options.t === 'function' ? options.t : (value) => value
  let h5Scanner = null

  function extractScanFormat(res) {
    const format =
      res?.result?.format?.formatName ??
      res?.result?.formatName ??
      res?.format?.formatName ??
      res?.formatName ??
      res?.format ??
      res?.scanType ??
      res?.type ??
      res?.codeType ??
      ''
    return normalizeScanFormat(format)
  }

  function isDingTalkEnvironment() {
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : ''
    const hasDdEnv = !!(dd && dd.env)
    const ddPlatform = hasDdEnv ? dd.env.platform : 'N/A'
    const uaMatch = /DingTalk/i.test(ua)
    console.log('[scanner] isDingTalkEnvironment check:', {
      hasDd: !!dd,
      hasDdEnv,
      ddPlatform,
      uaMatch,
      ua: ua.substring(0, 200)
    })
    if (hasDdEnv && ddPlatform !== 'notInDingTalk') {
      return true
    }
    return uaMatch
  }

  function isH5Platform() {
    // 即使在钉钉环境，因为我们要有 fallback 到 H5 扫码的能力，所以这里不能直接 return false
    try {
      const platform = String(uni?.getSystemInfoSync?.()?.uniPlatform || '').toLowerCase()
      return platform === 'h5' || platform === 'web'
    } catch {
      return typeof window !== 'undefined' && typeof document !== 'undefined'
    }
  }

  function scanByDingTalk() {
    console.log('[scanner] scanByDingTalk called, dd.biz:', dd?.biz, 'dd.biz.util:', dd?.biz?.util, 'dd.biz.util.scan:', dd?.biz?.util?.scan)
    return new Promise((resolve) => {
      dd.biz.util.scan({
        type: 'all', // qrCode（仅二维码）/ barCode（仅条形码）/ all（默认全部）
        onSuccess: (res) => {
          console.log('[scanner] dingtalk scan result:', res)
          const scannedValue = extractScanText(res)
          if (!scannedValue) {
            resolve({ ok: false, supported: true, canceled: false, value: '' })
            return
          }
          resolve({ ok: true, supported: true, canceled: false, value: scannedValue, format: extractScanFormat(res) })
        },
        onFail: (err) => {
          console.error('[scanner] dingtalk scan failed:', err)
          // 取消或者失败都算取消，不再走到 fallback
          resolve({ ok: false, supported: true, canceled: true, value: '' })
        }
      })
    })
  }

  function scanByUni() {
    const isDingTalk = isDingTalkEnvironment()
    console.log('[scanner] scanByUni called, isDingTalk:', isDingTalk)
    return new Promise((resolve) => {
      if (isDingTalk) {
        scanByDingTalk().then(resolve)
        return
      }

      if (typeof uni === 'undefined' || typeof uni.scanCode !== 'function') {
        resolve({ ok: false, supported: false, canceled: false, value: '' })
        return
      }

      uni.scanCode({
        scanType: ['qrCode', 'barCode', 'datamatrix', 'pdf417'],
        onlyFromCamera: false,

        success: (res) => {
          const scannedValue = extractScanText(res)
          if (!scannedValue) {
            resolve({ ok: false, supported: true, canceled: false, value: '' })
            return
          }
          resolve({ ok: true, supported: true, canceled: false, value: scannedValue, format: extractScanFormat(res) })
        },
        fail: (error) => {
          const errMsg = String(error?.errMsg || '').toLowerCase()
          if (errMsg.includes('cancel')) {
            resolve({ ok: false, supported: true, canceled: true, value: '' })
            return
          }
          resolve({ ok: false, supported: true, canceled: false, value: '' })
        }
      })
    })
  }

  function getH5ScannerErrorMessage(error) {
    const errName = String(error?.name || '')
    const errMsg = String(error?.message || '')

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return t('摄像头访问仅支持 HTTPS 或 localhost')
    }
    if (errName === 'NotAllowedError') {
      return t('您需要授予相机访问权限')
    }
    if (errName === 'NotFoundError') {
      return t('当前设备未检测到可用摄像头')
    }
    if (errName === 'NotSupportedError') {
      return t('当前浏览器不支持摄像头访问')
    }
    if (errName === 'NotReadableError') {
      return t('相机被占用，请关闭其他应用后重试')
    }
    if (errName === 'OverconstrainedError') {
      return t('当前摄像头参数不受支持，请重试')
    }
    if (errName === 'StreamApiNotSupportedError') {
      return t('当前浏览器不支持媒体流 API')
    }
    if (errMsg.toLowerCase().includes('permission')) {
      return t('摄像头权限被拒绝，请在浏览器设置中允许后重试')
    }
    return t('无法打开扫码器，请检查摄像头权限')
  }

  async function startH5Scanner(params = {}) {
    const {
      elementId,
      fps = 30, // 提高帧率到30，加快识别频率
      onDecoded = () => {}
    } = params

    // H5 扫码器因为需要满屏显示，这里的 aspectRatio 不再传给 start，
    // 而是让 html5-qrcode 使用默认的或者我们不通过它来控制比例
    // 强制 qrbox 为正方形
    const qrbox = { width: 260, height: 260 }

    if (!elementId) {
      throw new Error('scanner element id is required')
    }

    await stopH5Scanner()

    const scanner = new Html5Qrcode(elementId)
    h5Scanner = scanner

    // 缩减支持的格式，移除不常用的以提升识别速度
    const formatsToSupport = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39
    ].filter(Boolean)

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps,
        qrbox,
        formatsToSupport,
        disableFlip: false,
        videoConstraints: {
          facingMode: 'environment',
          focusMode: "continuous"
        }
      },
      onDecoded,
      () => {}
    )

    return scanner
  }

  async function stopH5Scanner() {
    if (!h5Scanner) return

    const scanner = h5Scanner
    h5Scanner = null

    try {
      const state = typeof scanner.getState === 'function' ? scanner.getState() : null
      const canStop = state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED
      if (canStop) {
        await scanner.stop()
      }
    } catch (error) {
      const errMsg = String(error?.message || error || '')
      if (!errMsg.includes('scanner is not running or paused')) {
        console.warn('[scanner] stop h5 scanner failed:', error)
      }
    }

    try {
      await scanner.clear()
    } catch (error) {
      console.warn('[scanner] clear h5 scanner failed:', error)
    }
  }

  async function setZoom(zoomValue) {
    if (!h5Scanner) return false;
    try {
      await h5Scanner.applyVideoConstraints({
        advanced: [{ zoom: zoomValue }]
      });
      return true;
    } catch (error) {
      console.warn('[scanner] apply zoom failed:', error);
      return false;
    }
  }

  async function getCameraCapabilities() {
    if (!h5Scanner) return null;
    try {
      const track = h5Scanner.getRunningTrack();
      if (track && typeof track.getCapabilities === 'function') {
        return track.getCapabilities();
      }
    } catch (error) {
      console.warn('[scanner] get capabilities failed:', error);
    }
    return null;
  }

  return {
    isH5Platform,
    scanByUni,
    startH5Scanner,
    stopH5Scanner,
    setZoom,
    getCameraCapabilities,
    extractScanFormat,
    getH5ScannerErrorMessage
  }
}
