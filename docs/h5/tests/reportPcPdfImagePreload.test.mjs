import assert from 'node:assert/strict'
import fs from 'node:fs'

const helperPath = './pages/report/utils/reportPdfImagePreload.js'

assert.equal(
  fs.existsSync(helperPath),
  true,
  'detail-pc should provide PDF image preload behavior'
)

const {
  collectReportImageUrls,
  getReportImageLoadingMode,
  isPdfImagePreloadEnabled,
  preloadImageUrls
} = await import(`../pages/report/utils/reportPdfImagePreload.js?test=${Date.now()}`)

assert.equal(typeof getReportImageLoadingMode, 'function')
assert.equal(getReportImageLoadingMode({}), 'lazy')
assert.equal(getReportImageLoadingMode({ pdf: '0' }), 'lazy')
assert.equal(getReportImageLoadingMode({ pdf: '1' }), 'eager')
assert.equal(isPdfImagePreloadEnabled({ pdf: '1' }), true)
assert.equal(isPdfImagePreloadEnabled({ pdf: '0' }), false)
assert.equal(isPdfImagePreloadEnabled({ pdf: 1 }), false)
assert.equal(isPdfImagePreloadEnabled({}), false)

const imageUrls = collectReportImageUrls(
  {
    defects: [{ photos: ['defect.jpg', 'clip.mp4'] }],
    checklistData: {
      first: { photos: [{ fileId: 'check-1' }, { fileId: 'checkpoint', bizType: 'checkPoint' }] },
      second: { photos: ['check-2.jpg'] }
    }
  },
  {
    getUrl: (photo) => typeof photo === 'string' ? photo : `/preview/${photo.fileId}`,
    isVideo: (photo) => String(photo).endsWith('.mp4')
  }
)

assert.deepEqual(imageUrls, ['defect.jpg', '/preview/check-1', 'check-2.jpg'])

const requestedUrls = []
const results = await preloadImageUrls(
  ['first.jpg', 'second.jpg', 'first.jpg', ''],
  {
    createImage: () => ({
      set src(value) {
        requestedUrls.push(value)
        queueMicrotask(() => this.onload())
      }
    }),
    timeoutMs: 100
  }
)

assert.deepEqual(requestedUrls, ['first.jpg', 'second.jpg'])
assert.deepEqual(results, [
  { url: 'first.jpg', status: 'loaded' },
  { url: 'second.jpg', status: 'loaded' }
])

const detailPc = fs.readFileSync('pages/report/detail-pc.vue', 'utf8')
assert.match(detailPc, /:loading="imageLoadingMode"/, 'detail-pc images should switch loading mode')
assert.match(detailPc, /await\s+preloadImageUrls\(/, 'detail-pc should await all PDF image requests')
