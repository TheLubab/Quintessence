import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SERVER = resolve(import.meta.dir, '..')

// Keep control-server imports, environment stores, and fetch stubs in a child
// process. Exercise the real CLI, workspace resolution, provider request, and
// file save without contacting Meta or starting the agent runtime.
async function runImage(mode: 'generate' | 'edit' | 'missing' | 'forbidden') {
  const fixture = await mkdtemp(join(tmpdir(), 'quint-image-cli-'))
  const script = `
    import { mock } from 'bun:test'
    import { mkdir } from 'node:fs/promises'
    import sharp from ${JSON.stringify(Bun.resolveSync('sharp', SERVER))}
    const root = ${JSON.stringify(fixture)}
    const mode = ${JSON.stringify(mode)}
    const constants = await import(${JSON.stringify(join(SERVER, 'constants.ts'))})
    mock.module(${JSON.stringify(join(SERVER, 'constants.ts'))}, () => ({ ...constants, CONTROL_PORT: 0 }))
    const { setRegistryPath } = await import(${JSON.stringify(join(SERVER, 'workspaces/registry.ts'))})
    const { setWorkspaceEnvStorePath } = await import(${JSON.stringify(join(SERVER, 'workspaces/env.ts'))})
    setRegistryPath(root + '/registry.json')
    setWorkspaceEnvStorePath(root + '/env-meta.json', root + '/env-secrets.json')
    await Bun.write(root + '/registry.json', JSON.stringify([{ id: 'test-workspace', path: root, type: 'meta' }]))
    if (mode !== 'missing') await Bun.write(root + '/.env', (mode === 'edit' ? 'META_API_KEY' : 'MODEL_API_KEY') + '=fixture-key')
    await mkdir(root + '/nested', { recursive: true })
    const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } }).png().toBuffer()
    if (mode === 'edit') await Bun.write(root + '/original.png', png)
    const requests = []
    globalThis.fetch = async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body), authorized: init.headers.Authorization === 'Bearer fixture-key' })
      if (mode === 'forbidden') return Response.json({ error: { message: 'private upstream details' } }, { status: 403 })
      return Response.json({ data: [{ b64_json: png.toString('base64') }] })
    }
    const { control } = await import(${JSON.stringify(join(SERVER, 'control.ts'))})
    const cli = Bun.spawn([process.execPath, ${JSON.stringify(join(SERVER, 'cli.ts'))}, 'image', mode === 'edit' ? 'edit' : 'generate',
      'A watercolor fox', ...(mode === 'edit' ? ['--image', 'original.png'] : [])], {
      cwd: root + '/nested',
      env: { ...process.env, QUINT_CONTROL_PORT: String(control.port) },
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'
    })
    const [output, error, code] = await Promise.all([new Response(cli.stdout).text(), new Response(cli.stderr).text(), cli.exited])
    control.stop(true)
    const result = output.trim() ? JSON.parse(output) : null
    const saved = result?.file ? await Bun.file(root + '/' + result.file).exists() : false
    console.log(JSON.stringify({ requests, result, saved, error, code }))
    process.exit(0)
  `
  try {
    const proc = Bun.spawn([process.execPath, '--eval', script], {
      cwd: resolve(SERVER, '..'),
      env: { ...process.env, MODEL_API_KEY: '', META_API_KEY: '', QUINT_SECRET_BACKEND: 'file' },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const [output, error, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ])
    if (code !== 0) throw new Error(error)
    return JSON.parse(output) as {
      requests: { url: string; body: Record<string, unknown>; authorized: boolean }[]
      result: { file: string; markdown: string; ok: boolean } | null
      saved: boolean
      error: string
      code: number
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

test.each(['generate', 'edit'] as const)(
  'image %s uses workspace credentials from a nested directory and returns a saved chat image',
  async mode => {
    const { requests, result, saved, code } = await runImage(mode)
    expect(code).toBe(0)
    expect(saved).toBe(true)
    expect(result?.ok).toBe(true)
    expect(result?.markdown).toContain(`quint:/files/${result?.file}`)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.authorized).toBe(true)
    expect(requests[0]?.url).toBe(
      `https://api.meta.ai/v1/images/${mode === 'edit' ? 'edits' : 'generations'}`
    )
    expect(requests[0]?.body.prompt).toBe('A watercolor fox')
    if (mode === 'edit') expect(requests[0]?.body.images).toHaveLength(1)
  }
)

test('image CLI reports missing credentials without making a request or creating an image', async () => {
  const { requests, result, saved, error, code } = await runImage('missing')
  expect(code).toBe(1)
  expect(result).toBeNull()
  expect(saved).toBe(false)
  expect(requests).toEqual([])
  expect(error).toContain('MODEL_API_KEY')
  expect(error).toContain('Settings → Environment')
})

test('image CLI reports denied model access without leaking upstream details', async () => {
  const { requests, saved, error, code } = await runImage('forbidden')
  expect(code).toBe(1)
  expect(saved).toBe(false)
  expect(requests).toHaveLength(1)
  expect(error).toContain('does not have access to Muse Image')
  expect(error).not.toContain('fixture-key')
  expect(error).not.toContain('private upstream details')
})
