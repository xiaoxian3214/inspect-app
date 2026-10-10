import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const reportApi = await import('../api/report.js')

test('upload stall guard resets only when uploaded bytes increase', () => {
  assert.equal(typeof reportApi.createUploadStallGuard, 'function')

  let nextTimerId = 0
  const timers = new Map()
  let stalled = 0
  const guard = reportApi.createUploadStallGuard({
    timeoutMs: 60_000,
    onStall: () => { stalled++ },
    setTimeoutFn: (callback) => {
      const id = ++nextTimerId
      timers.set(id, callback)
      return id
    },
    clearTimeoutFn: id => timers.delete(id)
  })

  assert.equal(timers.size, 1)
  guard.markProgress(100)
  assert.equal(timers.size, 1)
  const timerAfterProgress = [...timers.keys()][0]
  guard.markProgress(100)
  assert.equal([...timers.keys()][0], timerAfterProgress)
  guard.markProgress(200)
  assert.notEqual([...timers.keys()][0], timerAfterProgress)

  const activeTimer = [...timers.values()][0]
  activeTimer()
  assert.equal(stalled, 1)
  guard.clear()
})

test('queued upload does not start the stall timeout before bytes are sent', () => {
  let nextTimerId = 0
  const timers = new Map()
  let stalled = 0
  const guard = reportApi.createUploadStallGuard({
    timeoutMs: 60_000,
    startImmediately: false,
    onStall: () => { stalled++ },
    setTimeoutFn: (callback) => {
      const id = ++nextTimerId
      timers.set(id, callback)
      return id
    },
    clearTimeoutFn: id => timers.delete(id)
  })

  assert.equal(timers.size, 0, 'waiting for a network slot must not count as an upload stall')
  guard.markProgress(0)
  assert.equal(timers.size, 0, 'zero-byte progress must not start the stall timeout')

  guard.markProgress(1)
  assert.equal(timers.size, 1, 'the stall timeout starts after the first uploaded byte')
  const activeTimer = [...timers.values()][0]
  activeTimer()
  assert.equal(stalled, 1)
  guard.clear()
})

test('cleared upload stall guard ignores late progress callbacks', () => {
  let nextTimerId = 0
  const timers = new Map()
  const guard = reportApi.createUploadStallGuard({
    timeoutMs: 60_000,
    onStall: () => {},
    setTimeoutFn: (callback) => {
      const id = ++nextTimerId
      timers.set(id, callback)
      return id
    },
    clearTimeoutFn: id => timers.delete(id)
  })

  assert.equal(timers.size, 1)
  guard.clear()
  assert.equal(timers.size, 0)
  guard.markProgress(100)
  assert.equal(timers.size, 0, 'late progress after settlement must not re-arm the timer')
})

