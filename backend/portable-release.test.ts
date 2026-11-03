import { expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { latestPortableVersion } from './portable-release'

test('portable update discovery preserves Cloudflare and legacy GitHub origins', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quint-release-'))
  const fetchMock = spyOn(globalThis, 'fetch')
  try {
    await Bun.write(join(root, 'repository'), 'owner/repo\n')
    fetchMock.mockResolvedValueOnce(Response.json({ tag_name: 'v1.2.3' }))
    expect(await latestPortableVersion(root)).toBe('1.2.3')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/owner/repo/releases/latest'
    )
    await Bun.write(join(root, 'release-base'), 'https://dl.quint.run\n')
    fetchMock.mockResolvedValueOnce(Response.json({ tag_name: 'v1.3.0' }))
    expect(await latestPortableVersion(root)).toBe('1.3.0')
    expect(fetchMock.mock.calls[1][0]).toBe('https://dl.quint.run/channels/stable.json')
    fetchMock.mockResolvedValueOnce(Response.json({ tag_name: 'v1.4.0-next.1' }))
    await expect(latestPortableVersion(root)).rejects.toThrow('stable Quint release')
  } finally {
    fetchMock.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
})
