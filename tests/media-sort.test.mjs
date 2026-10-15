import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const mediaSort = await loadUtsModule('domain/mediaSort.uts')

test('moves a photo forward and rewrites continuous sort numbers', () => {
  const photos = [
    { photoId: 'photo-1', sortNo: 1 },
    { photoId: 'photo-2', sortNo: 2 },
    { photoId: 'photo-3', sortNo: 3 }
  ]

  const sorted = mediaSort.moveMediaItem(photos, 2, 0)

  assert.deepEqual(sorted.map((photo) => photo.photoId), ['photo-3', 'photo-1', 'photo-2'])
  assert.deepEqual(sorted.map((photo) => photo.sortNo), [1, 2, 3])
  assert.deepEqual(photos.map((photo) => photo.photoId), ['photo-1', 'photo-2', 'photo-3'])
})

test('moves a photo backward without dropping upload metadata', () => {
  const photos = [
    { photoId: 'photo-1', fileId: 'file-1', uploadStatus: 'uploaded' },
    { photoId: 'photo-2', localPath: '_doc/photo-2.jpg', uploadStatus: 'pending' },
    { photoId: 'photo-3', fileId: 'file-3', uploadStatus: 'uploaded' }
  ]

  const sorted = mediaSort.moveMediaItem(photos, 0, 2)

  assert.deepEqual(sorted.map((photo) => photo.photoId), ['photo-2', 'photo-3', 'photo-1'])
  assert.equal(sorted[0].localPath, '_doc/photo-2.jpg')
  assert.equal(sorted[2].fileId, 'file-1')
})

test('invalid indexes keep the original order while normalizing sort numbers', () => {
  const photos = [
    { photoId: 'photo-1', sortNo: 9 },
    { photoId: 'photo-2', sortNo: 4 }
  ]

  const sorted = mediaSort.moveMediaItem(photos, -1, 1)

  assert.deepEqual(sorted.map((photo) => photo.photoId), ['photo-1', 'photo-2'])
  assert.deepEqual(sorted.map((photo) => photo.sortNo), [1, 2])
})

/** 原生拖拽以三列格子和手指位移算目标，不依赖浏览器 DOM 坐标。 */
test('resolves a dragged photo destination across rows and partial final rows', () => {
  assert.equal(mediaSort.resolveMediaDragTarget(0, 100, 0, 100, 5), 1)
  assert.equal(mediaSort.resolveMediaDragTarget(0, 0, 100, 100, 5), 3)
  assert.equal(mediaSort.resolveMediaDragTarget(4, -100, -100, 100, 5), 0)
  assert.equal(mediaSort.resolveMediaDragTarget(3, 300, 0, 100, 5), 4)
  assert.equal(mediaSort.resolveMediaDragTarget(2, 0, 0, 0, 5), 2)
})
