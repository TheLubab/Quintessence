import type { SessionActivity, UpdateResult, UpdateStatus } from '@/shared/types'
import { VERSION, isPrerelease } from './version'
import { portableInstall, latestPortableVersion, installPortableVersion } from './portable-release'

export const UPDATE_RESTART_EXIT_CODE = 75
export function isNewer(candidate: string, current: string): boolean {
  try {
    return Bun.semver.order(candidate, current) === 1
  } catch {
    return false
  }
}
type ServerProcess = {
  exited: Promise<number>
}

// A service manager already respawns failed exits. Foreground launchers use
// the same exit code to replace their server child with the updated install.
export async function superviseServerUpdates(
  child: ServerProcess,
  respawn: () => ServerProcess
): Promise<number> {
  let exitCode = await child.exited
  while (exitCode === UPDATE_RESTART_EXIT_CODE) {
    child = respawn()
    exitCode = await child.exited
  }
  return exitCode
}

type UpdateOptions = { runningVersion?: string }
type AvailableUpdate = { version: string; portableRoot: string }
export function hasRunningAgentSessions(sessions: { activity: SessionActivity }[]): boolean {
  return sessions.some(session => session.activity === 'running')
}
async function findAvailableUpdate(options: UpdateOptions): Promise<AvailableUpdate | null> {
  const runningVersion = options.runningVersion ?? VERSION
  const portableRoot = portableInstall()
  if (!portableRoot || isPrerelease(runningVersion)) return null
  const version = await latestPortableVersion(portableRoot)
  return isNewer(version, runningVersion) ? { version, portableRoot } : null
}

// Background checks stay quiet: every failure reads to the UI as "nothing to
// install". The cache still needs to tell the two apart — an unreachable
// registry should be retried in minutes, a successful "you are current" in
// hours — so the outcome carries `ok` alongside the status the UI sees.
type CheckOutcome = { ok: boolean; status: UpdateStatus }

async function checkForUpdate(options: UpdateOptions): Promise<CheckOutcome> {
  const runningVersion = options.runningVersion ?? VERSION
  try {
    const update = await findAvailableUpdate(options)
    return { ok: true, status: { runningVersion, availableVersion: update?.version ?? null } }
  } catch {
    return { ok: false, status: { runningVersion, availableVersion: null } }
  }
}

// One uncached check. The cached path below is what the API serves.
export async function getUpdateStatus(options: UpdateOptions = {}): Promise<UpdateStatus> {
  return (await checkForUpdate(options)).status
}

// ---- cached status ----------------------------------------------------------

// There is deliberately no background timer. The check runs when a client asks
// and the cached answer has aged out, which means: a closed app makes no
// network calls at all, the cost stays flat no matter how many tabs or reloads
// there are, and a machine waking from sleep does exactly one check on the next
// poll instead of firing into a network stack that is not up yet.
export type UpdateTimings = {
  // Nothing is checked this early into the process — one grace window per
  // server boot, not per tab, so a burst of reloads cannot compound it.
  bootGraceMs: number
  // How long a successful answer is served before it is refreshed.
  cacheTtlMs: number
  // How long a *failed* check is remembered. Without this the client's poll
  // interval becomes the retry interval and an offline machine hammers the
  // registry all day.
  failureBackoffMs: number
}

export const UPDATE_BOOT_GRACE_MS = 60_000
export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000
export const UPDATE_FAILURE_BACKOFF_MS = 5 * 60 * 1000

// Test seams (`QUINT_UPDATE_*_MS`): the e2e drives real HTTP against a spawned
// server, so it needs these compressed to milliseconds.
function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

function defaultTimings(): UpdateTimings {
  return {
    bootGraceMs: envMs('QUINT_UPDATE_BOOT_GRACE_MS', UPDATE_BOOT_GRACE_MS),
    cacheTtlMs: envMs('QUINT_UPDATE_CACHE_TTL_MS', UPDATE_CACHE_TTL_MS),
    failureBackoffMs: envMs('QUINT_UPDATE_FAILURE_BACKOFF_MS', UPDATE_FAILURE_BACKOFF_MS)
  }
}

type StatusCache = {
  status: UpdateStatus
  attemptedAt: number
  ok: boolean
}

