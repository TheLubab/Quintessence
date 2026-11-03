import { describe, expect, test } from 'bun:test'
import { resolveUrl } from './navigation'

const context = { workspaceId: 'abc' }

describe('resolveUrl', () => {
  test.each(['dashboard', 'canvas', 'quintlets/events', 'chat', 'chats/session-1'])(
    'resolves %s inside the supplied workspace',
    path => {
      expect(resolveUrl(`quint:/${path}`, context)).toBe(`/workspace/abc/${path}`)
      expect(resolveUrl(`quint:/${path}`, { workspaceId: 'other', base: '/prefix/' })).toBe(
        `/prefix/workspace/other/${path}`
      )
    }
  )

  test('normalizes portable addresses for CLI validation without a workspace', () => {
    expect(resolveUrl('quint:/quintlets/%65vents?b=2&a=1')).toBe('quint:/quintlets/events?a=1&b=2')
    expect(resolveUrl('quint:/chats/provider%3Aid', context)).toBe(
      '/workspace/abc/chats/provider%3Aid'
    )
    expect(resolveUrl('quint:/chats/%252f', context)).toBe('/workspace/abc/chats/%252f')
    expect(resolveUrl('quint:/quintlets/events', { workspaceId: 'a/b' })).toBe(
      '/workspace/a%2Fb/quintlets/events'
    )
  })

  test('encodes query values once and preserves repeated values', () => {
    const values = { title: 'Grüße & a/b?c=#100% +', enabled: 'false', page: '02', empty: '' }
    const resolved = new URL(
      resolveUrl(`quint:/quintlets/events?${new URLSearchParams(values)}`, context),
      'https://quint.test'
    )
    for (const [key, value] of Object.entries(values))
      expect(resolved.searchParams.get(key)).toBe(value)
    expect(resolveUrl('quint:/quintlets/events?b=2&x=1&x=2&a=1', context)).toBe(
      '/workspace/abc/quintlets/events?a=1&b=2&x=1&x=2'
    )
  })

  test('rejects malformed or unsupported addresses, including retired bookmarks', () => {
    for (const href of [
      null,
      2,
      '',
      '/quintlets/events',
      'quintlet:events',
      'quint://quintlets/events',
      'quint:/quintlet:events',
      'quint:/agent',
      'quint:/quintlets/',
      'quint:/quintlets/a/b',
      'quint:/quintlets/%2f',
      'quint:/quintlets/%',
      'quint:/quintlets/100%25',
      'quint:/quintlets/my.events',
      'quint:/quintlets/Gr%C3%BC%C3%9Fe%20events',
      'quint:/quintlets/../dashboard',
      'quint:/quintlets/a#part',
      'quint:/quintlet-builders/a',
      'quint:/chat/',
      'quint:/chat#part',
      'quint:/chats/',
      'quint:/chats/a/b',
      'quint:/chats/%2f',
      'quint:/chats/%',
      'quint:/chats/%00',
      'quint:/chats/..'
    ])
      expect(() => resolveUrl(href, context)).toThrow()
  })

  test('keeps ordinary web addresses and rejects executable protocols', () => {
    expect(resolveUrl('https://example.com/a?q=b', context)).toBe('https://example.com/a?q=b')
    expect(() => resolveUrl('javascript:alert(1)', context)).toThrow()
    expect(() => resolveUrl('data:text/html,hello', context)).toThrow()
  })

  test('resolves files through their API endpoint, including before a bridge attaches', () => {
    expect(resolveUrl('quint:/files/clips/video.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/video.mp4'
    )
    expect(resolveUrl('quint:/files/photo.png', { workspaceId: 'abc', base: '/prefix' })).toBe(
      '/api/workspaces/abc/files/photo.png'
    )
    expect(resolveUrl('quint:/files/photo.png', { apiBase: '__APPLET_API_BASE__' })).toBe(
      '__APPLET_API_BASE__/files/photo.png'
    )
  })

  test('encodes file names once and preserves file queries and media fragments', () => {
    expect(resolveUrl('quint:/files/clips/Grüße intro.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/Gr%C3%BC%C3%9Fe%20intro.mp4'
    )
    expect(resolveUrl('quint:/files/clips/100%25%3F%23%20intro.mp4', context)).toBe(
      '/api/workspaces/abc/files/clips/100%25%3F%23%20intro.mp4'
    )
    expect(resolveUrl('quint:/files/literal%252F.png', context)).toBe(
      '/api/workspaces/abc/files/literal%252F.png'
    )
    expect(resolveUrl('quint:/files/video.mp4?version=2#t=10,20', context)).toBe(
      '/api/workspaces/abc/files/video.mp4?version=2#t=10,20'
    )
  })

  test('rejects unsafe file paths before URL normalization can hide traversal', () => {
    for (const path of [
      'quint://files/photo.png',
      'quint:/files/',
      'quint:/files/clips//video.mp4',
      'quint:/files/clips/../video.mp4',
      'quint:/files/clips/./video.mp4',
      'quint:/files/clips/%2e%2e/video.mp4',
      'quint:/files/clips%2Fvideo.mp4',
      'quint:/files/clips%5Cvideo.mp4',
      'quint:/files/clips\\video.mp4',
      'quint:/files/clips/%00.mp4',
      'quint:/files/clips/100%.mp4',
      'quint:/files/clips/%C3.mp4'
    ])
      expect(() => resolveUrl(path, context)).toThrow()
  })
})
