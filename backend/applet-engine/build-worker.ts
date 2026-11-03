// Out-of-process applet compiler.
//
// `Bun.build` shares one process-wide resolver cache with the runtime module
// loader: `node_modules` directory listings, `package.json` contents, and —
// crucially — FAILED bare-specifier lookups are memoized for the life of the
// process and never invalidated (still true in Bun 1.4). The Quint server is
// long-lived, so an in-process build that once failed with `Could not resolve
// "pkg"` keeps failing for that specifier after the agent runs `bun add pkg`,
// and a workspace that gains its own `node_modules` (or bumps a package's
// `exports`) keeps resolving through the stale entry. Restarting the server
// was the only cure, and the agent isn't allowed to do that.
//
// So every build batch runs in a fresh `bun` child: the child imports this
// module as its entry, receives one `BuildRequest` over IPC, compiles each job
// with `buildApplet`, writes the bundle dirs, and replies with a
// `BuildResponse`. A cold child costs ~150ms, almost all of it importing this
// module's graph (bun-plugin-tailwind, applet-css, @babel/parser) — and a
// crash inside Bun's bundler no longer takes the server down with it.
//
// Lifecycle: the child never exits on its own after replying. `process.exit`
// right after `process.send` drops the message once it outgrows the IPC pipe
// buffer (~1MB — a handful of failed applets with long Bun diagnostics gets
// there), so the parent kills the child once the result has arrived. The
// child exits by itself only when the parent is gone: on IPC `disconnect`,
// or when its parent pid changes (a crashed/SIGKILLed server never sends
// disconnect, but the orphan is reparented). Live children are tracked so the
// server's shutdown path can kill them — an untracked build outliving a dev
// restart would keep rewriting `.build/` under the replacement server.
//
// `buildApplet` itself stays in-process-capable: tests call it directly, and
// nothing here changes its contract.
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'path'

import { buildApplet } from './build-applet'
import {
  WORKER_PROTOCOL_VERSION as version,
  isBuildRequest,
  isBuildResponse,
  isWorkerReady,
  isWorkerShutdown,
  type BuildRequest,
  type BuildResponse,
  type BuildJobResult
} from './worker-protocol'
import { createWorkerRequest, WorkerError, type WorkerCallOptions } from './worker-request'
export type { BuildJob, BuildJobResult, BuildRequest, BuildResponse } from './worker-protocol'

const WORKER_PATH = join(import.meta.dir, 'build-worker.ts')

// Children currently compiling a batch, for `killBuildWorkers()`.
const liveWorkers = new Map<ReturnType<typeof Bun.spawn>, (error: WorkerError) => void>()
export const BUILD_TIMEOUT_MS = 120_000

// How many build children are alive right now (tests assert none leak).
export function liveBuildWorkerCount(): number {
  return liveWorkers.size
}

// Kill every in-flight build child. Called from the server's shutdown path
// (SIGTERM from the dev supervisor, Ctrl-C) alongside the function-worker pool
// so a half-done bundle can't keep writing after the server is gone. Pending
// batches settle as failed through `onExit`.
export async function killBuildWorkers(): Promise<void> {
  const workers = [...liveWorkers]
  for (const [, cancel] of workers) cancel(new WorkerError('shutdown', 'Server shutting down'))
  await Promise.all(workers.map(([worker]) => worker.exited))
}

