import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const syncModule = await loadUtsModule('services/offlineSyncService.uts')

test('sync completion cannot overwrite edits saved while the network request was in flight', async () => {
  const memoryModule = await loadUtsModule('database/memoryDatabase.uts')
  const reportModule = await loadUtsModule('repositories/reportRepository.uts')
  const repository = reportModule.createReportRepository(memoryModule.createMemoryDatabase())
  await repository.savePlan({ planId: 'plan-1', plan: { id: 'plan-1' }, status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { draft: 1 }, checklistData: { item: { comment: '旧备注' } } })
  let finishRequest
  let requestStarted
  const started = new Promise((resolve) => { requestStarted = resolve })
  const network = new Promise((resolve) => { finishRequest = resolve })
  const service = syncModule.createOfflineSyncService({
    reportRepository: repository,
    planApi: { generateReport: async () => { requestStarted(); await network; return { reportId: 'report-1' } } }
  })
  const task = service.syncPendingPlans()
  await started
  await repository.savePlan({ planId: 'plan-1', plan: { id: 'plan-1' }, status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { draft: 2 }, checklistData: { item: { comment: '新备注' } } })
  finishRequest()
  await task
  const persisted = await repository.getPlanById('plan-1')
  assert.equal(persisted.checklistData.item.comment, '新备注')
  assert.deepEqual(persisted.pendingSyncPayload, { draft: 2 })
  assert.equal(persisted.syncStatus, 'DIRTY')
})

test('syncs each pending plan once and clears the dirty payload', async () => {
  const saved = []
  const generated = []
  const service = syncModule.createOfflineSyncService({
    reportRepository: {
      listPlans: async () => [{
        planId: 'plan-1',
        status: 1,
        syncStatus: 'DIRTY',
        pendingSyncPayload: { planId: 'plan-1' }
      }],
      savePlan: async (plan) => saved.push(plan)
    },
    planApi: {
      generateReport: async (payload) => {
        generated.push(payload)
        return { reportId: 'report-1' }
      }
    }
  })

  const result = await service.syncPendingPlans()

  assert.equal(result.syncedCount, 1)
  assert.equal(result.failedCount, 0)
  assert.equal(generated.length, 1)
  assert.equal(saved[0].syncStatus, 'SYNCED')
  assert.equal(saved[0].pendingSyncPayload, null)
  assert.equal(saved[0].reportId, 'report-1')
})

test('does not resubmit completed reports or merged child plans', async () => {
  let generatedCount = 0
  const service = syncModule.createOfflineSyncService({
    reportRepository: {
      listPlans: async () => [
        { planId: 'done', status: 3, syncStatus: 'DIRTY', pendingSyncPayload: { status: 3 } },
        {
          planId: 'child',
          status: 1,
          syncStatus: 'DIRTY',
          pendingSyncPayload: { planId: 'child' },
          plan: { id: 'child', mergeType: 2, parentPlanId: 'parent' }
        }
      ],
      savePlan: async () => {}
    },
    planApi: {
      generateReport: async () => {
        generatedCount += 1
      }
    }
  })

  const result = await service.syncPendingPlans()

  assert.equal(result.pendingCount, 0)
  assert.equal(generatedCount, 0)
})

test('never auto-submits a final report payload after network recovery', async () => {
  let generatedCount = 0
  const service = syncModule.createOfflineSyncService({
    reportRepository: {
      listPlans: async () => [{
        planId: 'final-plan',
        status: 1,
        syncStatus: 'DIRTY',
        pendingSyncPayload: { planId: 'final-plan', finishFlag: 1 }
      }],
      savePlan: async () => {}
    },
    planApi: {
      generateReport: async () => {
        generatedCount += 1
      }
    }
  })

  const result = await service.syncPendingPlans()

  assert.equal(result.pendingCount, 0)
  assert.equal(generatedCount, 0)
})

test('keeps failed plans dirty and continues syncing the remaining queue', async () => {
  const saved = []
  const service = syncModule.createOfflineSyncService({
    reportRepository: {
      listPlans: async () => [
        { planId: 'bad', status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'bad' } },
        { planId: 'good', status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'good' } }
      ],
      savePlan: async (plan) => saved.push(plan)
    },
    planApi: {
      generateReport: async (payload) => {
        if (payload.planId === 'bad') throw new Error('network error')
        return { id: 'report-good' }
      }
    }
  })

  const result = await service.syncPendingPlans()

  assert.equal(result.syncedCount, 1)
  assert.equal(result.failedCount, 1)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].planId, 'good')
})

test('deduplicates concurrent automatic and manual draft synchronization', async () => {
  let generatedCount = 0
  let releaseRequest
  const requestGate = new Promise((resolve) => { releaseRequest = resolve })
  const service = syncModule.createOfflineSyncService({
    reportRepository: {
      listPlans: async () => [{ planId: 'plan-1', status: 1, syncStatus: 'DIRTY', pendingSyncPayload: { planId: 'plan-1' } }],
      savePlan: async () => {}
    },
    planApi: {
      generateReport: async () => {
        generatedCount += 1
        await requestGate
        return { id: 'report-1' }
      }
    }
  })

  const automatic = service.syncPendingPlans()
  const manual = service.syncPendingPlans()
  releaseRequest()
  await Promise.all([automatic, manual])

  assert.equal(generatedCount, 1)
})
