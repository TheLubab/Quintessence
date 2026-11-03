import * as appletLog from './applet-log'
import { describe, expect, test, spyOn } from 'bun:test'
import { toast } from '@/frontend/components/ui/toast'
import type { AppletBridge } from '@/shared/types'

import {
  appletKey,
  invalidateApplet,
  invalidateAppletSegment,
  setCachedApplet
} from './applet-cache'
import {
  type AppletChatMessage,
  type AppletIdentity,
  appletRuntime,
  attachAppletBridge,
  disposeAppletBridge
} from './applet-runtime'

// The runtime is the trust boundary between agent-authored applet bundles and
// the host: every bridge call arrives with `unknown` args and must be narrowed
// before it's emitted to subscribers, and a disposed bridge (stale module
// after a rebuild) must never act again.

const QUINTLET: AppletIdentity = { kind: 'quintlet', name: 'board' }
const WIDGET: AppletIdentity = { kind: 'widget', name: 'clock' }

function subscribeNavigation(workspaceId: string) {
  const calls: string[] = []
  const unbind = appletRuntime(workspaceId).on('navigate', href => calls.push(href))
  return { calls, unbind }
}

function subscribeChat(workspaceId: string) {
  const calls: AppletChatMessage[] = []
  const unbind = appletRuntime(workspaceId).on('sendChatMessage', message => calls.push(message))
  return { calls, unbind }
}

describe('bridge validation', () => {
  test('emits URL navigation and rejects malformed addresses', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
    bridge.navigate('quint:/quintlets/orders?order=o-1')
    bridge.navigate('quint:/dashboard')
    bridge.navigate('quint:/files/clips/video.mp4#t=5')
    bridge.navigate(['invalid'])
    bridge.navigate('javascript:alert(1)')
    bridge.navigate('quint:/files/clips/%2Fvideo.mp4')
    expect(calls).toEqual([
      'quint:/quintlets/orders?order=o-1',
      'quint:/dashboard',
      'quint:/files/clips/video.mp4#t=5'
    ])
    expect(log).toHaveBeenCalledTimes(3)
    log.mockRestore()
  })

  test('resolves native anchor hrefs in the source workspace and disposes safely', () => {
    const { bridge, dispose } = appletRuntime('ws-1').connect(QUINTLET)
    expect(bridge.resolveUrl('quint:/quintlets/orders?order=o-1')).toBe(
      '/workspace/ws-1/quintlets/orders?order=o-1'
    )
    expect(bridge.resolveUrl('https://example.com/')).toBe('https://example.com/')
    expect(bridge.resolveUrl('quint:/files/clips/a%20b.mp4')).toBe(
      '/api/workspaces/ws-1/files/clips/a%20b.mp4'
    )
    expect(() => bridge.resolveUrl('javascript:alert(1)')).toThrow()
    dispose()
    expect(bridge.resolveUrl('quint:/dashboard')).toBe('')
  })

  test('resolves applet links with the host router base', () => {
    const { bridge } = appletRuntime('prefixed').connect(QUINTLET, '/prefix')
    expect(bridge.resolveUrl('quint:/quintlets/orders')).toBe(
      '/prefix/workspace/prefixed/quintlets/orders'
    )
    expect(bridge.resolveUrl('quint:/files/photo.png')).toBe(
      '/api/workspaces/prefixed/files/photo.png'
    )
  })

  test('drops calls with malformed addresses instead of emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)

    bridge.navigate('not-a-tab')
    bridge.navigate('quintlet:multi/segment')
    bridge.navigate(42)
    bridge.navigate({ toString: () => 'quint:/canvas' })

    expect(calls).toEqual([])
  })

  test('emitting with no subscribers (screen unmounted) is a no-op', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    expect(() => bridge.navigate('quint:/canvas')).not.toThrow()
  })

  test('an unbound subscriber stops receiving; others keep receiving', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const first = subscribeNavigation(ws)
    const second = subscribeNavigation(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)

    bridge.navigate('quint:/canvas')
    first.unbind()
    bridge.navigate('quint:/dashboard')

    expect(first.calls).toEqual(['quint:/canvas'])
    expect(second.calls).toEqual(['quint:/canvas', 'quint:/dashboard'])
  })
})

