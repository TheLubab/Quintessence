import { accountReady, loginCompletionError, type MetaAccountState } from './account'
import { defaultMetaEffort, isMetaModelId } from '@/shared/meta-models'
// The Muse Code transport boundary.
//
// One `muse serve` host owns each workspace. Quint speaks MSP over its stdio
// transport through the official SDK, and keeps the raw `Connection` alongside
// the facade because catalog/session-list queries are raw MSP methods.
import { stat } from 'node:fs/promises'

import {
  MuseClient,
  readSessionDurability,
  spawnMspConnection,
  type Connection,
  type Session,
  type SpawnedMspConnection
} from '@muse-code/sdk'

import type { HarnessAvailability, McpServer, Model, SessionSummary } from '@/shared/types'

import { CONTROL_PORT } from '../../constants'
import { resolveWorkspaceEnv } from '../../workspaces/env'
import { debug } from '../../debug'
import { tapWire } from '../debug'
import type { HarnessLoginAttempt } from '../types'
import { splitAttachments } from '@/shared/quint-attachments'
import { stripQuintContextLoose } from '@/shared/quint-context'
import { VERSION } from '../../version'
import { findMuseBinary, readMetaRuntimeConfig, type MetaRuntimeConfig } from './config'
import { metaCliEnv } from './cli-env'
import {
  META_CLIENT_CAPABILITIES,
  commandOptional,
  requestOptional,
  tapNotifications,
  type MetaNotification
} from './protocol'

export class MetaRuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MetaRuntimeUnavailableError'
  }
}

export type MetaRuntime = {
  workspacePath: string
  config: MetaRuntimeConfig
  client: MuseClient
  connection: Connection
  spawned: SpawnedMspConnection
  sessions: Map<string, Session>
  stderr: string[]
  listeners: Set<(notification: MetaNotification) => void>
}

const runtimes = new Map<string, Promise<MetaRuntime>>()

// Registry of runtime-agnostic listeners. Session code registers once; the
// runtime tap fans notifications out to it.
const runtimeListeners = new Set<(workspacePath: string, notification: MetaNotification) => void>()

export function onMetaNotification(
  listener: (workspacePath: string, notification: MetaNotification) => void
): () => void {
  runtimeListeners.add(listener)
  return () => runtimeListeners.delete(listener)
}

function runtimeKey(workspacePath: string): string {
  return workspacePath
}

async function startRuntime(workspacePath: string): Promise<MetaRuntime> {
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const config = readMetaRuntimeConfig({ ...process.env, ...workspaceEnv })
  const binary = findMuseBinary(config)
  if (!binary) {
    throw new MetaRuntimeUnavailableError(
      `Muse Code was not found (${config.museBin}). Install it or set MUSE_BIN.`
    )
  }

  const stderr: string[] = []
  const cliEnv = await metaCliEnv(workspacePath, workspaceEnv.PATH ?? process.env.PATH)
  const [command, ...args] = [binary, ...config.args]
  const handshake = spawnMspConnection({
    command,
    args,
    cwd: workspacePath,
    env: {
      ...process.env,
      ...workspaceEnv,
      ...cliEnv,
      QUINT_AGENT: '1',
      // Workspace dotenv is application configuration, not the host endpoint.
      QUINT_CONTROL_PORT: String(CONTROL_PORT),
      ...(config.apiKey ? { META_API_KEY: config.apiKey } : {})
    },
    onStderr: chunk => {
      stderr.push(chunk)
      if (stderr.length > 20) stderr.shift()
      debug('[meta] stderr', chunk.trimEnd())
    },
    shutdownTimeoutMs: config.shutdownTimeoutMs ?? 2000
  })

  let spawned: SpawnedMspConnection
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  try {
    spawned = await Promise.race([
      handshake.initialize({
        clientInfo: { name: 'quint', version: VERSION },
        capabilities: META_CLIENT_CAPABILITIES
      }),
      new Promise<never>((_, reject) => {
        startupTimer = setTimeout(
          () => reject(new Error('Muse Code did not initialize within 15 seconds')),
          15_000
        )
      })
    ])
  } catch (error) {
    await handshake.close().catch(() => undefined)
    const tail = stderr.join('').trim()
    throw new MetaRuntimeUnavailableError(
      `Could not start Muse Code${tail ? `: ${tail.slice(-1200)}` : `: ${String(error)}`}`
    )
  } finally {
    clearTimeout(startupTimer)
  }

  const listeners = new Set<(notification: MetaNotification) => void>()
  tapNotifications(spawned.connection, notification => {
    tapWire(workspacePath, 'recv', notification)
    for (const listener of runtimeListeners) listener(workspacePath, notification)
    for (const listener of listeners) listener(notification)
  })
  const client = new MuseClient(spawned.connection, {
    durability: readSessionDurability(spawned.initializeResult),
    host: spawned
  })

  const runtime: MetaRuntime = {
    workspacePath,
    config,
    spawned,
    connection: spawned.connection,
    client,
    sessions: new Map(),
    stderr,
    listeners
  }
  void spawned.exited.then(exit => {
    debug('[meta] host exited', workspacePath, exit)
    const current = runtimes.get(runtimeKey(workspacePath))
    void current?.then(entry => {
      if (entry === runtime) runtimes.delete(runtimeKey(workspacePath))
    })
  })

  return runtime
}

