import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const viewModel = await loadUtsModule('domain/listActionViewModel.uts')

test('matches H5 floating actions by active tab', () => {
  assert.deepEqual(viewModel.buildFabActions('planned').map((item) => item.key), [
    'merge',
    'scan',
    'search',
    'quick'
  ])
  assert.deepEqual(viewModel.buildFabActions('progress'), [])
  assert.deepEqual(viewModel.buildFabActions('report').map((item) => item.key), [
    'scan',
    'search'
  ])
})

test('resolves download state using the same lock ownership rules as H5', () => {
  assert.equal(viewModel.resolveDownloadState({ lockFlag: 0 }), 'available')
  assert.equal(viewModel.resolveDownloadState({ lockFlag: 1, inspectorId: 'u-1', currentUserId: 'u-2' }), 'locked')
  assert.equal(viewModel.resolveDownloadState({ lockFlag: 1, inspectorId: 'u-1', currentUserId: 'u-1' }), 'downloaded')
  assert.equal(viewModel.resolveDownloadState({ isLocalDownloaded: true, lockFlag: 1 }), 'downloaded')
})

test('builds H5-compatible card actions for available plans', () => {
  assert.deepEqual(viewModel.buildCardActions({
    downloadState: 'available',
    statusKey: 'planned',
    manageActionsInCard: true
  }).map((item) => item.key), [
    'download',
    'copy',
    'ready-quantity'
  ])
})

test('builds H5-compatible card actions for downloaded merged plans', () => {
  assert.deepEqual(viewModel.buildCardActions({
    downloadState: 'downloaded',
    statusKey: 'progress',
    manageActionsInCard: true,
    isMerged: true,
    showSplit: true
  }).map((item) => item.key), [
    'unlock',
    'reset',
    'copy',
    'copy-merged',
    'ready-quantity',
    'split'
  ])
})

test('shows inspector and report actions for plans locked by another user', () => {
  assert.deepEqual(viewModel.buildCardActions({
    downloadState: 'locked',
    statusKey: 'planned',
    manageActionsInCard: true
  }).map((item) => item.key), [
    'view-inspector',
    'copy',
    'ready-quantity',
    'report'
  ])
})

test('starts sync only once when online pending work exists', () => {
  assert.equal(viewModel.canStartSync({ isSyncing: false, isOnline: true, pendingCount: 1 }), true)
  assert.equal(viewModel.canStartSync({ isSyncing: true, isOnline: true, pendingCount: 1 }), false)
  assert.equal(viewModel.canStartSync({ isSyncing: false, isOnline: false, pendingCount: 1 }), false)
  assert.equal(viewModel.canStartSync({ isSyncing: false, isOnline: true, pendingCount: 0 }), false)
})

/** 未缓存的线上卡片先恢复详情，已缓存或被他人锁定的卡片保持原操作。 */
test('routes uncached online cards to detail caching before opening', () => {
  assert.equal(viewModel.resolveCardClickAction({ selectionMode: true }), 'toggle-merge')
  assert.equal(viewModel.resolveCardClickAction({ status: 3, isLocalDownloaded: true }), 'open-actions')
  assert.equal(viewModel.resolveCardClickAction({ status: 0, downloadState: 'available' }), 'recover-detail')
  assert.equal(viewModel.resolveCardClickAction({ status: 1, downloadState: 'downloaded', isLocalDownloaded: false }), 'recover-detail')
  assert.equal(viewModel.resolveCardClickAction({ status: 3, downloadState: 'available', isLocalDownloaded: false }), 'recover-detail')
  assert.equal(viewModel.resolveCardClickAction({ status: 1, downloadState: 'downloaded', isLocalDownloaded: true }), 'open-detail')
  assert.equal(viewModel.resolveCardClickAction({ status: 0, downloadState: 'locked' }), 'open-actions')
})
