import { afterEach, expect, test } from 'bun:test'
import type * as QuintApi from 'quint'
import type * as QuintRuntime from '../applet-engine/runtime/quint'

import { APPLET_API_BASE_SENTINEL } from '../applet-engine/api-base'
import { __attachBridge, resolveUrl } from '../applet-engine/runtime/quint'
import { resolveUrl as resolveWorkspaceUrl } from '@/shared/navigation'

// Evaluated as the module loads, before the host has attached any bridge.
const videoUrl = resolveUrl('quint:/files/clips/a%20b.mp4#t=5')

afterEach(() => __attachBridge({}))

// Check runtime signatures against the public contract without evaluating React.
const declarationsMatch: typeof QuintRuntime extends typeof QuintApi ? true : false = true

test('quint runtime implements its public declarations', () => {
  expect(declarationsMatch).toBe(true)
})

test('file URLs resolve at module load and retain their source workspace after bridge attachment', () => {
  expect(videoUrl).toBe(`${APPLET_API_BASE_SENTINEL}/files/clips/a%20b.mp4#t=5`)
  __attachBridge({ resolveUrl: () => '/workspace/other/dashboard' })
  expect(resolveUrl('quint:/files/photo.png')).toBe(`${APPLET_API_BASE_SENTINEL}/files/photo.png`)
  expect(resolveUrl('quint:/quintlets/orders')).toBe('/workspace/other/dashboard')
})

test('quint.resolveUrl uses the shared resolver for workspace links through its host bridge', () => {
  __attachBridge({
    resolveUrl: url => resolveWorkspaceUrl(url, { workspaceId: 'abc', base: '/prefix' })
  })
  expect(resolveUrl('quint:/chat')).toBe('/prefix/workspace/abc/chat')
  expect(resolveUrl('quint:/chats/provider%3Aid')).toBe('/prefix/workspace/abc/chats/provider%3Aid')
  expect(resolveUrl('quint:/quintlets/%65vents?b=2&a=1')).toBe(
    '/prefix/workspace/abc/quintlets/events?a=1&b=2'
  )
  expect(() => resolveUrl('quint:/quintlet:events')).toThrow()
  expect(() => resolveUrl('quint:/files/../private.txt')).toThrow()
})
