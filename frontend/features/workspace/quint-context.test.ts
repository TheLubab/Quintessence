import { describe, expect, test } from 'bun:test'

import {
  activeTabTitle,
  drainChatDirectives,
  envelopeTabParams,
  pushChatDirective,
  takeChatDirectives
} from './quint-context'
import type { QuintletInfo } from '@/shared/types'

describe('quint context assembly', () => {
  test('directives queue per workspace and drain once, in order', () => {
    pushChatDirective('ws-1', 'First.')
    pushChatDirective('ws-1', 'Second.')
    pushChatDirective('ws-2', 'Other workspace.')
    expect(drainChatDirectives('ws-1')).toEqual(['First.', 'Second.'])
    expect(drainChatDirectives('ws-1')).toEqual([])
    expect(drainChatDirectives('ws-2')).toEqual(['Other workspace.'])
  })

  test('appends directives tied to the current message after queued directives', () => {
    pushChatDirective('ws-3', 'Queued first.')

    expect(takeChatDirectives('ws-3', ['Inline second.', 'Inline third.'])).toEqual([
      'Queued first.',
      'Inline second.',
      'Inline third.'
    ])
    expect(takeChatDirectives('ws-3')).toEqual([])
  })

  test('activeTabTitle resolves compiled and provisional quintlet titles', () => {
    const quintlets: QuintletInfo[] = [
      { id: 'color-studio', status: 'compiled', title: 'Grading review' },
      {
        id: 'b-42',
        status: 'submitted',
        title: 'Customer dashboard',
        requirements: '',
        buildSessionId: 's-1'
      },
      {
        id: 'b-draft',
        status: 'draft',
        requirements: ''
      }
    ]
    expect(activeTabTitle('quintlets/color-studio', quintlets)).toBe('Grading review')
    expect(activeTabTitle('quintlets/b-42', quintlets)).toBe('Customer dashboard')
    expect(activeTabTitle('quintlets/b-draft', quintlets)).toBeUndefined()
    expect(activeTabTitle('quintlets/missing', quintlets)).toBeUndefined()
    expect(activeTabTitle('canvas', quintlets)).toBeUndefined()
    expect(activeTabTitle('quintlets/color-studio', undefined)).toBeUndefined()
  })
})

describe('envelopeTabParams', () => {
  const params = { order: 'A-1042' }

  test('a quintlet reports what it is rendering with', () => {
    expect(envelopeTabParams('quintlets/orders', params)).toEqual(params)
  })

  test('a quintlet with nothing addressable reports nothing', () => {
    expect(envelopeTabParams('quintlets/orders', {})).toBeUndefined()
  })

  test('tabs without addressable state report nothing, params or not', () => {
    // Widgets are not navigation targets, and the static tabs take no params —
    // so a stray record here means nothing and must not reach the envelope.
    expect(envelopeTabParams('dashboard', params)).toBeUndefined()
    expect(envelopeTabParams('canvas', params)).toBeUndefined()
  })
})