test('H5 upload waiting for a network slot is not rejected by the transfer stall clock', async () => {
  const originalXhr = globalThis.XMLHttpRequest
  const originalLocalStorage = globalThis.localStorage
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let nextTimerId = 0

  class QueuedXMLHttpRequest {
    constructor() {
      this.upload = {}
    }

    open() {}
    setRequestHeader() {}
    send() {}
    abort() {}
  }

  globalThis.XMLHttpRequest = QueuedXMLHttpRequest
  globalThis.localStorage = { getItem: () => null }
  globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimerId
    if (delay === 60_000) queueMicrotask(callback)
    return id
  }
  globalThis.clearTimeout = () => {}

  try {
    const upload = reportApi.uploadInspectFile(
      new Blob(['image'], { type: 'image/jpeg' }),
      { bizId: 'queued-image', bizType: 'checkResult' }
    )
    let outcome = 'pending'
    upload.then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' }
    )
    await new Promise(resolve => originalSetTimeout(resolve, 0))

    assert.equal(outcome, 'pending')
  } finally {
    globalThis.XMLHttpRequest = originalXhr
    globalThis.localStorage = originalLocalStorage
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('native upload waiting for a network slot is not rejected by the transfer stall clock', async () => {
  const originalUni = globalThis.uni
  const originalPlus = globalThis.plus
  const originalLocalStorage = globalThis.localStorage
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let nextTimerId = 0

  globalThis.plus = {}
  globalThis.localStorage = { getItem: () => null }
  globalThis.uni = {
    getStorageSync: () => '',
    uploadFile: () => ({
      abort() {},
      onProgressUpdate() {}
    })
  }
  globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimerId
    if (delay === 60_000) queueMicrotask(callback)
    return id
  }
  globalThis.clearTimeout = () => {}

  try {
    const upload = reportApi.uploadInspectFile('/tmp/queued-image.jpg', {
      bizId: 'queued-image',
      bizType: 'checkResult',
      mediaType: 'image'
    })
    let outcome = 'pending'
    upload.then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' }
    )
    await new Promise(resolve => originalSetTimeout(resolve, 0))

    assert.equal(outcome, 'pending')
  } finally {
    globalThis.uni = originalUni
    globalThis.plus = originalPlus
    globalThis.localStorage = originalLocalStorage
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('H5 and native uploads feed real progress into the stall guard', () => {
  const source = fs.readFileSync('api/report.js', 'utf8')

  assert.match(source, /new\s+XMLHttpRequest\s*\(/)
  assert.match(source, /xhr\.upload\.onprogress\s*=/)
  assert.match(source, /uploadTask\?\.onProgressUpdate/)
  assert.match(source, /UPLOAD_STALL_TIMEOUT_MS\s*=\s*60000/)
})

test('H5 upload errors preserve the HTTP status for retry classification', async () => {
  const originalXhr = globalThis.XMLHttpRequest
  const originalLocalStorage = globalThis.localStorage

  class RejectedXMLHttpRequest {
    constructor() {
      this.upload = {}
      this.status = 413
      this.responseText = JSON.stringify({ message: 'file too large' })
    }

    open() {}
    setRequestHeader() {}
    abort() {}
    send() { this.onload() }
  }

  globalThis.XMLHttpRequest = RejectedXMLHttpRequest
  globalThis.localStorage = { getItem: () => null }
  try {
    await assert.rejects(
      reportApi.uploadInspectFile(
        new Blob(['image'], { type: 'image/jpeg' }),
        { bizId: 'rejected-image', bizType: 'checkResult' }
      ),
      error => error?.httpStatus === 413 && error?.message === 'file too large'
    )
  } finally {
    globalThis.XMLHttpRequest = originalXhr
    globalThis.localStorage = originalLocalStorage
  }
})

test('image upload concurrency scales up only on healthy networks', async () => {
  assert.equal(fs.existsSync('utils/networkQuality.js'), true)
  const { resolveImageUploadConcurrency } = await import('../utils/networkQuality.js')

  assert.equal(resolveImageUploadConcurrency({ networkType: '2g' }), 1)
  assert.equal(resolveImageUploadConcurrency({ networkType: '3g' }), 1)
  assert.equal(resolveImageUploadConcurrency({ networkType: '4g' }), 2)
  assert.equal(resolveImageUploadConcurrency({ networkType: 'wifi', downlink: 8, rtt: 80 }), 4)
  assert.equal(resolveImageUploadConcurrency({ networkType: '5g', downlink: 0.4, rtt: 900 }), 1)
})

test('report upload queue uses detected image concurrency', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

  assert.match(detail, /detectImageUploadConcurrency/)
  assert.match(detail, /mediaKind\s*===\s*'image'[\s\S]{0,120}detectImageUploadConcurrency/)
  assert.match(detail, /mediaKind,\s*\n\s*concurrency,/)
})

test('report schedules persisted retry waits and resumes them on browser lifecycle events', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')

  assert.match(detail, /getNextPhotoUploadRetryAt/)
  assert.match(detail, /let\s+_photoUploadRetryTimer\s*=\s*null/)
  assert.match(detail, /function\s+scheduleNextPhotoUploadRetry/)
  assert.match(detail, /function\s+clearPhotoUploadRetryTimer/)
  assert.match(detail, /addEventListener\('visibilitychange'/)
  assert.match(detail, /addEventListener\('pageshow'/)
  assert.match(detail, /removeEventListener\('visibilitychange'/)
  assert.match(detail, /removeEventListener\('pageshow'/)
  assert.match(detail, /finally\s*\{[\s\S]{0,120}scheduleNextPhotoUploadRetry\(\)/)
  assert.doesNotMatch(detail, /result\.blocked[\s\S]{0,300}_photoUploadsPaused\s*=\s*true/)
})

test('leaving the report clears the automatic photo retry timer', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
  const unmounted = detail.match(/onUnmounted\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  const unload = detail.match(/onUnload\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''

  assert.match(unmounted, /clearPhotoUploadRetryTimer\(\)/)
  assert.match(unload, /clearPhotoUploadRetryTimer\(\)/)
})

test('uploads interrupted by offline state return to pending for automatic resume', () => {
  const detail = fs.readFileSync('pages/report/detail.vue', 'utf8')
  const offlineHandler = detail.match(
    /function\s+markUploadingPhotosOfflineFailed\s*\([\s\S]*?\n}\n/
  )?.[0] || ''

  assert.match(offlineHandler, /photo\.uploadStatus\s*=\s*'pending'/)
  assert.match(offlineHandler, /photo\._retryCount\s*=\s*0/)
  assert.match(offlineHandler, /_photoUploadsPaused\s*=\s*true/)
  assert.match(detail, /shouldContinue:\s*\(\)\s*=>\s*_pageAlive\s*&&\s*!_photoUploadsPaused/)
})