describe('sendChatMessage validation', () => {
  test('trims the message and stamps the applet identity and attachment source', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage({
      message: '  Chase order A-1042  ',
      applet: { kind: 'quintlet', id: 'forged' },
      attachments: [{ type: 'text', label: 'Order', text: 'A-1042', source: 'forged' }]
    })

    expect(calls).toEqual([
      {
        message: 'Chase order A-1042',
        applet: { kind: 'widget', id: 'clock' },
        attachments: [{ type: 'text', label: 'Order', text: 'A-1042', source: 'widget:clock' }]
      }
    ])
  })

  test('normalizes legacy calls through the same validation and rate limiter', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage('  Legacy  ', { order: '1042' })
    bridge.sendChatMessage({ message: 'Legacy', attachments: [] })
    bridge.sendChatMessage('Message only')
    bridge.sendChatMessage('Array context', [])
    bridge.sendChatMessage('x'.repeat(1001))
    bridge.sendChatMessage({ message: 'Object' }, { ignored: true })

    expect(calls).toEqual([
      {
        message: 'Legacy',
        applet: { kind: 'widget', id: 'clock' },
        attachments: [
          { type: 'text', label: 'Context', text: '{"order":"1042"}', source: 'widget:clock' }
        ]
      },
      { message: 'Message only', applet: { kind: 'widget', id: 'clock' }, attachments: [] },
      {
        message: 'Array context',
        applet: { kind: 'widget', id: 'clock' },
        attachments: [{ type: 'text', label: 'Context', text: '[]', source: 'widget:clock' }]
      },
      { message: 'Object', applet: { kind: 'widget', id: 'clock' }, attachments: [] }
    ])
  })

  test('drops a message that is empty, blank, or not a string', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const notices = spyOn(toast, 'add').mockImplementation(() => crypto.randomUUID())

    bridge.sendChatMessage({ message: '' })
    bridge.sendChatMessage({ message: '   ' })
    bridge.sendChatMessage({ message: 42 })
    bridge.sendChatMessage({ message: null })
    bridge.sendChatMessage(null)
    bridge.sendChatMessage('   ')
    bridge.sendChatMessage({ context: {} })
    bridge.sendChatMessage({ message: { toString: () => 'Do a thing' } })

    expect(calls).toEqual([])
    expect(notices).toHaveBeenCalledTimes(8)
    expect(notices).toHaveBeenLastCalledWith({
      title: 'Couldn’t send message',
      description: 'This message uses an unsupported format',
      type: 'error'
    })
    notices.mockRestore()
  })

  test('drops a message too long to be a chat bubble', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const notices = spyOn(toast, 'add').mockImplementation(() => crypto.randomUUID())

    bridge.sendChatMessage({ message: 'x'.repeat(1001) })

    expect(calls).toEqual([])
    expect(notices).toHaveBeenCalledWith({
      title: 'Couldn’t send message',
      description: 'Messages can be up to 1,000 characters',
      type: 'error'
    })
    notices.mockRestore()
  })

  test('legacy serialization failures reject the entire call', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const context of [cyclic, 1n, () => {}, { blob: 'x'.repeat(5000) }]) {
      bridge.sendChatMessage('Invalid legacy', context)
    }
    expect(calls).toEqual([])
    // Rejected arguments do not consume the message cooldown.
    bridge.sendChatMessage('Invalid legacy', 'x'.repeat(4998))
    expect(calls[0].attachments[0]).toMatchObject({
      label: 'Context',
      text: JSON.stringify('x'.repeat(4998))
    })
  })

  test('rejects the removed object context field with a clear error', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const log = spyOn(appletLog, 'reportAppletError').mockImplementation(() => {})
    try {
      bridge.sendChatMessage({ message: 'Review', context: undefined })
      expect(calls).toEqual([])
      expect(log.mock.calls[0][1].message).toContain('This message uses an outdated format')
    } finally {
      log.mockRestore()
    }
  })

  test('validates all attachments before emitting and snapshots all input fields', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(QUINTLET)
    const file = new File(['hello'], 'hello.txt')
    const text = { type: 'text', label: 'Order', text: '  snapshot  ' }
    const path = { type: 'file', path: 'reports/order.pdf' }
    const attachments = [text, { type: 'file', file }, path]
    for (const invalid of [
      null,
      {},
      { type: 'text', label: '', text: 'x' },
      { type: 'text', label: 'x'.repeat(121), text: 'x' },
      { type: 'text', label: 'x', text: 'x'.repeat(5001) },
      { type: 'file', path: '../secret' },
      { type: 'file', path: 'x', file },
      { type: 'file', file: new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'big') }
    ]) {
      bridge.sendChatMessage({ message: 'Review', attachments: [...attachments, invalid] })
    }
    bridge.sendChatMessage({ message: 'Review', attachments: {} })
    expect(calls).toEqual([])
    bridge.sendChatMessage({ message: 'Review', attachments })
    text.text = 'changed'
    path.path = 'changed.txt'
    attachments.length = 0
    expect(calls[0].attachments).toEqual([
      { type: 'text', label: 'Order', text: '  snapshot  ', source: 'quintlet:board' },
      { type: 'file', file, source: 'quintlet:board' },
      { type: 'file', path: 'reports/order.pdf', source: 'quintlet:board' }
    ])
  })

  test('an applet cannot send through a disposed bridge', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge, dispose } = appletRuntime(ws).connect(QUINTLET)

    bridge.sendChatMessage({ message: 'before' })
    dispose()
    bridge.sendChatMessage({ message: 'after' })

    expect(calls.map(c => c.message)).toEqual(['before'])
  })
})

