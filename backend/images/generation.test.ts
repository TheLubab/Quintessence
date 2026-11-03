import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

import { serveWorkspaceFile } from '../applet-engine'
import { generateWorkspaceImage, ImageGenerationError } from './generation'

let workspace: string
const png = await sharp({ create: { width: 2, height: 3, channels: 3, background: '#ffffff' } })
  .png()
  .toBuffer()
const apiKey = 'test-key-never-expose'

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'quint-image-'))
})
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

function successfulFetch() {
  return mock(async (_url: string, _init: RequestInit) =>
    Response.json({ data: [{ b64_json: png.toString('base64') }] })
  )
}

async function rejection(promise: Promise<unknown>, code: string) {
  try {
    await promise
    throw new Error('Expected image generation to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(ImageGenerationError)
    expect((error as ImageGenerationError).code).toBe(code)
    expect((error as Error).message).not.toContain(apiKey)
    return error as ImageGenerationError
  }
}

test('missing credentials and invalid prompts fail before calling Meta', async () => {
  const fetcher = successfulFetch()
  const error = await rejection(
    generateWorkspaceImage(workspace, { prompt: 'A fox' }, { fetcher }),
    'missing_api_key'
  )
  expect(error.message).toContain('Settings → Environment')
  for (const prompt of ['', '   ', undefined, 4, 'x'.repeat(32_001)]) {
    await rejection(
      generateWorkspaceImage(workspace, { prompt }, { apiKey, fetcher }),
      'invalid_prompt'
    )
  }
  expect(fetcher).not.toHaveBeenCalled()
  expect(await readdir(workspace)).toEqual([])
})

test('generates one PNG, saves it as a reusable workspace asset, and returns portable chat markup', async () => {
  const fetcher = successfulFetch()
  const result = await generateWorkspaceImage(
    workspace,
    { prompt: ' A watercolor fox ' },
    { apiKey, fetcher }
  )
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url, init] = fetcher.mock.calls[0]!
  expect(url).toBe('https://api.meta.ai/v1/images/generations')
  expect(init.headers).toEqual({
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  })
  expect(JSON.parse(String(init.body))).toEqual({
    model: 'muse-image-1.0',
    prompt: 'A watercolor fox',
    n: 1,
    output_format: 'png',
    response_format: 'b64_json'
  })
  expect(result.width).toBe(2)
  expect(result.height).toBe(3)
  expect(result.url).toBe(`quint:/files/${result.file}`)
  expect(result.markdown).toBe(`![Generated image](${result.url})`)
  const response = await serveWorkspaceFile(workspace, result.file)
  expect(response.status).toBe(200)
  expect(response.headers.get('Content-Type')).toBe('image/png')
  const metadata = await sharp(await response.arrayBuffer()).metadata()
  expect([metadata.width, metadata.height]).toEqual([2, 3])
})

test('edits a workspace image without overwriting the original', async () => {
  await Bun.write(join(workspace, 'original.png'), png)
  const fetcher = successfulFetch()
  const result = await generateWorkspaceImage(
    workspace,
    { prompt: 'Add snow', image: 'original.png' },
    { apiKey, fetcher }
  )
  expect(fetcher.mock.calls[0]![0]).toBe('https://api.meta.ai/v1/images/edits')
  expect(JSON.parse(String(fetcher.mock.calls[0]![1].body)).images).toEqual([
    { image_url: `data:image/png;base64,${png.toString('base64')}` }
  ])
  expect(result.file).not.toBe('original.png')
  expect(Buffer.from(await Bun.file(join(workspace, 'original.png')).arrayBuffer())).toEqual(png)
})

test.each([
  [401, {}, 'invalid_api_key'],
  [402, {}, 'quota_exceeded'],
  [403, {}, 'access_denied'],
  [404, {}, 'access_denied'],
  [429, {}, 'rate_limited'],
  [429, { code: 'insufficient_quota' }, 'quota_exceeded'],
  [400, { code: 'content_policy_violation' }, 'content_blocked'],
  [400, {}, 'request_rejected'],
  [503, {}, 'provider_unavailable']
] as const)(
  'classifies Meta error %s without leaking upstream messages or retrying',
  async (status, fields, code) => {
    const fetcher = mock(async () =>
      Response.json({ error: { ...fields, message: `Sensitive prompt ${apiKey}` } }, { status })
    )
    const error = await rejection(
      generateWorkspaceImage(workspace, { prompt: 'A fox' }, { apiKey, fetcher }),
      code
    )
    expect(error.message).not.toContain('Sensitive prompt')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await readdir(join(workspace, 'images'))).toEqual([])
  }
)

test('handles access errors even when Meta returns no JSON body', async () => {
  await rejection(
    generateWorkspaceImage(
      workspace,
      { prompt: 'A fox' },
      { apiKey, fetcher: async () => new Response(null, { status: 403 }) }
    ),
    'access_denied'
  )
})

test.each([
  [{ data: [] }, 'no_image'],
  [{ data: [{ b64_json: 'not image data' }] }, 'invalid_response'],
  [{ data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }] }, 'invalid_response'],
  [{ data: [{ b64_json: png.subarray(0, 32).toString('base64') }] }, 'invalid_response']
])('rejects missing or corrupt output without saving an image', async (body, code) => {
  await rejection(
    generateWorkspaceImage(
      workspace,
      { prompt: 'A fox' },
      { apiKey, fetcher: async () => Response.json(body) }
    ),
    String(code)
  )
  expect(await readdir(join(workspace, 'images'))).toEqual([])
})

test('handles unreadable success responses and network failures without exposing transport errors', async () => {
  await rejection(
    generateWorkspaceImage(
      workspace,
      { prompt: 'A fox' },
      { apiKey, fetcher: async () => new Response('not JSON') }
    ),
    'invalid_response'
  )
  await rejection(
    generateWorkspaceImage(
      workspace,
      { prompt: 'A fox' },
      {
        apiKey,
        fetcher: async () => {
          throw new Error(apiKey)
        }
      }
    ),
    'network_error'
  )
})

test('times out without retrying a potentially billed generation', async () => {
  const fetcher = mock(
    async (_url: string, init: RequestInit): Promise<Response> =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
  )
  await rejection(
    generateWorkspaceImage(workspace, { prompt: 'A fox' }, { apiKey, fetcher, timeoutMs: 5 }),
    'timeout'
  )
  expect(fetcher).toHaveBeenCalledTimes(1)
})

test('rejects missing, unsupported, hidden, or escaping reference images before a paid request', async () => {
  const fetcher = successfulFetch()
  for (const image of ['', 3, '../outside.png', '.env', 'missing.png', 'drawing.svg']) {
    await rejection(
      generateWorkspaceImage(workspace, { prompt: 'Add snow', image }, { apiKey, fetcher }),
      'invalid_image'
    )
  }
  await symlink(tmpdir(), join(workspace, 'external'))
  await rejection(
    generateWorkspaceImage(
      workspace,
      { prompt: 'Add snow', image: 'external/outside.png' },
      { apiKey, fetcher }
    ),
    'invalid_image'
  )
  expect(fetcher).not.toHaveBeenCalled()
})

test('rejects an images folder pointing outside the workspace before a paid request', async () => {
  await symlink(tmpdir(), join(workspace, 'images'))
  const fetcher = successfulFetch()
  await rejection(
    generateWorkspaceImage(workspace, { prompt: 'A fox' }, { apiKey, fetcher }),
    'save_failed'
  )
  expect(fetcher).not.toHaveBeenCalled()
})
