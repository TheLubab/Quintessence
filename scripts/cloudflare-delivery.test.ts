import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { releaseAssets } from './publish-cloudflare'

test('failed upload preserves the channel; retries verify files and reject replacements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quint-delivery-test-'))
  try {
    await Bun.write(
      join(root, 'bin/aws'),
      `#!${process.execPath}
const args = process.argv.slice(2)
const { mkdirSync, copyFileSync, existsSync } = await import('node:fs')
const { dirname, join } = await import('node:path')
const key = args[args.indexOf('--key') + 1]
const path = join(process.env.TEST_BUCKET, key)
if (args.includes('get-object')) {
  if (!existsSync(path)) { console.error('(NoSuchKey)'); process.exit(1) }
  copyFileSync(path, args.at(-1))
} else {
  if (process.env.TEST_FAIL_KEY === key) { console.error('Upload failed'); process.exit(1) }
  mkdirSync(dirname(path), { recursive: true })
  copyFileSync(args[args.indexOf('--body') + 1], path)
}
`
    )
    await chmod(join(root, 'bin/aws'), 0o755)
    await Bun.write(
      join(root, 'release-metadata.json'),
      JSON.stringify({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        published_at: '2026-11-03T00:00:00Z'
      })
    )
    let checksums = ''
    for (const name of releaseAssets) {
      await Bun.write(join(root, 'release-assets', name), name)
      checksums += `${createHash('sha256').update(name).digest('hex')}  ${name}\n`
    }
    for (const name of ['install.sh', 'install.ps1']) {
      await Bun.write(join(root, 'release-assets', name), 'installer')
    }
    await Bun.write(join(root, 'release-assets/checksums.txt'), checksums)
    const run = async (failKey = '') => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, 'publish-cloudflare.ts')], {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${join(root, 'bin')}:${process.env.PATH}`,
          TEST_BUCKET: join(root, 'bucket'),
          TEST_FAIL_KEY: failKey,
          CLOUDFLARE_ACCOUNT_ID: 'test',
          AWS_ACCESS_KEY_ID: 'test',
          AWS_SECRET_ACCESS_KEY: 'test'
        },
        stdout: 'pipe',
        stderr: 'pipe'
      })
      const stderr = await new Response(child.stderr).text()
      return { code: await child.exited, stderr }
    }
    expect((await run('v1.2.3/install.ps1')).code).not.toBe(0)
    expect(await Bun.file(join(root, 'bucket/channels/stable.json')).exists()).toBe(false)
    expect(await run()).toEqual({ code: 0, stderr: '' })
    expect((await Bun.file(join(root, 'bucket/channels/stable.json')).json()).tag_name).toBe(
      'v1.2.3'
    )
    expect(await run()).toEqual({ code: 0, stderr: '' })
    await Bun.write(join(root, 'release-assets/install.sh'), 'changed installer')
    const rejected = await run()
    expect(rejected.code).not.toBe(0)
    expect(rejected.stderr).toContain('Refusing to replace published object')
    expect(await Bun.file(join(root, 'bucket/v1.2.3/install.sh')).text()).toBe('installer')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