describe('sendChatMessage rate limiting', () => {
  // Every send starts an agent run, so the runtime — not the applet — is
  // responsible for what a render loop or a double-mounted bundle can spend.
  test('collapses an identical message repeated inside the cooldown', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    bridge.sendChatMessage({ message: 'Sync now' })
    bridge.sendChatMessage({ message: 'Sync now' })
    bridge.sendChatMessage({ message: 'Sync now' })

    expect(calls.map(c => c.message)).toEqual(['Sync now'])
  })

  test('the cooldown is per applet and message, not a global mute', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const widget = appletRuntime(ws).connect(WIDGET)
    const quintlet = appletRuntime(ws).connect(QUINTLET)

    widget.bridge.sendChatMessage({ message: 'Sync now' })
    // Same text, different applet — a real second message.
    quintlet.bridge.sendChatMessage({ message: 'Sync now' })
    widget.bridge.sendChatMessage({ message: 'Something else' })

    expect(calls.map(c => [c.applet, c.message])).toEqual([
      [{ kind: 'widget', id: 'clock' }, 'Sync now'],
      [{ kind: 'quintlet', id: 'board' }, 'Sync now'],
      [{ kind: 'widget', id: 'clock' }, 'Something else']
    ])
  })

  test('caps a loop that varies its message every call', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeChat(ws)
    const { bridge } = appletRuntime(ws).connect(WIDGET)

    for (let i = 0; i < 25; i++) bridge.sendChatMessage({ message: `message ${i}` })

    expect(calls).toHaveLength(10)
  })

  test('the cap is per workspace, so one runaway applet cannot mute another workspace', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeChat(wsA)
    const b = subscribeChat(wsB)

    for (let i = 0; i < 25; i++) {
      appletRuntime(wsA)
        .connect(WIDGET)
        .bridge.sendChatMessage({ message: `a ${i}` })
    }
    appletRuntime(wsB).connect(WIDGET).bridge.sendChatMessage({ message: 'b 0' })

    expect(a.calls).toHaveLength(10)
    expect(b.calls.map(c => c.message)).toEqual(['b 0'])
  })
})

describe('disposal', () => {
  test('a disposed connection is inert even while subscribers are live', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const { bridge, dispose } = appletRuntime(ws).connect(QUINTLET)
    bridge.navigate('quint:/canvas')
    dispose()
    bridge.navigate('quint:/canvas')
    expect(calls).toEqual(['quint:/canvas'])
  })
})

// A stand-in for a loaded bundle's module namespace: the entry re-exports
// `__attachBridge` (see backend/applet-engine/build-applet.ts).
function fakeModule() {
  let bridge: AppletBridge | null = null
  return {
    __attachBridge: (next: AppletBridge) => {
      bridge = next
    },
    navigate: (href: unknown) => bridge?.navigate(href)
  }
}

describe('attachAppletBridge', () => {
  test('wires a module to its workspace runtime; invalidateApplet neuters it', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const mod = fakeModule()
    attachAppletBridge(mod, ws, appletKey('quintlets', ws, 'board'), QUINTLET)
    mod.navigate('quint:/quintlets/board')
    expect(calls).toEqual(['quint:/quintlets/board'])

    // The rebuild path: invalidation must leave the OLD module instance inert.
    invalidateApplet('quintlets', ws, 'board')
    mod.navigate('quint:/quintlets/board')
    expect(calls).toEqual(['quint:/quintlets/board'])
  })

  test('invalidateAppletSegment disposes bridges kind-wide', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)

    const mod = fakeModule()
    const key = appletKey('widgets', ws, 'clock')
    // The load path caches the module before attaching (useApplet), and the
    // segment sweep walks cached keys — mirror that order here.
    setCachedApplet(key, Promise.resolve(mod))
    attachAppletBridge(mod, ws, key, WIDGET)
    invalidateAppletSegment('widgets')
    mod.navigate('quint:/dashboard')
    expect(calls).toEqual([])
  })

  test('no-ops on a bundle without the bridge exports (built before this change)', () => {
    const ws = `ws-${crypto.randomUUID()}`
    expect(() =>
      attachAppletBridge({ default: () => null }, ws, 'quintlets/x/y', QUINTLET)
    ).not.toThrow()
    expect(() => disposeAppletBridge('quintlets/x/y')).not.toThrow()
  })

  test('re-attaching under a key disposes the previous connection', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const { calls } = subscribeNavigation(ws)
    const key = appletKey('quintlets', ws, 'board')

    const oldMod = fakeModule()
    attachAppletBridge(oldMod, ws, key, QUINTLET)
    const newMod = fakeModule()
    attachAppletBridge(newMod, ws, key, QUINTLET)

    oldMod.navigate('quint:/canvas')
    newMod.navigate('quint:/dashboard')
    expect(calls).toEqual(['quint:/dashboard'])
  })
})

