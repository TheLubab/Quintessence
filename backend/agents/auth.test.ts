import { expect, test } from 'bun:test'
import { createHarnessStore } from './auth'

test('concurrent Meta readiness requests share a probe and workspace caches remain separate', async () => {
  let calls = 0
  const store = createHarnessStore({
    probe: async () => {
      calls++
      return { status: 'available' }
    },
    startLogin: async () => ({ id: 'login', url: 'https://dev.meta.ai' }),
    publish: () => {}
  })
  try {
    const workspace = { id: 'one', path: '/workspace', type: 'meta' as const }
    await Promise.all([store.getAvailability(workspace), store.getAvailability(workspace)])
    expect(calls).toBe(1)
    await store.getAvailability({ ...workspace, id: 'two' })
    expect(calls).toBe(2)
  } finally {
    store.shutdown()
  }
})

test('concurrent login starts share one ceremony', async () => {
  let starts = 0
  const store = createHarnessStore({
    probe: async () => ({ status: 'login-required', reason: 'Sign in' }),
    startLogin: async () => {
      starts++
      return { id: 'login', url: 'https://dev.meta.ai' }
    },
    publish: () => {},
    loginPollMs: 60_000
  })
  try {
    const results = await Promise.all([store.startLogin('meta'), store.startLogin('meta')])
    expect(starts).toBe(1)
    expect(results[0]).toEqual(results[1])
  } finally {
    store.shutdown()
  }
})
