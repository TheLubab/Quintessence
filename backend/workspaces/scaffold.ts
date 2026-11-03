// Scaffolding for a workspace's `.quint/` root, laid down by `quint init`.
// Creates `.quint/widgets/`, writes the widget
// dependency manifest, and installs dependencies — so the agent never has to
// bootstrap the folder itself.
import { appendFile, mkdir, open, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { syncAppletDeclarations } from '../applet-engine/declarations'

// Dependency set available to widgets. `react`/`react-dom` are stubs — at
// runtime they resolve to quint's locally-vendored ESM via the browser importmap
// (/vendor/react); they're listed so editors pick up the correct types.
export const QUINT_PACKAGE_JSON = {
  name: 'widgets',
  private: true,
  dependencies: {
    '@solar-icons/react': '^2.3.3',
    tailwindcss: '^4.3.3',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
    // The `quint ui-components` baseline: every installed component leans on
    // Base UI primitives and the cn() stack, so one install at workspace
    // creation covers the common path. Component-specific deps (recharts,
    // embla, …) stay agent-installed on demand — `add` prints them.
    '@base-ui/react': '^1.8.0',
    'class-variance-authority': '^0.7.1',
    clsx: '^2.1.1',
    'tailwind-merge': '^3.3.1'
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0'
  }
} as const

// Dependency installation is helpful for editor types and widget builds, but
// it's not critical — the agent installs on demand if it's missing. So it must
// never block workspace creation: we wait briefly, then let it finish in the
// background, with a hard kill as a backstop against a hung registry.
const INSTALL_WAIT_MS = 10_000
const INSTALL_TIMEOUT_MS = 120_000

type InstallDependencies = (quintDir: string, logPath: string) => Promise<number>

export function createDependencyInstallLogPath(): string {
  return join(tmpdir(), `quint-bun-install-${crypto.randomUUID()}.log`)
}

async function runBunInstall(quintDir: string, logPath: string): Promise<number> {
  const log = await open(logPath, 'wx', 0o600)
  let install: Bun.Subprocess<'ignore', number, number>
  try {
    await log.writeFile(
      `bun install started at ${new Date().toISOString()}\nWorking directory: ${quintDir}\n\n`
    )
    install = Bun.spawn(['bun', 'install'], {
      cwd: quintDir,
      stdin: 'ignore',
      // Direct file descriptors keep capturing both streams after a
      // short-lived CLI exits; parent-owned pipes would lose that output.
      stdout: log.fd,
      stderr: log.fd
    })
  } catch (err) {
    await log.writeFile(
      `\nbun install error: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return 1
  } finally {
    // The child owns duplicated descriptors now. Closing the parent's handle
    // also lets a short-lived CLI exit while the install is still running.
    await log.close()
  }
  // Bun.spawn's built-in timeout keeps the parent alive even after unref().
  // Unref both the child and our timer so a short-lived CLI can exit after
  // its brief wait. The timeout still applies while the parent is running;
  // after parent exit the orphaned install finishes on its own.
  const timeout = setTimeout(() => install.kill('SIGKILL'), INSTALL_TIMEOUT_MS)
  timeout.unref()
  install.unref()
  try {
    const code = await install.exited
    await appendFile(logPath, `\nbun install exited with code ${code}\n`)
    return code
  } finally {
    clearTimeout(timeout)
  }
}

// Keep machine-local state out of workspaces that are git repos: build output,
// derived caches (applet thumbnails), and installed dependencies are all
// re-creatable and would otherwise churn or bloat the repo. The applet sources,
// package.json, and lockfile stay committable — they ARE the workspace.
const REQUIRED_IGNORES = ['.build/', '.cache/', 'node_modules/'] as const

export const QUINT_GITIGNORE = `# Quint internals — machine-local, re-creatable state
${REQUIRED_IGNORES.join('\n')}
`

// Create `.quint/.gitignore` when missing, or append required entries a
// pre-gitignore or hand-edited file lacks. Never rewrites existing content —
// user additions survive. Safe to call often; no-ops once the file is right.
export async function ensureQuintGitignore(workspacePath: string): Promise<void> {
  const quintDir = join(workspacePath, '.quint')
  if (!(await isDirectory(quintDir))) return
  const path = join(quintDir, '.gitignore')
  const file = Bun.file(path)
  if (!(await file.exists())) {
    await Bun.write(path, QUINT_GITIGNORE)
    return
  }
  const text = await file.text()
  // Match entries with or without the trailing slash or a leading slash.
  const present = new Set(text.split('\n').map(line => line.trim().replace(/^\/|\/$/g, '')))
  const missing = REQUIRED_IGNORES.filter(entry => !present.has(entry.replace(/\/$/, '')))
  if (missing.length === 0) return
  await Bun.write(path, `${text.replace(/\n*$/, '\n')}${missing.join('\n')}\n`)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// Bootstraps `.quint/` ONLY when it doesn't exist yet. Re-running `quint init`
// on an existing workspace overwrites skills but must leave the user's
// `.quint/` (their deps, widgets, lockfile) completely untouched.
// Returns 'exists' when skipped, 'installing' when `bun install` outlived the
// wait and continues in the background, otherwise the install exit code.
export async function scaffoldQuintDir(
  workspacePath: string,
  installDependencies: InstallDependencies = runBunInstall,
  installWaitMs: number = INSTALL_WAIT_MS,
  installLogPath: string = createDependencyInstallLogPath()
): Promise<'exists' | 'installing' | number> {
  // Backstop against the nested-workspace bug: never scaffold a `.quint/` *inside*
  // another workspace's `.quint/` (which produces the junk `.quint/.quint`). Callers
  // (`quint init`) lift to the workspace root via `liftToWorkspaceRoot` first, so
  // this only fires on a programmer error.
  if (resolve(workspacePath).split(sep).includes('.quint')) {
    throw new Error(
      `Refusing to scaffold a workspace inside a .quint directory: ${workspacePath}. ` +
        'Run from the workspace root.'
    )
  }
  const quintDir = join(workspacePath, '.quint')
  const packagePath = join(quintDir, 'package.json')
  if (await Bun.file(packagePath).exists()) {
    // Repair path: workspaces scaffolded before `.quint/.gitignore` existed pick
    // it up on the next `quint init` instead of leaking cache files into git.
    await ensureQuintGitignore(workspacePath)
    return 'exists'
  }
  // A bare `.quint/` dir without package.json counts as not-bootstrapped —
  // fill in the missing pieces.

  await mkdir(join(quintDir, 'widgets'), { recursive: true })
  await Bun.write(packagePath, JSON.stringify(QUINT_PACKAGE_JSON, null, 2) + '\n')
  await ensureQuintGitignore(workspacePath)
  await syncAppletDeclarations(workspacePath)

  const exited = installDependencies(quintDir, installLogPath)
  let timer: ReturnType<typeof setTimeout> | undefined
  const result = await Promise.race([
    exited,
    new Promise<'installing'>(r => (timer = setTimeout(() => r('installing'), installWaitMs)))
  ])
  clearTimeout(timer)

  if (result === 'installing') {
    console.log(
      `[scaffold] bun install in ${quintDir} still running — continuing in the background; log: ${installLogPath}`
    )
    exited.then(code => {
      if (code === 0) console.log(`[scaffold] background bun install in ${quintDir} finished`)
      else
        console.warn(
          `[scaffold] background bun install in ${quintDir} failed (exit ${code}) — the agent will install deps on demand; log: ${installLogPath}`
        )
    })
  }
  return result
}
