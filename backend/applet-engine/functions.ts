// Per-workspace pool of functions worker subprocesses.
//
// Each entry in the LRU cache owns one child process running
// `functions-worker.ts`, scoped to a single workspace. Workers are spawned
// lazily on first call, kept warm for `WORKER_IDLE_TTL_MS`, then reaped by
// the LRU TTL. Up to `MAX_WORKERS` slots coexist; an LRU eviction kills the
// oldest. Switching workspaces no longer kills anything — multiple tabs
// against multiple workspaces stay isolated.
//
// CWD contract: workers run with `cwd = workspacePath` (the workspace root,
// where the agent works), NOT `.quint/`. But we SPAWN from a neutral cwd and have
// the worker `chdir` there at startup (via MEI_WORKSPACE_ROOT) — otherwise Bun
// would auto-load the workspace's `.env` into the worker, bypassing quint's
// inheritDotenv toggle and per-sink scoping. The `.quint/` root is passed as
// `MEI_FUNCTIONS_DIR` so the worker can locate `.server.ts` files — module keys
// are paths relative to it (`"widgets/hello"` → `.quint/widgets/hello.server.ts`).
// This is the contract documented in the widgets SKILL.
import { LRUCache } from 'lru-cache'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { resolveWorkspaceEnv } from '../workspaces/env'
import { isFunctionResponse, WORKER_PROTOCOL_VERSION } from './worker-protocol'
import { createWorkerRequest, WorkerError, type WorkerCallOptions } from './worker-request'

const WORKER_PATH = join(import.meta.dir, 'functions-worker.ts')
const CALL_TIMEOUT_MS = 30_000
const WORKER_IDLE_TTL_MS = 10 * 60_000
const MAX_WORKERS = 8

type Pending = ReturnType<typeof createWorkerRequest<string>>

type Slot = {
  workspacePath: string
  worker: ReturnType<typeof Bun.spawn>
  readyPromise: Promise<void>
  startup: ReturnType<typeof createWorkerRequest<void>>
  pending: Map<string, Pending>
  killed: boolean
  // Introspection only (surfaced by /status) — not load-bearing.
  ready: boolean
  spawnedAt: number
  lastCallAt: number | null
  calls: number
  errors: number
  timeouts: number
  // Module keys the worker has loaded and cached (reported via 'loaded' IPC,
  // pruned when reloadModules evicts them).
  modules: Set<string>
}

const liveSlots = new Set<Slot>()
let workerGeneration = 0
let draining: Promise<void> | undefined

function rejectAndClearPending(slot: Slot, reason: WorkerError) {
  slot.startup.reject(reason)
  for (const pending of slot.pending.values()) pending.reject(reason)
  slot.pending.clear()
}

function killSlot(slot: Slot, reason: string | WorkerError) {
  if (slot.killed) return
  slot.killed = true
  rejectAndClearPending(
    slot,
    typeof reason === 'string' ? new WorkerError('exited', reason) : reason
  )
  try {
    slot.worker.kill('SIGKILL')
  } catch {}
}

// How long a worker gets to run its modules' `dispose()` and exit on its own
// before we kill it outright.
const SHUTDOWN_GRACE_MS = 2_000

// Same end state as killSlot — a dead worker — but the worker is asked to exit
// so it can run each cached module's `dispose()` first. Used when server code
// changed: a hard kill would strand whatever those modules hold open (db
// handles, timers, watchers).
//
// The slot is marked killed immediately, so a call arriving mid-shutdown spawns
// a fresh worker rather than queueing behind a dying one. In-flight calls are
// rejected rather than left to hit the 30s timeout.
async function gracefulKillSlot(slot: Slot, reason: string): Promise<void> {
  if (slot.killed) {
    await slot.worker.exited
    liveSlots.delete(slot)
    return
  }
  slot.killed = true
  rejectAndClearPending(slot, new WorkerError('shutdown', reason))

  const timer = setTimeout(() => {
    try {
      slot.worker.kill('SIGKILL')
    } catch {}
  }, SHUTDOWN_GRACE_MS)
  timer.unref?.()
  void slot.worker.exited.then(() => clearTimeout(timer)).catch(() => clearTimeout(timer))

  try {
    slot.worker.send({ version: WORKER_PROTOCOL_VERSION, type: 'shutdown' })
  } catch {
    clearTimeout(timer)
    try {
      slot.worker.kill('SIGKILL')
    } catch {}
  }
  await slot.worker.exited
  liveSlots.delete(slot)
}

