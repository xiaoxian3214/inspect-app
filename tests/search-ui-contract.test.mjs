import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('search page wires reusable sheets and complete H5 operations', async () => {
  const source = await readFile('pages/report/search.uvue', 'utf8')

  for (const component of ['SearchFilterSheet', 'MergePlanSheet', 'SplitPlanSheet', 'CopyPlanSheet']) {
    assert.match(source, new RegExp(`import ${component}`))
    assert.match(source, new RegExp(`<${component}`))
  }
  assert.match(source, /buildSearchParams/)
  assert.match(source, /planOperationService/)
  assert.match(source, /startDate/)
  assert.match(source, /endDate/)
  assert.match(source, /@action-unlock=/)
  assert.match(source, /@action-copy=/)
  assert.match(source, /@action-copy-merged=/)
  assert.match(source, /@action-split=/)
  assert.doesNotMatch(source, /refresher-enabled/)
})

test('inspection card exposes semantic remote-operation and merge-selection events', async () => {
  const source = await readFile('components/inspection/InspectionPlanCard.uvue', 'utf8')

  for (const eventName of ['action-unlock', 'action-copy', 'action-copy-merged', 'action-split', 'merge-toggle']) {
    assert.match(source, new RegExp(`['\"]${eventName}['\"]`))
  }
  assert.match(source, /selectionMode/)
  assert.match(source, /selectionDisabled/)
})

test('search operation sheets exist as separate reusable components', async () => {
  const paths = [
    'components/search/SearchFilterSheet.uvue',
    'components/search/MergePlanSheet.uvue',
    'components/search/SplitPlanSheet.uvue',
    'components/search/CopyPlanSheet.uvue'
  ]
  for (const path of paths) {
    const source = await readFile(path, 'utf8')
    assert.match(source, /defineProps/)
    assert.match(source, /defineEmits/)
  }
})
