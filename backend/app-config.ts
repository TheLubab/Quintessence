import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { FrontendAppConfig } from '@/shared/types'
import { DATA_DIR } from './data-dir'

type AppConfig = FrontendAppConfig & { workspacesDir: string | null }
export const APP_CONFIG_FILE = join(DATA_DIR, 'config.json')
export function loadAppConfig(
  file = APP_CONFIG_FILE,
  env: Record<string, string | undefined> = process.env
): AppConfig {
  let raw: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`[quint] could not read ${file}: ${String(error)}`)
  }
  const demoEnv = env.QUINT_DEMO?.toLowerCase()
  const demo =
    demoEnv === '1' || demoEnv === 'true'
      ? true
      : demoEnv === '0' || demoEnv === 'false'
        ? false
        : raw.demo === true
  return {
    environment: 'local',
    demo,
    demoInstallUrl:
      env.QUINT_DEMO_INSTALL_URL ||
      (typeof raw.demoInstallUrl === 'string' ? raw.demoInstallUrl : 'https://quint.run'),
    workspacesDir:
      typeof raw.workspacesDir === 'string' && isAbsolute(raw.workspacesDir)
        ? raw.workspacesDir
        : null
  }
}
let config: AppConfig | undefined
export function initializeAppConfig(): void {
  config = loadAppConfig()
}
export function getAppConfig(): AppConfig {
  return (config ??= loadAppConfig())
}
export function createdWorkspacesRoot(): string {
  return getAppConfig().workspacesDir ?? join(homedir(), 'quint')
}
export function resetAppConfig(): void {
  config = undefined
}
export function frontendAppConfig(): FrontendAppConfig {
  const { environment, demo, demoInstallUrl } = getAppConfig()
  return { environment, demo, demoInstallUrl }
}
