import { describe, expect, test } from 'bun:test'

import type { QuintletInfo, WorkspaceTabsState } from '@/shared/types'
import { normalizeWorkspaceTabs } from '@/shared/workspace-layout'

import { effectiveOpenTabs, resolveActiveTab, tabAvailable } from './tab-resolution'

const quintlets: QuintletInfo[] = [
  { id: 'orders', status: 'compiled', title: 'Orders' },
  {
    id: 'draft',
    status: 'draft',
    requirements: ''
  }
]

const tabs = (open: WorkspaceTabsState['open'], active: WorkspaceTabsState['active']) => ({
  open,
  active
})

describe('normalizeWorkspaceTabs', () => {
  test('falls back to defaults on missing/empty state', () => {
    expect(normalizeWorkspaceTabs(undefined)).toEqual({
      open: ['dashboard', 'canvas'],
      active: 'dashboard'
    })
    expect(normalizeWorkspaceTabs(tabs([], 'canvas'))).toEqual({
      open: ['dashboard', 'canvas'],
      active: 'dashboard'
    })
  })

  test('pins Dashboard first, dedupes open, and preserves a valid active tab', () => {
    expect(normalizeWorkspaceTabs(tabs(['canvas', 'dashboard', 'canvas'], 'canvas'))).toEqual({
      open: ['dashboard', 'canvas'],
      active: 'canvas'
    })
  })
})

describe('tabAvailable', () => {
  test('static tabs always exist', () => {
    expect(tabAvailable('dashboard', [])).toBe(true)
    expect(tabAvailable('canvas', [])).toBe(true)
  })

  test('quintlet tabs track the unified quintlet list', () => {
    expect(tabAvailable('quintlets/orders', quintlets)).toBe(true)
    expect(tabAvailable('quintlets/draft', quintlets)).toBe(true)
    expect(tabAvailable('quintlets/gone', quintlets)).toBe(false)
  })
})

describe('effectiveOpenTabs', () => {
  test('filters unavailable tabs and keeps order', () => {
    expect(
      effectiveOpenTabs(tabs(['quintlets/gone', 'canvas', 'quintlets/orders'], 'canvas'), quintlets)
    ).toEqual(['canvas', 'quintlets/orders'])
  })

  test('falls back to the default open set when nothing survives', () => {
    expect(effectiveOpenTabs(tabs(['quintlets/gone'], 'quintlets/gone'), [])).toEqual([
      'dashboard',
      'canvas'
    ])
  })
})

describe('resolveActiveTab', () => {
  const state = tabs(['dashboard', 'canvas', 'quintlets/orders'], 'dashboard')

  test('a bare URL resolves to the saved default', () => {
    expect(resolveActiveTab(undefined, state, quintlets)).toBe('dashboard')
  })

  test('a valid URL tab wins, even when not in the open set', () => {
    expect(resolveActiveTab('quintlets/orders', state, quintlets)).toBe('quintlets/orders')
    expect(resolveActiveTab('canvas', state, quintlets)).toBe('canvas')
  })

  test('an unavailable explicit destination stays selected for recovery', () => {
    expect(resolveActiveTab('quintlets/gone', state, quintlets)).toBe('quintlets/gone')
  })

  test('an unavailable saved default falls back to the first surviving tab', () => {
    const stale = tabs(['quintlets/gone', 'quintlets/orders'], 'quintlets/gone')
    expect(resolveActiveTab(undefined, stale, quintlets)).toBe('quintlets/orders')
  })

  test('when nothing survives, the default open set answers', () => {
    const dead = tabs(['quintlets/gone'], 'quintlets/gone')
    expect(resolveActiveTab(undefined, dead, [])).toBe('dashboard')
  })
})