// Compile every job and write its bundle dir. Runs inside the child, but is a
// plain function so the batch semantics (parallel jobs, per-job failure
// isolation, clear-then-write) are testable without spawning.
export async function runBuildJobs(req: BuildRequest): Promise<BuildJobResult[]> {
  return Promise.all(
    req.jobs.map(async (job): Promise<BuildJobResult> => {
      try {
        const artifact = await buildApplet(job.srcPath, req.quintRoot, req.kind)
        // Clear the dir first so stale hashed assets from a prior build don't
        // accumulate, then write the fresh entry + chunks + assets.
        await rm(job.outDir, { recursive: true, force: true })
        await mkdir(job.outDir, { recursive: true })
        for (const f of artifact.files) {
          await Bun.write(join(job.outDir, f.name), f.data)
        }
        return {
          name: job.name,
          status: 'built',
          serverModules: artifact.serverModules.map(m => m.name),
          config: artifact.config
        }
      } catch (err) {
        return {
          name: job.name,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      }
    })
  )
}

// Host side: spawn a fresh child for one batch and collect its results. The
// child inherits cwd and env, so resolution behaves exactly as the in-process
// build did (see the `devalue` and `serverCwd` notes in build-applet.ts) —
// minus the poisoned cache. A child that dies before replying fails every job
// in the batch with its exit code rather than hanging the caller.
export async function buildAppletsInChild(
  req: Omit<BuildRequest, 'type' | 'version' | 'id'>,
  options: WorkerCallOptions = {}
): Promise<BuildJobResult[]> {
  if (req.jobs.length === 0) return []
  const id = crypto.randomUUID()
  let proc: ReturnType<typeof Bun.spawn> | undefined
  const request = createWorkerRequest<BuildJobResult[]>({
    ...options,
    timeoutMs: options.timeoutMs ?? BUILD_TIMEOUT_MS,
    label: 'Build worker',
    onCancel: () => {
      try {
        proc?.kill('SIGKILL')
      } catch {}
    }
  })
  try {
    if (!request.settled) {
      proc = Bun.spawn([process.execPath, WORKER_PATH], {
        stdio: ['ignore', 'inherit', 'inherit'],
        serialization: 'json',
        ipc(message, child) {
          if (request.settled) return
          if (isWorkerReady(message)) {
            try {
              child.send({ version, type: 'build', id, ...req } satisfies BuildRequest)
            } catch (error) {
              request.reject(
                new WorkerError(
                  'transport',
                  error instanceof Error ? error.message : 'Could not send build request'
                )
              )
            }
          } else if (
            isBuildResponse(message) &&
            message.id === id &&
            message.results.length === req.jobs.length &&
            message.results.every((result, i) => result.name === req.jobs[i]?.name)
          ) {
            request.resolve(message.results)
          } else request.reject(new WorkerError('protocol', 'Invalid build worker response'))
        },
        onExit(child, code, signal) {
          liveWorkers.delete(child)
          request.reject(
            new WorkerError(
              'exited',
              `Build worker exited (${signal ? `signal ${signal}` : `code ${code}`}) before reporting a result`
            )
          )
        }
      })
      liveWorkers.set(proc, error => {
        request.reject(error)
        try {
          proc?.kill('SIGKILL')
        } catch {}
      })
    }
    return await request.promise
  } catch (error) {
    request.reject(
      error instanceof WorkerError
        ? error
        : new WorkerError(
            'transport',
            error instanceof Error ? error.message : 'Could not start build worker'
          )
    )
    // If spawn failed before awaiting it, consume the rejected request too.
    await request.promise.catch(() => {})
    return req.jobs.map(job => ({
      name: job.name,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Build worker failed'
    }))
  } finally {
    if (proc) {
      try {
        proc.kill('SIGKILL')
      } catch {}
      await proc.exited
      liveWorkers.delete(proc)
    }
  }
}

if (import.meta.main) {
  // Orphan guards — the only ways the child ends itself. See the lifecycle
  // note at the top: the parent kills us after it has read the result.
  const parentPid = process.ppid
  process.on('disconnect', () => process.exit(0))
  setInterval(() => {
    if (process.ppid !== parentPid) process.exit(0)
  }, 500)

  let started = false
  process.on('message', async (message: unknown) => {
    if (isWorkerShutdown(message)) process.exit(0)
    if (started || !isBuildRequest(message)) {
      process.exit(1)
      return
    }
    started = true
    const results = await runBuildJobs(message)
    const response: BuildResponse = { version, type: 'result', id: message.id, results }
    process.send?.(response)
  })
  process.send?.({ version, type: 'ready' })
}
