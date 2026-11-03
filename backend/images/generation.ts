import { constants } from 'node:fs'
import { access, mkdir, realpath, unlink, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'

const MODEL = 'muse-image-1.0'
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_RESPONSE_BYTES = 48 * 1024 * 1024

type ImageRequest = {
  prompt: unknown
  image?: unknown
}

type ImageGenerationOptions = {
  apiKey?: string
  fetcher?: (url: string, init: RequestInit) => Promise<Response>
  timeoutMs?: number
}

export class ImageGenerationError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ImageGenerationError'
  }
}

function fail(code: string, message: string): never {
  throw new ImageGenerationError(code, message)
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function inside(root: string, path: string): boolean {
  const tail = relative(root, path)
  return !!tail && tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail)
}

async function referenceImage(root: string, path: string): Promise<string> {
  const candidate = resolve(root, path)
  if (
    !inside(root, candidate) ||
    relative(root, candidate)
      .split(sep)
      .some(part => part.startsWith('.'))
  ) {
    fail('invalid_image', 'Use a PNG, JPEG, or WebP image inside this workspace')
  }
  const mediaType = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
  }[extname(candidate).toLowerCase()]
  if (!mediaType) fail('invalid_image', 'Use a PNG, JPEG, or WebP image inside this workspace')
  try {
    const canonical = await realpath(candidate)
    if (!inside(root, canonical))
      fail('invalid_image', 'The reference image must stay inside this workspace')
    const file = Bun.file(canonical)
    if (!file.size || file.size > MAX_IMAGE_BYTES)
      fail('invalid_image', 'The reference image must be between 1 byte and 32 MB')
    const bytes = Buffer.from(await file.arrayBuffer())
    const metadata = await sharp(bytes).metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? ''))
      fail('invalid_image', 'The reference file must contain a PNG, JPEG, or WebP image')
    return `data:image/${metadata.format};base64,${bytes.toString('base64')}`
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error
    fail(
      'invalid_image',
      'Could not read the reference image. Check that it exists and is a valid PNG, JPEG, or WebP file'
    )
  }
}

// Bound the response before parsing: base64 images are large, but an invalid
// upstream response must not consume unbounded memory.
async function readResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    if (!response.ok) return {}
    fail('invalid_response', 'Meta returned an empty image response')
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        fail('invalid_response', 'Meta returned an image response larger than Quint can save')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    if (!response.ok) return {}
    fail('invalid_response', 'Meta returned an unreadable image response. No image was saved')
  }
}

function providerError(status: number, payload: unknown): never {
  // Classify known codes without echoing upstream messages, which can contain
  // request data or credentials. Never retry a paid generation automatically.
  const error = object(object(payload).error)
  const code = String(error.code ?? error.type ?? '')
  if (/content_policy|safety|moderation/i.test(code))
    fail(
      'content_blocked',
      'Meta declined this image request under its content policy. Try a different description'
    )
  if (status === 401)
    fail(
      'invalid_api_key',
      'Meta rejected the API key. Update MODEL_API_KEY in workspace Settings → Environment with a valid Meta Model API key'
    )
  if (status === 402 || /quota|billing|credit|payment/i.test(code))
    fail(
      'quota_exceeded',
      'Meta image generation has no available quota or credit. Check billing and usage limits for your Meta Model API project'
    )
  if (status === 403 || status === 404 || /model_not_found|access_denied|permission/i.test(code))
    fail(
      'access_denied',
      'This Meta API project does not have access to Muse Image. Check model access and project permissions at dev.meta.ai'
    )
  if (status === 429)
    fail('rate_limited', 'Meta image generation is rate limited. Wait before trying again')
  if (status >= 500)
    fail(
      'provider_unavailable',
      'Meta image generation is temporarily unavailable. Try again later'
    )
  fail(
    'request_rejected',
    'Meta rejected the image request. Try a shorter or different description, or another reference image'
  )
}

export async function generateWorkspaceImage(
  workspacePath: string,
  input: ImageRequest,
  { apiKey, fetcher = fetch, timeoutMs = 180_000 }: ImageGenerationOptions = {}
) {
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32_000) {
    fail('invalid_prompt', 'Describe the image using between 1 and 32,000 characters')
  }
  if (input.image !== undefined && (typeof input.image !== 'string' || !input.image.trim())) {
    fail('invalid_image', 'An image path is required for editing')
  }
  if (!apiKey?.trim()) {
    fail(
      'missing_api_key',
      'Image generation needs a Meta Model API key. Add MODEL_API_KEY in workspace Settings → Environment (META_API_KEY is also supported). Muse Code sign-in alone does not configure image generation'
    )
  }

  const root = await realpath(workspacePath)
  const reference =
    typeof input.image === 'string' ? await referenceImage(root, input.image) : undefined
  // Check the destination before making a paid request. Generated assets are
  // regular workspace files, reusable in chat, Canvas, and Quintlets.
  let directory: string
  try {
    const destination = join(root, 'images')
    await mkdir(destination, { recursive: true })
    directory = await realpath(destination)
    if (!inside(root, directory))
      fail('save_failed', 'The workspace images folder must stay inside this workspace')
    await access(directory, constants.W_OK)
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error
    fail(
      'save_failed',
      'Cannot save images in this workspace. Check that the images folder is writable'
    )
  }

  const signal = AbortSignal.timeout(timeoutMs)
  let payload: unknown
  try {
    const response = await fetcher(
      `https://api.meta.ai/v1/images/${reference ? 'edits' : 'generations'}`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: input.prompt.trim(),
          n: 1,
          output_format: 'png',
          response_format: 'b64_json',
          ...(reference ? { images: [{ image_url: reference }] } : {})
        }),
        signal
      }
    )
    payload = await readResponse(response)
    if (!response.ok) providerError(response.status, payload)
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error
    if (signal.aborted)
      fail(
        'timeout',
        'Meta image generation timed out. No image was saved; Meta may still have processed the request. Check usage before retrying'
      )
    fail(
      'network_error',
      'Could not reach Meta image generation. Check the connection. No automatic retry was made'
    )
  }

  const data = object(payload).data
  const encoded = Array.isArray(data) ? object(data[0]).b64_json : undefined
  if (typeof encoded !== 'string' || !encoded.length)
    fail(
      'no_image',
      'Meta returned no generated image. No image was saved; try a different description'
    )
  if (
    encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    fail('invalid_response', 'Meta returned invalid or oversized image data. No image was saved')
  let bytes = Buffer.from(encoded, 'base64')
  let width: number
  let height: number
  try {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('Invalid PNG')
    const decoded = await sharp(bytes, { limitInputPixels: 16_777_216 })
      .png()
      .toBuffer({ resolveWithObject: true })
    bytes = decoded.data
    width = decoded.info.width
    height = decoded.info.height
  } catch {
    fail('invalid_response', 'Meta returned an invalid PNG image. No image was saved')
  }
  const name = `${crypto.randomUUID()}.png`
  try {
    await writeFile(join(directory, name), bytes, { flag: 'wx' })
  } catch (error) {
    if (object(error).code !== 'EEXIST') await unlink(join(directory, name)).catch(() => {})
    fail(
      'save_failed',
      'Meta generated the image, but Quint could not save it. Check workspace disk space and permissions before generating again'
    )
  }
  const file = `images/${name}`
  const url = `quint:/files/${file}`
  return { file, url, markdown: `![Generated image](${url})`, width, height, model: MODEL }
}
