type ReleaseObject = {
  body: ReadableStream
}

type SiteEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> }
  RELEASES: { get(key: string): Promise<ReleaseObject | null> }
}

export default {
  async fetch(request: Request, env: SiteEnv): Promise<Response> {
    const path = new URL(request.url).pathname
    const installer = path === '/install.sh' || path === '/install.ps1'
    const channel = path === '/releases/stable.json' || path === '/releases/preview.json'
    if (!installer && !channel) return env.ASSETS.fetch(request)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const key = channel ? `channels/${path.split('/').pop()}` : 'channels/stable.json'
    const object = await env.RELEASES.get(key)
    if (!object) {
      return new Response('No release has been published yet', {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' }
      })
    }
    if (installer) {
      const manifest = (await new Response(object.body).json()) as { tag_name: string }
      if (!/^v\d+\.\d+\.\d+$/.test(manifest.tag_name)) {
        return new Response('Invalid stable release', { status: 503 })
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: `https://dl.quint.run/${manifest.tag_name}${path}`,
          'Cache-Control': 'no-store'
        }
      })
    }
    return new Response(request.method === 'HEAD' ? null : object.body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    })
  }
}
