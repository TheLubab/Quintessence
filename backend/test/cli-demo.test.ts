// E2e for the cloud-demo CLI gate: system commands (except `version`) print a
// pointer instead of running, workspace commands and the QUINT_SERVER=1 server
// process are exempt. Each test spawns the real CLI with an isolated
// QUINT_DATA_DIR so no real config.json can interfere.
import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

const CLI = join(import.meta.dir, '..', 'cli.ts')

type CliResult = { code: number; stdout: string; stderr: string }

async function runCli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
  const dataDir = await mkdtemp(join(tmpdir(), 'quint-cli-demo-'))
  const proc = Bun.spawn(['bun', CLI, ...args], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      QUINT_DATA_DIR: dataDir,
      QUINT_SERVER: undefined,
      ...env
    }
  })
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { code, stdout, stderr }
}

const DEMO = { QUINT_DEMO: '1' }

// Generous timeouts: each case cold-spawns a fresh `bun` compiling the whole
// CLI import graph, which can take well over the 5s default on CI.
const SPAWN_TIMEOUT = 30_000

test(
  'a system command is blocked in the cloud demo',
  async () => {
    const result = await runCli(['update'], DEMO)
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('quint update is not available in the demo')
    expect(result.stdout).toContain('https://quint.run')
  },
  SPAWN_TIMEOUT
)

test(
  '`quint version` still works in the cloud demo',
  async () => {
    const result = await runCli(['version'], DEMO)
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    expect(result.stdout).not.toContain('not available in the demo')
  },
  SPAWN_TIMEOUT
)

test(
  '`quint start` is exempt so the demo can boot',
  async () => {
    // --help renders usage without binding ports; reaching citty at all
    // proves the gate let `start` through.
    const result = await runCli(['start', '--help'], DEMO)
    expect(result.code).toBe(0)
    expect(result.stdout + result.stderr).not.toContain('not available in the demo')
  },
  SPAWN_TIMEOUT
)

test(
  'system commands run normally without the demo flag',
  async () => {
    const result = await runCli(['version'])
    expect(result.code).toBe(0)
    expect(result.stdout).not.toContain('not available in the demo')
  },
  SPAWN_TIMEOUT
)
