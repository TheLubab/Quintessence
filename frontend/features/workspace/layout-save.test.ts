import { describe, expect, test } from 'bun:test'

import type { WorkspaceTabsState, WorkspaceTheme } from '@/shared/types'
import { createDefaultWorkspaceLayout } from '@/shared/workspace-layout'
import { mergeLayoutForSave } from '@/backend/workspaces/layout'

import { accumulateLayoutSave } from './layout-save'

const initial = createDefaultWorkspaceLayout()
const selected: WorkspaceTabsState = {
  open: ['dashboard', 'quintlets/board'],
  active: 'quintlets/board'
}

describe('debounced layout saves', () => {
  test('grid and theme edits omit cached tabs, preserving newer server navigation', () => {
    const update = { widgetGrid: [{ i: 'board', x: 1, y: 2 }] }
    const pending = accumulateLayoutSave({ ...initial, ...update }, update, null)
    const theme: WorkspaceTheme = {
      font: 'sans',
      color: 'rose',
      radius: 'square'
    }
    const payload = accumulateLayoutSave({ ...initial, ...update, theme }, { theme }, pending)

    expect('tabs' in payload).toBe(false)
    const saved = mergeLayoutForSave({ ...initial, tabs: selected }, payload)
    expect(saved.tabs).toEqual(selected)
    expect(saved.widgetGrid).toEqual(update.widgetGrid)
    expect(saved.theme).toEqual(theme)
  })

  test('navigation followed by a grid edit keeps both changes in the same save', () => {
    const navigated = { ...initial, tabs: selected }
    const pending = accumulateLayoutSave(navigated, { tabs: selected }, null)
    const update = { widgetGrid: [{ i: 'board', x: 2, y: 3 }] }
    const payload = accumulateLayoutSave({ ...navigated, ...update }, update, pending)

    expect(mergeLayoutForSave(initial, payload)).toEqual({ ...navigated, ...update })
  })

  test('a refetch between navigation and another edit cannot erase pending navigation', () => {
    const pending = accumulateLayoutSave({ ...initial, tabs: selected }, { tabs: selected }, null)
    // The layout query refetched the old server state before the debounce fired.
    const update = { selectedModel: 'muse-spark-1.3' as const }
    const payload = accumulateLayoutSave({ ...initial, ...update }, update, pending)

    expect(payload.tabs).toEqual(selected)
    expect(payload.selectedModel).toBe('muse-spark-1.3')
  })

  test('the latest explicit navigation replaces the previous pending tab selection', () => {
    const pending = accumulateLayoutSave({ ...initial, tabs: selected }, { tabs: selected }, null)
    const tabs: WorkspaceTabsState = { open: ['dashboard', 'canvas'], active: 'canvas' }
    const payload = accumulateLayoutSave({ ...initial, tabs }, { tabs }, pending)

    expect(payload.tabs).toEqual(tabs)
    expect(pending.tabs).toEqual(selected)
  })

  test('a new debounce window does not resend previously saved tabs', () => {
    const saved = { ...initial, tabs: selected }
    const update = { selectedModel: 'muse-spark-1.3' as const }
    const payload = accumulateLayoutSave({ ...saved, ...update }, update, null)

    expect('tabs' in payload).toBe(false)
    expect(payload.selectedModel).toBe('muse-spark-1.3')
  })
})