export function getCachedMetaRuntime(workspacePath: string): Promise<MetaRuntime> | undefined {
  return runtimes.get(runtimeKey(workspacePath))
}

export function getMetaRuntime(workspacePath: string): Promise<MetaRuntime> {
  const key = runtimeKey(workspacePath)
  let runtime = runtimes.get(key)
  if (!runtime) {
    runtime = startRuntime(workspacePath).catch(error => {
      runtimes.delete(key)
      throw error
    })
    runtimes.set(key, runtime)
  }
  return runtime
}

export async function closeMetaRuntime(workspacePath: string): Promise<void> {
  const pending = runtimes.get(runtimeKey(workspacePath))
  runtimes.delete(runtimeKey(workspacePath))
  if (!pending) return
  try {
    const runtime = await pending
    runtime.sessions.clear()
    await runtime.client.close()
  } catch {
    // Spawn already failed; nothing to close.
  }
}

export async function closeAllMetaRuntimes(): Promise<void> {
  const pending = [...runtimes.values()]
  runtimes.clear()
  await Promise.all(
    pending.map(async runtime => {
      try {
        const entry = await runtime
        entry.sessions.clear()
        await entry.client.close()
      } catch {
        // Ignore failed spawns.
      }
    })
  )
}

function effortFields(entry: {
  variants?: readonly string[] | 'unknown'
  defaultReasoningEffort?: string
}): Pick<Model, 'supportsEffort' | 'supportedEffortLevels' | 'defaultEffort'> {
  const variants = Array.isArray(entry.variants) ? entry.variants : []
  if (variants.length <= 1) return {}
  return {
    supportsEffort: true,
    supportedEffortLevels: variants,
    defaultEffort: defaultMetaEffort(variants, entry.defaultReasoningEffort)
  }
}