type CachedStatusOptions = UpdateOptions & {
  now?: () => number
  uptimeMs?: () => number
  timings?: Partial<UpdateTimings>
}

let statusCache: StatusCache | null = null
let statusInFlight: Promise<UpdateStatus> | null = null

// Wall-clock deltas only ever widen an interval here. A clock that jumped
// backwards (an NTP correction after sleep is the usual cause) would otherwise
// read as "checked in the future" and pin the cache forever, so treat it as
// infinitely old: the cost of being wrong is one extra check.
function elapsed(since: number, now: number): number {
  return now >= since ? now - since : Number.POSITIVE_INFINITY
}

function needsRefresh(
  cache: StatusCache | null,
  now: number,
  uptime: number,
  timings: UpdateTimings
): boolean {
  if (uptime < timings.bootGraceMs) return false
  if (!cache) return true
  const age = elapsed(cache.attemptedAt, now)
  return age >= (cache.ok ? timings.cacheTtlMs : timings.failureBackoffMs)
}

// What `GET /api/update` serves: the cached answer, refreshed lazily. Callers
// that arrive together share one refresh, so N tabs crossing the TTL boundary
// at the same moment produce one registry request, not N.
export async function getCachedUpdateStatus(
  options: CachedStatusOptions = {}
): Promise<UpdateStatus> {
  const now = (options.now ?? Date.now)()
  const uptime = (options.uptimeMs ?? defaultUptimeMs)()
  const timings = { ...defaultTimings(), ...options.timings }

  if (!needsRefresh(statusCache, now, uptime, timings)) {
    return (
      statusCache?.status ?? {
        runningVersion: options.runningVersion ?? VERSION,
        availableVersion: null
      }
    )
  }

  statusInFlight ??= checkForUpdate(options)
    .then(outcome => {
      statusCache = { status: outcome.status, attemptedAt: now, ok: outcome.ok }
      return outcome.status
    })
    .finally(() => {
      statusInFlight = null
    })
  return statusInFlight
}

function defaultUptimeMs(): number {
  return process.uptime() * 1000
}

async function performUpdate(options: UpdateOptions): Promise<UpdateResult | null> {
  const update = await findAvailableUpdate(options)
  if (!update) return null

  return { installedVersion: await installPortableVersion(update.portableRoot, update.version) }
}

// Multiple browser tabs share one install; the installer serializes concurrent runs.
let installInFlight: Promise<UpdateResult | null> | null = null

// Lets the API answer a second click with "already in progress" instead of
// silently reporting someone else's install as its own. Stays true once an
// install succeeds — the restart it scheduled has not landed yet, and
// `restartPendingForUpdate` tells those two states apart.
export function updateInProgress(): boolean {
  return installInFlight !== null
}

export function installUpdate(options: UpdateOptions = {}): Promise<UpdateResult | null> {
  installInFlight ??= performUpdate(options).then(
    result => {
      if (!result) installInFlight = null
      // The install just invalidated whatever the cache says is available.
      else statusCache = null
      return result
    },
    error => {
      installInFlight = null
      throw error
    }
  )
  return installInFlight
}

// ---- restart ----------------------------------------------------------------

// Long enough for the HTTP response that triggered it to be flushed to the
// browser that clicked — it is that response the client waits on before it
// starts polling for the restarted server.
export const UPDATE_RESTART_DELAY_MS = 500

let restartScheduled = false

export function restartPendingForUpdate(): boolean {
  return restartScheduled
}

// Hand the process back to whoever supervises it: the foreground CLI
// (`superviseServerUpdates`) and service managers alike bring it back on a
// non-zero exit, and 75 is the code they agree means "updated, come back".
// Latched, so concurrent callers schedule one SIGTERM rather than one each.
export function scheduleRestartForUpdate(delayMs = UPDATE_RESTART_DELAY_MS): boolean {
  if (restartScheduled) return false
  restartScheduled = true
  const timer = setTimeout(() => {
    process.exitCode = UPDATE_RESTART_EXIT_CODE
    process.kill(process.pid, 'SIGTERM')
  }, delayMs)
  timer.unref()
  return true
}

export function __resetUpdateStateForTests(): void {
  installInFlight = null
  statusCache = null
  statusInFlight = null
  restartScheduled = false
}