const slots = new LRUCache<string, Slot>({
  max: MAX_WORKERS,
  ttl: WORKER_IDLE_TTL_MS,
  ttlAutopurge: true,
  updateAgeOnGet: true,
  dispose: slot => killSlot(slot, 'Functions worker idle-evicted')
})

function spawnSlot(workspacePath: string, workspaceEnv: Record<string, string>): Slot {
  const meiDir = join(workspacePath, '.quint')

  let slot: Slot
  const startup = createWorkerRequest<void>({
    label: 'Functions worker startup',
    timeoutMs: 10_000,
    onCancel: error => killSlot(slot, error)
  })
  // Startup may fail before any caller attaches to readiness.
  void startup.promise.catch(() => {})
  let worker: ReturnType<typeof Bun.spawn>
  try {
    worker = Bun.spawn([process.execPath, WORKER_PATH], {
      serialization: 'json',
      // Neutral cwd so Bun doesn't auto-load the workspace's `.env`; the worker
      // chdir()s to MEI_WORKSPACE_ROOT at startup to restore cwd = workspace root.
      cwd: tmpdir(),
      // Resolved workspace env (.env + scope-filtered custom secrets) layered over
      // the server's env — the AUTHORITATIVE source now that auto-load is off, so
      // inheritDotenv and per-sink scoping actually hold. MEI_FUNCTIONS_DIR is
      // applied last so a workspace .env can never clobber it; tests set it
      // explicitly to point the worker at fixtures.
      env: {
        ...process.env,
        ...workspaceEnv,
        MEI_WORKSPACE_ROOT: workspacePath,
        MEI_FUNCTIONS_DIR: process.env.MEI_FUNCTIONS_DIR ?? meiDir
      },
      stderr: 'inherit',
      onExit(_proc, code) {
        if (code !== 0 && code !== null) {
          console.error(`[mei] functions worker for ${workspacePath} exited with code ${code}`)
        }
        // Mark slot dead and reject pending. Then drop from cache without
        // re-disposing (the worker is already gone).
        slot.killed = true
        liveSlots.delete(slot)
        rejectAndClearPending(
          slot,
          new WorkerError('exited', `Functions worker exited (code ${code})`)
        )
        if (slots.peek(workspacePath) === slot) slots.delete(workspacePath)
      },
      ipc(message) {
        if (slot.killed) return
        if (!isFunctionResponse(message)) {
          killSlot(slot, new WorkerError('protocol', 'Invalid functions worker response'))
          return
        }
        const msg = message
        if (msg.type === 'ready') {
          slot.ready = true
          startup.resolve(undefined)
        } else if (msg.type === 'loaded') {
          slot.modules.add(msg.module)
        } else {
          const pending = slot.pending.get(msg.id)
          if (!pending) return
          if (msg.type === 'result') pending.resolve(msg.data)
          else {
            slot.errors++
            pending.reject(new WorkerError(msg.code, msg.message))
          }
        }
      }
    })
  } catch (error) {
    const failure = new WorkerError(
      'transport',
      error instanceof Error ? error.message : 'Could not start functions worker'
    )
    startup.reject(failure)
    throw failure
  }
  slot = {
    workspacePath,
    worker,
    startup,
    readyPromise: startup.promise,
    pending: new Map(),
    killed: false,
    ready: false,
    spawnedAt: Date.now(),
    lastCallAt: null,
    calls: 0,
    errors: 0,
    timeouts: 0,
    modules: new Set()
  }
  liveSlots.add(slot)

  return slot
}

function getOrSpawn(workspacePath: string, workspaceEnv: Record<string, string>): Slot {
  const existing = slots.get(workspacePath)
  if (existing && !existing.killed) return existing

  const fresh = spawnSlot(workspacePath, workspaceEnv)
  slots.set(workspacePath, fresh)
  return fresh
}