export async function listMetaModels(workspacePath: string): Promise<Model[]> {
  const runtime = await getMetaRuntime(workspacePath)
  const result = await runtime.connection.request('model/list', {})
  const models = Array.isArray(result.models) ? result.models : []
  const mapped = models.map(entry => {
    const row = entry as Record<string, unknown>
    const modelId = String(row.modelId ?? '')
    const providerId = typeof row.providerId === 'string' ? row.providerId : undefined
    return {
      value: modelId,
      resolvedModel: modelId,
      displayName: typeof row.displayLabel === 'string' ? row.displayLabel : modelId,
      ...(typeof row.description === 'string' ? { description: row.description } : {}),
      ...(providerId ? { group: providerId, providerId } : {}),
      ...effortFields({
        variants: row.variants as readonly string[] | 'unknown' | undefined,
        defaultReasoningEffort:
          typeof row.defaultReasoningEffort === 'string' ? row.defaultReasoningEffort : undefined
      })
    }
  })
  const eligible = mapped.filter(model => isMetaModelId(model.value))
  const defaultRow = models.find(entry => (entry as Record<string, unknown>).isDefault === true) as
    | Record<string, unknown>
    | undefined
  const defaultId = typeof defaultRow?.modelId === 'string' ? defaultRow.modelId : undefined
  if (!defaultId || !isMetaModelId(defaultId)) return eligible
  return [
    {
      value: 'default',
      resolvedModel: defaultId,
      displayName: `Default (${String(defaultRow?.displayLabel ?? defaultId)})`
    },
    ...eligible
  ]
}

function mapMetaSession(entry: unknown): SessionSummary | null {
  const row = entry as Record<string, unknown>
  if (typeof row.sessionId !== 'string') return null
  const updatedAt = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN
  const rawSummary =
    (typeof row.name === 'string' && row.name) ||
    (typeof row.title === 'string' && row.title) ||
    (typeof row.generatedName === 'string' && row.generatedName) ||
    (typeof row.firstUserPrompt === 'string' && row.firstUserPrompt) ||
    'New chat'
  const summary = splitAttachments(stripQuintContextLoose(rawSummary)).text || 'New chat'
  return {
    sessionId: row.sessionId,
    summary,
    lastModified: Number.isFinite(updatedAt) ? updatedAt : 0,
    ...(typeof row.workspaceRoot === 'string' ? { cwd: row.workspaceRoot } : {}),
    ...(row.kind === 'subagent' ? { flavor: 'subagent' as const } : {})
  }
}

export async function listMetaSessions(workspacePath: string): Promise<SessionSummary[]> {
  const runtime = await getMetaRuntime(workspacePath)
  const result = await runtime.connection.request('session/list', {
    workspaceRoot: workspacePath,
    limit: 200
  })
  const sessions = Array.isArray(result.sessions) ? result.sessions : []
  return sessions.flatMap(entry => {
    const mapped = mapMetaSession(entry)
    return mapped ? [mapped] : []
  })
}

export async function readMetaAccount(
  workspacePath: string
): Promise<MetaAccountState | undefined> {
  const runtime = await getMetaRuntime(workspacePath)
  return requestOptional<MetaAccountState>(runtime.connection, 'account/read')
}

export async function readMetaAvailability(workspacePath: string): Promise<HarnessAvailability> {
  const config = readMetaRuntimeConfig()
  if (!findMuseBinary(config)) return metaUnavailable(config.museBin)
  try {
    const account = await readMetaAccount(workspacePath)
    if (accountReady(account)) return { status: 'available' }
    return {
      status: 'login-required',
      reason: account?.label ? `Sign in to Muse Code as ${account.label}` : 'Sign in to Muse Code'
    }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Could not check Muse Code'
    }
  }
}

function metaUnavailable(museBin: string): HarnessAvailability {
  return {
    status: 'unavailable',
    reason: `Muse Code was not found (${museBin}). Install it from https://dev.meta.ai/products/muse-code or set MUSE_BIN.`
  }
}

function mcpStatus(row: Record<string, unknown>): McpServer['status'] {
  const oauth = row.oauth
  const value =
    typeof oauth === 'string' ? oauth : String((oauth as { state?: unknown })?.state ?? '')
  if (/loggedOut|needs.?auth|unauthor/i.test(value)) return 'needs-auth'
  if (/disabled/i.test(value)) return 'disabled'
  if (/fail|error|revoked/i.test(value)) return 'failed'
  if (/pending|progress|starting/i.test(value)) return 'pending'
  return 'connected'
}

