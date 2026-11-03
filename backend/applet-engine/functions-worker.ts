// MEI Functions Worker — child process that loads and executes .server.ts modules.
// Spawned by the main process with IPC. Receives call/reload messages.
import { parse, stringify } from 'devalue'
import { join, resolve, sep } from 'path'
import {
  isFunctionRequest,
  WORKER_PROTOCOL_VERSION as version,
  type FunctionResponse
} from './worker-protocol'

const MEI_DIR =
  process.env.MEI_FUNCTIONS_DIR ?? join(import.meta.dir, '..', '..', 'test-workspace', '.quint')

// The parent spawns us from a neutral cwd so Bun never auto-loads the
// workspace's `.env` into this process — quint injects the resolved, scope-filtered
// env at spawn instead (see functions.ts). Restore the documented
// `cwd = workspace root` so server functions can use plain relative paths.
if (process.env.MEI_WORKSPACE_ROOT) {
  try {
    process.chdir(process.env.MEI_WORKSPACE_ROOT)
  } catch {}
}

const moduleCache = new Map<string, Record<string, unknown>>()

function send(msg: FunctionResponse) {
  try {
    process.send!(msg)
  } catch {
    // IPC channel closed — parent died
  }
}

async function loadModule(name: string): Promise<Record<string, unknown>> {
  const cached = moduleCache.get(name)
  if (cached) return cached

  // Module keys are paths relative to MEI_DIR (the workspace's `.quint/`),
  // e.g. "widgets/hello". Defense-in-depth: the route already rejects `..`
  // segments, but never load a file that resolves outside MEI_DIR.
  const filePath = join(MEI_DIR, `${name}.server.ts`)
  if (!resolve(filePath).startsWith(resolve(MEI_DIR) + sep)) {
    throw new Error(`Server module "${name}" not found`)
  }
  const file = Bun.file(filePath)

  if (!(await file.exists())) {
    throw new Error(`Server module "${name}" not found`)
  }

  const mod = (await import(filePath + `?t=${file.lastModified}`)) as Record<string, unknown>
  moduleCache.set(name, mod)
  // Tell the parent what's cached here — introspection only, shown in /status.
  send({ version, type: 'loaded', module: name })
  return mod
}

async function evictModule(name: string) {
  const mod = moduleCache.get(name)
  if (!mod) return

  if (typeof mod.dispose === 'function') {
    try {
      await (mod.dispose as () => Promise<void>)()
    } catch (err) {
      console.error(`[mei] dispose error in ${name}.server.ts:`, err)
    }
  }

  moduleCache.delete(name)
}

let shuttingDown = false
const parentPid = process.ppid
process.on('disconnect', () => process.exit(0))
const orphanGuard = setInterval(() => {
  if (process.ppid !== parentPid) process.exit(0)
}, 500)
orphanGuard.unref()

process.on('message', async (raw: unknown) => {
  if (!isFunctionRequest(raw)) {
    if (raw && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string') {
      send({
        version,
        id: raw.id,
        type: 'error',
        code: 'protocol',
        message: 'Malformed worker request'
      })
    } else process.exit(1)
    return
  }
  if (shuttingDown) return
  if (raw.type === 'reload') {
    for (const name of raw.modules) {
      await evictModule(name)
    }
    return
  }

  // Graceful exit. The parent kills this process to pick up edited server code
  // — evicting from moduleCache isn't enough, because a module's own imports
  // are pinned in Bun's ESM registry with no way to invalidate them (the
  // `?t=` buster below only busts the .server.ts itself, one level deep). Run
  // every cached module's `dispose()` first so a hard kill doesn't strand a db
  // handle or timer; the parent hard-kills us if we take too long.
  if (raw.type === 'shutdown') {
    shuttingDown = true
    for (const name of [...moduleCache.keys()]) {
      await evictModule(name)
    }
    process.exit(0)
  }

  if (raw.type === 'call') {
    const { id, module: moduleName, name, args } = raw

    if (!id || !moduleName || !name) {
      send({ version, id, type: 'error', code: 'protocol', message: 'Malformed call message' })
      return
    }

    try {
      const mod = await loadModule(moduleName)
      const fn = mod[name]

      if (typeof fn !== 'function') {
        throw new Error(`"${name}" in ${moduleName}.server.ts is not a function`)
      }

      const parsedArgs: unknown = parse(args)
      if (!Array.isArray(parsedArgs)) throw new Error('Function arguments must be an array')
      const result = await fn(...parsedArgs)

      send({ version, id, type: 'result', data: stringify(result) })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      send({ version, id, type: 'error', code: 'execution', message })
    }
  }
})

send({ version, type: 'ready' })