// Parse the `<module>/<fn>` tail of an RPC URL. The module key may itself
// contain slashes (`widgets/hello/getWeather` → module `widgets/hello`, fn
// `getWeather`), so split on the LAST slash. Returns null on anything that
// isn't a clean path: empty or `..`-ish segments, leading/trailing slashes,
// characters outside [A-Za-z0-9_$-].
export function parseFunctionPath(tail: string): { module: string; name: string } | null {
  const i = tail.lastIndexOf('/')
  if (i === -1) return null
  const module = tail.slice(0, i)
  const name = tail.slice(i + 1)
  if (!/^[A-Za-z0-9_$-]+(?:\/[A-Za-z0-9_$-]+)*$/.test(module)) return null
  if (!/^[A-Za-z0-9_$]+$/.test(name)) return null
  return { module, name }
}

// Issue one call against a live slot: register a pending entry, send the IPC
// frame, settle from the worker's reply (or the timeout). Shared by the warm
// pool path (callFunction) and the ephemeral path (callFunctionEphemeral).
function callInSlot(
  slot: Slot,
  module: string,
  name: string,
  args: string,
  options: WorkerCallOptions
): Promise<string> {
  slot.calls++
  slot.lastCallAt = Date.now()
  const id = crypto.randomUUID()
  const request = createWorkerRequest<string>({
    ...options,
    timeoutMs: options.timeoutMs ?? CALL_TIMEOUT_MS,
    label: `Function call ${module}/${name}`,
    onSettled: () => slot.pending.delete(id),
    onCancel: error => {
      if (error.code === 'timeout') slot.timeouts++
      // Arbitrary JS cannot be interrupted safely within one process.
      killSlot(slot, error)
    }
  })
  if (request.settled) return request.promise
  slot.pending.set(id, request)
  void slot.readyPromise.then(
    () => {
      if (request.settled) return
      try {
        slot.worker.send({ version: WORKER_PROTOCOL_VERSION, id, type: 'call', module, name, args })
      } catch (error) {
        const failure = new WorkerError(
          'transport',
          error instanceof Error ? error.message : 'Failed to send to worker'
        )
        request.reject(failure)
        killSlot(slot, failure)
      }
    },
    error =>
      request.reject(
        error instanceof WorkerError ? error : new WorkerError('exited', String(error))
      )
  )
  return request.promise.catch(async error => {
    if (slot.killed) await slot.worker.exited
    throw error
  })
}

function checkCancellation(options: WorkerCallOptions, generation: number) {
  if (draining || generation !== workerGeneration)
    throw new WorkerError('shutdown', 'Server shutting down')
  if (options.signal?.aborted) throw new WorkerError('cancelled', 'Function call cancelled')
}

export async function callFunction(
  module: string,
  name: string,
  args: string,
  workspacePath: string,
  options: WorkerCallOptions = {}
): Promise<string> {
  // Resolve the workspace env before (maybe) spawning, so a fresh worker picks
  // up current .env + custom overrides. Env is fixed at spawn — an already-warm
  // worker keeps its snapshot until restartWorker() reaps it. Widgets only see
  // secrets scoped to the 'widgets' sink.
  const generation = workerGeneration
  checkCancellation(options, generation)
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  checkCancellation(options, generation)
  const slot = getOrSpawn(workspacePath, workspaceEnv)
  return callInSlot(slot, module, name, args, options)
}

// One-shot, isolated invocation — `quint call-server-fn`'s path. Spawns a fresh
// worker just for this call and kills it afterwards, so a debug invocation
// never touches the warm pool the widgets use: no shared module-level state in
// either direction, and a call that wedges the process takes the throwaway
// worker with it, not the pool. Same env resolution, module loading, timeout,
// and devalue wire format as the pool path — only the process lifetime differs.
// The slot is never registered in the LRU cache; its onExit cache-cleanup guard
// no-ops for an uncached slot.
export async function callFunctionEphemeral(
  module: string,
  name: string,
  args: string,
  workspacePath: string,
  options: WorkerCallOptions = {}
): Promise<string> {
  const generation = workerGeneration
  checkCancellation(options, generation)
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  checkCancellation(options, generation)
  const slot = spawnSlot(workspacePath, workspaceEnv)
  try {
    return await callInSlot(slot, module, name, args, options)
  } finally {
    await gracefulKillSlot(slot, 'Ephemeral call finished')
  }
}

// Kill every live worker. Called from the server's shutdown handler so a
// dev-supervisor restart (or Ctrl-C) never orphans worker child processes.
// Wait for disposal or the forced-kill deadline before releasing the drain.
export function liveFunctionWorkerCount(): number {
  return liveSlots.size
}

