import { expect, test } from 'bun:test'
import worker from './worker'

function environment(tag?: string) {
  return {
    ASSETS: { fetch: async () => new Response('landing') },
    RELEASES: {
      get: async () =>
        tag ? { body: new Response(JSON.stringify({ tag_name: tag })).body! } : null
    }
  }
}

test('serves landing assets independently of release availability', async () => {
  const response = await worker.fetch(new Request('https://quint.run/'), environment())
  expect(await response.text()).toBe('landing')
})

test('installer returns an uncached redirect to a versioned R2 object', async () => {
  const response = await worker.fetch(
    new Request('https://quint.run/install.ps1'),
    environment('v1.2.3')
  )
  expect(response.status).toBe(302)
  expect(response.headers.get('Location')).toBe('https://dl.quint.run/v1.2.3/install.ps1')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

test('missing release returns a retryable error rather than landing HTML', async () => {
  const response = await worker.fetch(new Request('https://quint.run/install.sh'), environment())
  expect(response.status).toBe(503)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

test('preview tags cannot become the default installer', async () => {
  const response = await worker.fetch(
    new Request('https://quint.run/install.sh'),
    environment('v1.2.3-next.1')
  )
  expect(response.status).toBe(503)
})

test('HEAD on a manifest omits its body', async () => {
  const response = await worker.fetch(
    new Request('https://quint.run/releases/stable.json', { method: 'HEAD' }),
    environment('v1.2.3')
  )
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('')
})
