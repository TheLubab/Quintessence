import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const releaseAssets = [
  'quint-linux-x64.tar.gz',
  'quint-linux-arm64.tar.gz',
  'quint-macos-x64.tar.gz',
  'quint-macos-arm64.tar.gz',
  'quint-windows-x64.zip',
  'quint-windows-arm64.zip'
]

export function validateRelease(tag: string, preview: boolean): void {
  if (!/^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(tag) || tag.includes('-') !== preview) {
    throw new Error('Release tag must match its stable or preview channel')
  }
}

export function shouldPromote(current: string, next: string): boolean {
  const a = current.slice(1).split('.').map(Number)
  const b = next.slice(1).split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return b[i] > a[i]
  }
  return current === next
}

async function publish() {
  const metadata = (await Bun.file('release-metadata.json').json()) as {
    tag_name: string
    draft: boolean
    prerelease: boolean
    published_at: string
  }
  if (metadata.draft) throw new Error('Draft releases cannot be delivered publicly')
  const tag = metadata.tag_name
  validateRelease(tag, metadata.prerelease)
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!account || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare account and R2 credentials are required')
  }
  const bucket = 'quint-releases'
  const scratch = await mkdtemp(join(tmpdir(), 'quint-publish-'))
  const aws = (...args: string[]) => {
    const result = Bun.spawnSync(
      [
        'aws',
        '--endpoint-url',
        `https://${account}.r2.cloudflarestorage.com`,
        '--region',
        'auto',
        's3api',
        ...args
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    return result.stdout.toString()
  }
  const download = (key: string, destination: string): boolean => {
    try {
      aws('get-object', '--bucket', bucket, '--key', key, destination)
      return true
    } catch (error) {
      if (error instanceof Error && /\(NoSuchKey\)|\(404\)/.test(error.message)) return false
      throw error
    }
  }
  const digest = async (path: string) =>
    createHash('sha256')
      .update(await readFile(path))
      .digest('hex')
  try {
    const checksums = await Bun.file('release-assets/checksums.txt').text()
    // Validate every archive before making any uploads.
    for (const name of releaseAssets) {
      const lines = checksums.split('\n').filter(line => line.endsWith(`  ${name}`))
      if (lines.length !== 1 || lines[0] !== `${await digest(`release-assets/${name}`)}  ${name}`) {
        throw new Error(`Invalid checksum for ${name}`)
      }
    }
    for (const name of [...releaseAssets, 'checksums.txt', 'install.sh', 'install.ps1']) {
      const source = `release-assets/${name}`
      if (
        name.startsWith('install.') &&
        (await Bun.file(source).text()).includes('@QUINT_RELEASE_REPO@')
      ) {
        throw new Error('Installer repository token was not substituted')
      }
      const key = `${tag}/${name}`
      const copy = join(scratch, name)
      const expected = await digest(source)
      if (download(key, copy)) {
        if ((await digest(copy)) !== expected)
          throw new Error(`Refusing to replace published object ${key}`)
      } else {
        aws(
          'put-object',
          '--bucket',
          bucket,
          '--key',
          key,
          '--body',
          source,
          '--content-type',
          name.endsWith('.zip')
            ? 'application/zip'
            : name.endsWith('.gz')
              ? 'application/gzip'
              : 'text/plain; charset=utf-8',
          '--cache-control',
          'public, max-age=31536000, immutable'
        )
        if (!download(key, copy) || (await digest(copy)) !== expected)
          throw new Error(`R2 verification failed for ${key}`)
      }
    }
    const channel = metadata.prerelease ? 'preview' : 'stable'
    const key = `channels/${channel}.json`
    const manifest = join(scratch, 'manifest.json')
    if (download(key, manifest)) {
      const current = JSON.parse(await readFile(manifest, 'utf8')) as {
        tag_name: string
        published_at: string
      }
      const promote = metadata.prerelease
        ? metadata.published_at >= current.published_at
        : shouldPromote(current.tag_name, tag)
      if (!promote) {
        console.log(`Mirrored ${tag}; retained newer ${channel} release ${current.tag_name}`)
        return
      }
    }
    await writeFile(
      manifest,
      JSON.stringify({
        tag_name: tag,
        published_at: metadata.published_at,
        base_url: `https://dl.quint.run/${tag}`
      }) + '\n'
    )
    // One pointer is promoted only after all immutable objects have been verified.
    aws(
      'put-object',
      '--bucket',
      bucket,
      '--key',
      key,
      '--body',
      manifest,
      '--content-type',
      'application/json',
      '--cache-control',
      'no-store'
    )
    console.log(`Published ${tag} to ${channel}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

if (import.meta.main) await publish()
