import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const mediaModule = await loadUtsModule('domain/mediaDisplay.uts')
const apiBaseUrl = 'https://inspecttest.letright.com.cn/qcm'

test('prefers persistent local media paths for offline display', () => {
  assert.equal(mediaModule.getMediaDisplayUrl({ localPath: '_doc/photo.jpg', fileId: 'file-1' }, 'thumbnail', apiBaseUrl), '_doc/photo.jpg')
})

test('builds H5-compatible thumbnail and preview urls from a server file id', () => {
  assert.equal(mediaModule.getMediaDisplayUrl({ fileId: 'file 1' }, 'thumbnail', apiBaseUrl), 'https://inspecttest.letright.com.cn/qcm/api/inspect/file/file%201/thumbnail')
  assert.equal(mediaModule.getMediaDisplayUrl({ fileId: 'file 1' }, 'preview', apiBaseUrl), 'https://inspecttest.letright.com.cn/qcm/api/inspect/file/file%201/preview')
})

/** 没有本地文件时优先根据 fileId 获取图片，而不是使用过期的预览地址。 */
test('prefers file id over stale remote preview paths', () => {
  assert.equal(mediaModule.getMediaDisplayUrl({ fileId: 'file-1', previewUrl: '/expired.jpg' }, 'thumbnail', apiBaseUrl), `${apiBaseUrl}/api/inspect/file/file-1/thumbnail`)
})

test('normalizes relative server media paths against the API base url', () => {
  assert.equal(mediaModule.getMediaDisplayUrl({ thumbnailPath: '/api/files/thumb.jpg' }, 'thumbnail', apiBaseUrl), 'https://inspecttest.letright.com.cn/qcm/api/files/thumb.jpg')
})
