import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

import {
  resetWorkspaceEnvForTest,
  resolveWorkspaceEnv,
  setSecretStoreBackend,
  updateWorkspaceEnv
} from './env'

test('workspace secrets use the Quint keychain namespace', async () => {
  const original = Bun.secrets
  const stored = new Map<string, string>()
  const services = new Set<string>()
  Object.assign(Bun, {
    secrets: {
      get: async ({ service, name }: { service: string; name: string }) => {
        services.add(service)
        return stored.get(name) ?? null
      },
      set: async ({ service, name, value }: { service: string; name: string; value: string }) => {
        services.add(service)
        stored.set(name, value)
      },
      delete: async ({ service, name }: { service: string; name: string }) => {
        services.add(service)
        return stored.delete(name)
      }
    }
  })
  setSecretStoreBackend('keychain')
  const path = resolve('/tmp/quint-keychain-test')
  try {
    await updateWorkspaceEnv(path, { set: { TOKEN: 'value' } })
    expect(await resolveWorkspaceEnv(path)).toEqual({ TOKEN: 'value' })
    await updateWorkspaceEnv(path, { remove: ['TOKEN'] })
    expect(await resolveWorkspaceEnv(path)).toEqual({})
    expect([...services]).toEqual(['run.quint.workspace'])
  } finally {
    Object.assign(Bun, { secrets: original })
    resetWorkspaceEnvForTest()
  }
})
