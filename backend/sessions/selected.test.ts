import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  readWorkspaceState,
  setWorkspaceStateRoot
} from '../workspace-storage'
import type { WorkspaceTabId } from '@/shared/types'
import { renameSessionReferences } from './lifecycle'
import {
  clearSelectedSession,
  deselectSession,
  forgetSessionRenames,
  getPinnedSession,
  pinSession,
  saveSelectedSession,
  unpinSession
} from './selected'
import { updateSessionEntry } from './store'

let scratchDir = ''
const ws = { id: 'ws-1', path: '/workspace' }
const selected = async (target = ws, tabId: WorkspaceTabId = 'dashboard') =>
  (await readWorkspaceState(target)).selected[tabId]

beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'quint-selected-session-'))
  setWorkspaceStateRoot(scratchDir)
  forgetSessionRenames()
})

afterEach(async () => {
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(scratchDir, { recursive: true, force: true })
})

describe('selected session persistence', () => {
  test('tab selection and workspace pin are independent', async () => {
    await saveSelectedSession(ws, 'general')
    await saveSelectedSession(ws, 'words', 'quintlets/words')
    await saveSelectedSession(ws, 'sketch', 'canvas')
    expect(await selected(ws, 'quintlets/genders')).toBeUndefined()
    await pinSession(ws, 'words')
    expect(await getPinnedSession(ws)).toBe('words')
    expect(await selected(ws, 'canvas')).toBe('sketch')
    await unpinSession(ws, 'words')
    expect(await getPinnedSession(ws)).toBeUndefined()
    expect(await selected(ws, 'quintlets/words')).toBe('words')
    expect(await selected(ws)).toBe('general')
  })

  test('unpinning another chat leaves the pin alone', async () => {
    await pinSession(ws, 'pinned')
    await unpinSession(ws, 'other')
    expect(await getPinnedSession(ws)).toBe('pinned')
  })

  test('archiving clears both tab selection and the workspace pin', async () => {
    await saveSelectedSession(ws, 'build', 'quintlets/words')
    await pinSession(ws, 'build')
    await clearSelectedSession(ws, 'build')
    expect(await selected(ws, 'quintlets/words')).toBeUndefined()
    expect(await getPinnedSession(ws)).toBeUndefined()
  })

  test('deselecting clears the tab only while it still shows that chat', async () => {
    await saveSelectedSession(ws, 'session-1')
    await deselectSession(ws, 'other', 'dashboard')
    expect(await selected(ws)).toBe('session-1')
    await deselectSession(ws, 'session-1', 'dashboard')
    expect(await selected(ws)).toBeUndefined()
  })

  test('writes to different workspaces keep both values', async () => {
    const first = { id: 'first', path: '/first' }
    const second = { id: 'second', path: '/second' }
    await Promise.all([
      saveSelectedSession(first, 'session-1'),
      saveSelectedSession(second, 'session-2')
    ])

    expect(await selected(first)).toBe('session-1')
    expect(await selected(second)).toBe('session-2')
  })

  test('rapid selections finish on the latest session', async () => {
    await saveSelectedSession(ws, 'session-1')

    await Promise.all([
      saveSelectedSession(ws, 'session-2', 'dashboard', 'session-1'),
      saveSelectedSession(ws, 'session-3', 'dashboard', 'session-2')
    ])

    expect(await selected(ws)).toBe('session-3')
  })

  test('ifMatch null applies only to a tab that shows no chat', async () => {
    expect(await saveSelectedSession(ws, 'first', 'dashboard', null)).toBe(true)
    expect(await saveSelectedSession(ws, 'second', 'dashboard', null)).toBe(false)
    expect(await selected(ws)).toBe('first')
  })

  test('renames a selected temporary session and rejects a late stale save', async () => {
    await saveSelectedSession(ws, 'temporary', 'dashboard', null)
    await renameSessionReferences(ws, 'temporary', 'real')
    expect(await selected(ws)).toBe('real')

    expect(await saveSelectedSession(ws, 'temporary', 'dashboard', null)).toBe(false)
    expect(await selected(ws)).toBe('real')
  })

  test('resolves a temporary selection saved after its session was renamed', async () => {
    await renameSessionReferences(ws, 'temporary', 'real')

    expect(await saveSelectedSession(ws, 'temporary', 'dashboard', null)).toBe(true)
    expect(await selected(ws)).toBe('real')
  })

  test('a rename moves the entry, every tab and the pin in one write', async () => {
    await updateSessionEntry(ws, 'temporary', { tabId: 'quintlets/words' })
    await saveSelectedSession(ws, 'temporary', 'quintlets/words')
    await saveSelectedSession(ws, 'temporary')
    await pinSession(ws, 'temporary')
    await renameSessionReferences(ws, 'temporary', 'real')

    const state = await readWorkspaceState(ws)
    expect(state.selected).toEqual({ dashboard: 'real', 'quintlets/words': 'real' })
    expect(state.pinnedSessionId).toBe('real')
    expect(state.sessions).toEqual({ real: { tabId: 'quintlets/words' } })
  })

  test('clears only the matching selected session', async () => {
    await saveSelectedSession(ws, 'selected')
    await clearSelectedSession(ws, 'other')
    expect(await selected(ws)).toBe('selected')
    await clearSelectedSession(ws, 'selected')
    expect(await selected(ws)).toBeUndefined()
  })
})
