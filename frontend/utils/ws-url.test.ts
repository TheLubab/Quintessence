import { afterEach, describe, expect, test } from 'bun:test'

import { wsUrl } from '@/frontend/utils/ws-url'

const realLocation = globalThis.location

function stubLocation(loc: { protocol: string; host: string }) {
  Object.defineProperty(globalThis, 'location', {
    value: loc,
    configurable: true,
    writable: true
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'location', {
    value: realLocation,
    configurable: true,
    writable: true
  })
})

describe('wsUrl', () => {
  test('uses ws:// over http', () => {
    stubLocation({ protocol: 'http:', host: 'localhost:12345' })
    expect(wsUrl('/ws')).toBe('ws://localhost:12345/ws')
  })

  test('uses wss:// over https (behind a TLS proxy)', () => {
    stubLocation({ protocol: 'https:', host: 'quint.example.com' })
    expect(wsUrl('/api/workspaces/ws')).toBe('wss://quint.example.com/api/workspaces/ws')
  })
})
