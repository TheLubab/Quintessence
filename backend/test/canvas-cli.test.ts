import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('canvas and legacy scratch commands operate on the same workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quint-canvas-cli-'))
  const backend = resolve(import.meta.dir, '..')
  const script = `
    import { mock } from 'bun:test'
    const constantsPath = ${JSON.stringify(join(backend, 'constants.ts'))}
    const constants = await import(constantsPath)
    mock.module(constantsPath, () => ({ ...constants, CONTROL_PORT: 0 }))
    const { setRegistryPath } = await import(${JSON.stringify(join(backend, 'workspaces/registry.ts'))})
    const root = ${JSON.stringify(root)}
    setRegistryPath(root + '/registry.json')
    await Bun.write(root + '/registry.json', JSON.stringify([{ id: 'test-workspace', path: root, type: 'meta' }]))
    const { control } = await import(${JSON.stringify(join(backend, 'control.ts'))})
    async function run(args) {
      const cli = Bun.spawn([process.execPath, ${JSON.stringify(join(backend, 'cli.ts'))}, ...args], {
        cwd: root, env: { ...process.env, QUINT_CONTROL_PORT: String(control.port) },
        stdout: 'pipe', stderr: 'pipe'
      })
      const [code, stdout, stderr] = await Promise.all([cli.exited, new Response(cli.stdout).text(), new Response(cli.stderr).text()])
      return { code, stdout, stderr }
    }
    const add = await run(['canvas', 'add', 'text', '--at', '10,20', '--text', 'hello', '--id', 'greeting'])
    const read = await run(['scratch', 'read'])
    control.stop(true)
    console.log(JSON.stringify({ add, read }))
    process.exit(0)
  `
  try {
    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: resolve(backend, '..'),
      env: { ...process.env, QUINT_SECRET_BACKEND: 'file' },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [code, output, error] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ])
    expect({ code, error }).toEqual({ code: 0, error: '' })
    const result = JSON.parse(output) as {
      add: { code: number; stderr: string }
      read: { code: number; stdout: string; stderr: string }
    }
    expect(result.add.code, result.add.stderr).toBe(0)
    expect(result.read.code, result.read.stderr).toBe(0)
    expect(result.read.stdout).toContain('hello')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