export function killAllWorkers(): Promise<void> {
  if (draining) return draining
  workerGeneration++
  // Reject calls whose environment lookup was still pending at shutdown.
  // Includes ephemeral workers and retiring pool workers, not just LRU entries.
  draining = Promise.all([...liveSlots].map(slot => gracefulKillSlot(slot, 'Server shutting down')))
    .then(() => {
      slots.clear()
    })
    .finally(() => {
      draining = undefined
    })
  return draining
}

// Reap a workspace's worker so the next callFunction spawns a fresh one with
// up-to-date env. A running process can't pick up new env vars, so an env
// change (UI override or .env edit) requires this hard restart — distinct from
// reloadModules, which only swaps module code inside the live worker.
export function restartWorker(workspacePath: string) {
  const slot = slots.peek(workspacePath)
  if (slot) killSlot(slot, 'Workspace env changed')
  slots.delete(workspacePath)
}

// Caps surfaced in /status so the numbers there are self-explanatory.
export const WORKER_LIMITS = {
  maxWorkers: MAX_WORKERS,
  idleTtlMs: WORKER_IDLE_TTL_MS,
  startupTimeoutMs: 10_000,
  shutdownGraceMs: SHUTDOWN_GRACE_MS,
  callTimeoutMs: CALL_TIMEOUT_MS
} as const

export type WorkerDebugInfo = {
  workspacePath: string
  pid: number | undefined
  ready: boolean
  spawnedAt: number
  lastCallAt: number | null
  calls: number
  errors: number
  timeouts: number
  pending: number
  // ms until the LRU idle TTL reaps this worker (refreshed on every call)
  ttlRemainingMs: number
  // Resident memory of the worker process; null when /proc isn't available (macOS)
  rssBytes: number | null
  modules: string[]
}

// Best-effort RSS from /proc — Linux only, returns null elsewhere. VmRSS is in
// kB, so no page-size assumptions. Sync read of a tiny procfs file is cheap.
function readRss(pid: number | undefined): number | null {
  if (!pid || process.platform !== 'linux') return null
  try {
    const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)\s+kB/m)
    return m ? Number(m[1]) * 1024 : null
  } catch {
    return null
  }
}

// A snapshot of the live worker pool, for the /status page. Iteration and
// getRemainingTTL don't refresh LRU recency, so peeking is side-effect free.
export function getWorkersDebugSnapshot(): WorkerDebugInfo[] {
  const out: WorkerDebugInfo[] = []
  for (const [workspacePath, slot] of slots.entries()) {
    if (slot.killed) continue
    out.push({
      workspacePath,
      pid: slot.worker.pid,
      ready: slot.ready,
      spawnedAt: slot.spawnedAt,
      lastCallAt: slot.lastCallAt,
      calls: slot.calls,
      errors: slot.errors,
      timeouts: slot.timeouts,
      pending: slot.pending.size,
      ttlRemainingMs: slots.getRemainingTTL(workspacePath),
      rssBytes: readRss(slot.worker.pid),
      modules: [...slot.modules].sort()
    })
  }
  return out
}

// Make edited server code take effect: recycle the workspace's worker so the
// next call loads it fresh.
//
// This RECYCLES THE WHOLE WORKER rather than evicting the named modules,
// because eviction cannot actually reload edited code. `loadModule` busts its
// import with `?t=<mtime>`, which only makes a new URL for the `.server.ts`
// itself — everything that file imports stays pinned in Bun's ESM registry
// with no API to invalidate it. So a module whose *dependency* changed re-
// executes against the old dependency, and one whose own mtime is unchanged
// doesn't re-execute at all. A fresh process is the only reliable reset.
//
// `modules` is the reason, not the scope: every module in the worker is
// dropped. Kept in the signature for the kill reason surfaced to callers.
export function reloadModules(modules: string[], workspacePath: string) {
  if (modules.length === 0) return
  // peek: don't refresh TTL just because files changed. If the worker was
  // already idle-evicted, the next callFunction will re-spawn fresh anyway.
  const slot = slots.peek(workspacePath)
  if (!slot || slot.killed) return
  // No need to prune `slot.modules`: the whole slot is going away, and
  // getStatus already skips killed slots.
  void gracefulKillSlot(slot, `Server code changed (${modules.join(', ')})`)
}
