import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const apiModule = await loadUtsModule('api/defectApi.uts')

test('loads defect tree and normalizes severity options', async () => {
  const requests = []
  const api = apiModule.createDefectApi({
    request: async (request) => {
      requests.push(request)
      if (request.url.includes('tree')) return [{ id: 'tier-1', name: '外观' }]
      return [
        { dictValue: 'MAJOR', dictLabel: '严重', sortOrder: 2 },
        { value: 'MINOR', label: '轻微', sortOrder: 1 }
      ]
    }
  })

  assert.deepEqual(await api.getDefectTree(), [{ id: 'tier-1', name: '外观' }])
  assert.deepEqual(await api.getDefectLevels(), [
    { value: 'MINOR', label: '轻微', sortOrder: 1 },
    { value: 'MAJOR', label: '严重', sortOrder: 2 }
  ])
  assert.equal(requests[0].url, '/api/defect-tier-config/tree')
  assert.equal(requests[1].url, '/api/dict/data/code/defect_level')
})