describe('workspace isolation', () => {
  test('bridges reach only their own workspace runtime', () => {
    const wsA = `ws-${crypto.randomUUID()}`
    const wsB = `ws-${crypto.randomUUID()}`
    const a = subscribeNavigation(wsA)
    const b = subscribeNavigation(wsB)

    appletRuntime(wsA).connect(QUINTLET).bridge.navigate('quint:/canvas')
    expect(a.calls).toEqual(['quint:/canvas'])
    expect(b.calls).toEqual([])
  })
})

describe('addChatAttachment', () => {
  test('accepts text and both file sources, stamps source, and ignores disposed bridges', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const received: unknown[] = []
    const runtime = appletRuntime(ws)
    const off = runtime.on('addChatAttachment', value => received.push(value))
    const { bridge, dispose } = runtime.connect(QUINTLET)
    const file = new File(['hello'], 'notes.txt')
    bridge.addChatAttachment({
      type: 'text',
      label: ' Notes ',
      text: '  hello\n',
      source: 'forged'
    })
    bridge.addChatAttachment({ type: 'file', file })
    const pathInput = { type: 'file', path: 'reports/september.pdf' }
    bridge.addChatAttachment(pathInput)
    pathInput.path = 'changed.pdf'
    dispose()
    bridge.addChatAttachment({ type: 'file', file })
    expect(received).toEqual([
      { type: 'text', label: 'Notes', text: '  hello\n', source: 'quintlet:board' },
      { type: 'file', file, source: 'quintlet:board' },
      { type: 'file', path: 'reports/september.pdf', source: 'quintlet:board' }
    ])
    off()
  })

  test('rejects invalid attachments with a toast and without emitting', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const received: unknown[] = []
    const runtime = appletRuntime(ws)
    const off = runtime.on('addChatAttachment', value => received.push(value))
    const { bridge } = runtime.connect(QUINTLET)
    const notices = spyOn(toast, 'add').mockImplementation(() => crypto.randomUUID())
    const file = new File(['hello'], 'notes.txt')
    const oversized = new File([new Uint8Array(32 * 1024 * 1024 + 1)], 'large.bin')
    for (const input of [
      null,
      {},
      { type: 'text', label: '', text: 'hello' },
      { type: 'text', label: 'x'.repeat(121), text: 'hello' },
      { type: 'text', label: 'Notes', text: ' ' },
      { type: 'text', label: 'Notes', text: 'x'.repeat(5001) },
      { type: 'file' },
      { type: 'file', file: {} },
      { type: 'file', file: new Blob(['x']) },
      { type: 'file', file, path: 'notes.txt' },
      { type: 'file', file: oversized },
      ...['', '/etc/passwd', '../outside.txt', '.env', 'a/.hidden/b', 'C:\\file.txt'].map(path => ({
        type: 'file',
        path
      }))
    ])
      bridge.addChatAttachment(input)
    expect(received).toEqual([])
    expect(notices).toHaveBeenCalledTimes(17)
    expect(new Set(notices.mock.calls.map(([notice]) => notice.description))).toEqual(
      new Set([
        'This attachment isn’t supported',
        'Add a label to this text attachment',
        'Attachment labels can be up to 120 characters',
        'Add some text to this attachment',
        'Text attachments can be up to 5,000 characters',
        'Files can be up to 32 MB',
        'Choose a file from this workspace'
      ])
    )
    notices.mockRestore()
    off()
  })

  test('does not cooldown repeated attachment intents', () => {
    const ws = `ws-${crypto.randomUUID()}`
    const received: unknown[] = []
    const runtime = appletRuntime(ws)
    const off = runtime.on('addChatAttachment', value => received.push(value))
    const { bridge } = runtime.connect(QUINTLET)
    const text = { type: 'text', label: 'Order', text: 'Order #1042' }
    const file = () => new File(['hello'], 'notes.txt', { type: 'text/plain', lastModified: 1_000 })

    bridge.addChatAttachment(text)
    bridge.addChatAttachment(structuredClone(text))
    bridge.addChatAttachment({ type: 'file', file: file() })
    bridge.addChatAttachment({ type: 'file', file: file() })
    bridge.addChatAttachment({ type: 'file', path: 'reports/september.pdf' })
    bridge.addChatAttachment({ type: 'file', path: 'reports/september.pdf' })

    expect(received).toHaveLength(6)
    off()
  })
})
