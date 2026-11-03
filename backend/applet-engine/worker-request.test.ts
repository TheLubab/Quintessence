import { expect, test } from 'bun:test'
import { createWorkerRequest, WorkerError } from './worker-request'
import { isBuildResponse, isFunctionRequest, isFunctionResponse } from './worker-protocol'

test('a result settles once and removes the abort listener', async () => {
  const controller = new AbortController()
  let cancelled = 0
  let cleaned = 0
  const request = createWorkerRequest<string>({
    label: 'Call',
    timeoutMs: 1000,
    signal: controller.signal,
    onCancel: () => cancelled++,
    onSettled: () => cleaned++
  })
  request.resolve('result')
  controller.abort()
  request.reject(new WorkerError('exited', 'Late exit'))
  expect(await request.promise).toBe('result')
  expect(cancelled).toBe(0)
  expect(cleaned).toBe(1)
})

test('a deadline cancels execution and rejects once', async () => {
  let cancelled = 0
  const request = createWorkerRequest<void>({
    label: 'Call',
    timeoutMs: 1,
    onCancel: () => cancelled++
  })
  await expect(request.promise).rejects.toMatchObject({ code: 'timeout' })
  request.resolve(undefined)
  expect(cancelled).toBe(1)
})

test('a startup exit rejects readiness without waiting for its deadline', async () => {
  const request = createWorkerRequest<void>({ label: 'Startup', timeoutMs: 1000 })
  request.reject(new WorkerError('exited', 'Worker exited'))
  await expect(request.promise).rejects.toMatchObject({ code: 'exited' })
  expect(request.resolve(undefined)).toBe(false)
})

test('pre-aborted requests cancel immediately', async () => {
  const request = createWorkerRequest<void>({
    label: 'Call',
    timeoutMs: 1000,
    signal: AbortSignal.abort()
  })
  await expect(request.promise).rejects.toMatchObject({ code: 'cancelled' })
})

test('worker boundaries reject mismatched versions and malformed payloads', () => {
  expect(
    isFunctionRequest({
      version: 2,
      type: 'call',
      id: '1',
      module: 'clock',
      name: 'now',
      args: '[]'
    })
  ).toBe(false)
  expect(
    isFunctionRequest({ version: 1, type: 'call', id: '1', module: 'clock', name: 'now', args: [] })
  ).toBe(false)
  expect(isFunctionResponse({ version: 1, type: 'result', id: '1' })).toBe(false)
  expect(
    isBuildResponse({
      version: 1,
      type: 'result',
      id: '1',
      results: [{ name: 'clock', status: 'built', serverModules: [1] }]
    })
  ).toBe(false)
})
