import assert from 'node:assert/strict'
import {
  getMediaPhotos,
  getCheckPointPhotos,
  getOriginalPhotoIndex,
  mergeSortedMediaPhotos,
  toChecklistPhotos
} from '../pages/report/utils/checkPointMedia.js'

const first = { fileId: 'a', bizType: 'checkResult' }
const checkpoint = { fileId: 'b', bizType: 'checkPoint' }
const second = { fileId: 'c' }
const anotherCheckpoint = { fileId: 'd', bizType: 'checkPoint' }
const photos = [first, checkpoint, second, anotherCheckpoint]

assert.deepEqual(getMediaPhotos(photos), [first, second])
assert.deepEqual(getCheckPointPhotos(photos), [checkpoint, anotherCheckpoint])
assert.equal(getOriginalPhotoIndex(photos, getMediaPhotos(photos), 1), 2)
assert.equal(getOriginalPhotoIndex(photos, getCheckPointPhotos(photos), 1), 3)
assert.equal(getOriginalPhotoIndex(photos, getCheckPointPhotos(photos), 9), -1)
assert.equal(getOriginalPhotoIndex([undefined, first], [], 0), -1)
assert.deepEqual(mergeSortedMediaPhotos(photos, [second, first]), [second, checkpoint, first, anotherCheckpoint])
assert.deepEqual(mergeSortedMediaPhotos([checkpoint], []), [checkpoint])
assert.deepEqual(getMediaPhotos(null), [])

const downloadedPhotos = toChecklistPhotos([
  { fileId: 'checkpoint-file', filePath: '/checkpoint.jpg', bizType: 'checkPoint' },
  { fileId: 'media-file', filePath: '/media.jpg', bizType: 'checkResult' },
  { fileId: 'legacy-file', filePath: '/legacy.jpg' }
])
assert.deepEqual(getCheckPointPhotos(downloadedPhotos).map(photo => photo.fileId), ['checkpoint-file'])
assert.deepEqual(getMediaPhotos(downloadedPhotos).map(photo => photo.fileId), ['media-file', 'legacy-file'])
