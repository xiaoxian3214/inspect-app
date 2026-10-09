import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUtsModule } from './load-uts-module.mjs'

const queueModule = await loadUtsModule('core/queue/apiRequestQueue.uts')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('runs API tasks one at a time', async () => {
  const queue = queueModule.createApiRequestQueue()
  const gate = deferred()
  const events = []

  const first = queue.enqueue({
    key: 'first',
    execute: async () => {
      events.push('first:start')
      await gate.promise
      events.push('first:end')
    }
  })
  const second = queue.enqueue({
    key: 'second',
    execute: async () => events.push('second')
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(events, ['first:start'])
  gate.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first:start', 'first:end', 'second'])
})

test('runs higher priority waiting tasks first while preserving equal-priority order', async () => {
  const queue = queueModule.createApiRequestQueue()
  const gate = deferred()
  const events = []

  const active = queue.enqueue({ key: 'active', priority: 0, execute: () => gate.promise })
  const lowA = queue.enqueue({ key: 'low-a', priority: 1, execute: async () => events.push('low-a') })
  const high = queue.enqueue({ key: 'high', priority: 10, execute: async () => events.push('high') })
  const lowB = queue.enqueue({ key: 'low-b', priority: 1, execute: async () => events.push('low-b') })

  gate.resolve()
  await Promise.all([active, lowA, high, lowB])
  assert.deepEqual(events, ['high', 'low-a', 'low-b'])
})

test('deduplicates queued and active tasks by key', async () => {
  const queue = queueModule.createApiRequestQueue()
  let executions = 0
  const task = {
    key: 'download:p-1:t-1',
    execute: async () => {
      executions += 1
      return 'downloaded'
    }
  }

  const first = queue.enqueue(task)
  const second = queue.enqueue(task)

  assert.equal(first, second)
  assert.equal(await first, 'downloaded')
  assert.equal(executions, 1)
})

test('continues with the next task after a failure', async () => {
  const queue = queueModule.createApiRequestQueue()
  const events = []

  const failed = queue.enqueue({
    key: 'failed',
    execute: async () => {
      throw new Error('network failed')
    }
  })
  const next = queue.enqueue({
    key: 'next',
    execute: async () => events.push('next')
  })

  await assert.rejects(failed, /network failed/)
  await next
  assert.deepEqual(events, ['next'])
})
