import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const serviceModule = await loadUtsModule('services/defectCatalogService.uts')

test('returns cached defect catalog offline and refreshes it online', async () => {
  let cache = { tree: [{ id: 'cached' }], levels: [{ value: 'MINOR' }] }
  let online = false
  const service = serviceModule.createDefectCatalogService({
    defectApi: {
      getDefectTree: async () => [{ id: 'remote' }],
      getDefectLevels: async () => [{ value: 'MAJOR' }]
    },
    isOnline: async () => online,
    readCache: () => cache,
    writeCache: (next) => { cache = next }
  })

  assert.deepEqual(await service.loadCatalog(), { tree: [{ id: 'cached' }], levels: [{ value: 'MINOR' }] })
  online = true
  assert.deepEqual(await service.loadCatalog(), { tree: [{ id: 'remote' }], levels: [{ value: 'MAJOR' }] })
  assert.equal(cache.tree[0].id, 'remote')
})

test('keeps a freshly loaded category tree when the severity dictionary request fails', async () => {
  let cache = { tree: [{ id: 'cached-tree' }], levels: [{ value: 'MINOR' }] }
  const service = serviceModule.createDefectCatalogService({
    defectApi: {
      getDefectTree: async () => [{ id: 'fresh-tree' }],
      getDefectLevels: async () => { throw new Error('dictionary unavailable') }
    },
    isOnline: async () => true,
    readCache: () => cache,
    writeCache: (next) => { cache = next }
  })

  assert.deepEqual(await service.loadCatalog(), {
    tree: [{ id: 'fresh-tree' }],
    levels: [{ value: 'MINOR' }]
  })
  assert.deepEqual(cache.tree, [{ id: 'fresh-tree' }])
})
