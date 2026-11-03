import { useSyncExternalStore } from 'react'

import type { FrontendAppConfig } from '@/shared/types'

import { requestJson } from './http'

// Startup config (GET /api/config): frozen for the server process lifetime,
// so it is fetched once before the app mounts (see init() in index.tsx) and
// read synchronously everywhere after that — no query, no loading states.
// Only a server restart can change it, and a restart is picked up on the next
// page load.

const DEFAULTS: FrontendAppConfig = {
  environment: 'local',
  demo: false,
  demoInstallUrl: 'https://quint.run'
}

let current: FrontendAppConfig = DEFAULTS
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Failures keep the last known value (defaults on the very first fetch):
// non-demo is the safe presentation, and the server still enforces its gates.
async function fetchAppConfig(): Promise<FrontendAppConfig | undefined> {
  try {
    current = await requestJson<FrontendAppConfig>('/api/config')
    for (const listener of listeners) listener()
    return current
  } catch {}
}

// Called once from init() before the app mounts; never rejects, so a config
// hiccup cannot block the app from starting.
export async function loadAppConfig(): Promise<FrontendAppConfig | undefined> {
  return fetchAppConfig()
}

export function useAppConfig(): FrontendAppConfig {
  return useSyncExternalStore(subscribe, () => current)
}