export async function listMetaMcpServers(
  workspacePath: string,
  sessionId?: string
): Promise<McpServer[]> {
  const runtime = await getMetaRuntime(workspacePath)
  const result = await requestOptional<{ servers?: unknown[] }>(
    runtime.connection,
    'mcpServer/list',
    sessionId ? { sessionId } : {}
  )
  const rows = Array.isArray(result?.servers) ? result.servers : []
  return rows.flatMap(entry => {
    const row = entry as Record<string, unknown>
    if (typeof row.name !== 'string') return []
    return [{ name: row.name, status: mcpStatus(row) }]
  })
}

export async function discoverMetaWorkspaceRoots(
  registeredPaths: Set<string>
): Promise<{ path: string; type: 'meta' }[]> {
  const runtime = await getMetaRuntime(process.cwd())
  const result = await runtime.connection.request('session/list', { limit: 200 })
  const rows = Array.isArray(result.sessions) ? result.sessions : []
  const candidates = new Set<string>()
  for (const entry of rows) {
    const row = entry as Record<string, unknown>
    if (typeof row.workspaceRoot !== 'string' || registeredPaths.has(row.workspaceRoot)) continue
    const info = await stat(row.workspaceRoot).catch(() => undefined)
    if (info?.isDirectory()) candidates.add(row.workspaceRoot)
  }
  return [...candidates].map(path => ({ path, type: 'meta' as const }))
}

export async function getMetaDebugInfo(workspacePath: string): Promise<unknown> {
  const runtime = await getCachedMetaRuntime(workspacePath)?.catch(() => undefined)
  if (!runtime) return null
  return {
    bin: runtime.config.museBin,
    args: runtime.config.args,
    server: runtime.spawned.initializeResult.serverInfo,
    platform: runtime.spawned.initializeResult.platformOs,
    museHome: runtime.spawned.initializeResult.museHome,
    capabilities: runtime.spawned.initializeResult.grantedCapabilities,
    sessions: [...runtime.sessions.keys()],
    stderrTail: runtime.spawned.child.stderrTail
  }
}

export async function startMetaLogin(): Promise<HarnessLoginAttempt> {
  const runtime = await getMetaRuntime(process.cwd())
  const result = await commandOptional(runtime.connection, 'account/loginStart', {
    type: 'deviceCode'
  })
  const verificationUrl =
    typeof result?.verificationUrl === 'string' ? result.verificationUrl : undefined
  if (!verificationUrl) throw new Error('Muse Code did not return a sign-in URL')
  const id = crypto.randomUUID()
  let stop = () => {}
  const completed = new Promise<void>((resolve, reject) => {
    const onNotification = (notification: MetaNotification) => {
      if (notification.method === 'account/loginCompleted') {
        const error = loginCompletionError(notification.params as Record<string, unknown>)
        finish(() => (error ? reject(error) : resolve()))
      }
    }
    const timer = setInterval(async () => {
      const account = await readMetaAccount(runtime.workspacePath).catch(() => undefined)
      if (accountReady(account)) finish(resolve)
    }, 2_000)
    const deadline = setTimeout(() => {
      finish(() => reject(new Error('Muse Code sign-in did not complete')))
    }, 10 * 60_000)
    const finish = (settle: () => void) => {
      clearInterval(timer)
      clearTimeout(deadline)
      runtime.listeners.delete(onNotification)
      stop = () => {}
      settle()
    }
    stop = () => finish(() => reject(new Error('Muse Code sign-in cancelled')))
    runtime.listeners.add(onNotification)
  })
  return {
    id,
    url: verificationUrl,
    ...(typeof result?.userCode === 'string' ? { userCode: result.userCode } : {}),
    completed,
    cancel: () => {
      stop()
      void commandOptional(runtime.connection, 'account/loginCancel', {}).catch(() => undefined)
    }
  }
}
