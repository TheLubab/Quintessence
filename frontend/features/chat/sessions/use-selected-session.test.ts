import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { workspaceKeys } from '@/frontend/api/workspace-keys'
import {
  renameSelectedSessionInCache,
  selectedSessionForTab,
  setSelectedSessionInCache
} from '@/frontend/features/chat/sessions/use-selected-session'
import type { WorkspaceState } from '@/shared/types'

const WORKSPACE_ID = 'workspace-1'

function workspaceState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { revision: 1, selected: {}, sessions: {}, pendingQuintlets: {}, ...patch }
}

function cachedState(queryClient: QueryClient): WorkspaceState | undefined {
  return queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(WORKSPACE_ID))
}

describe('selected session', () => {
  test('a CLI-created quintlet chat is selected unless pinned', () => {
    const tabId = 'quintlets/new-quintlet' as const
    const state = workspaceState({ selected: { [tabId]: 'cli-child' } })
    expect(selectedSessionForTab(state, tabId)).toBe('cli-child')
    expect(selectedSessionForTab({ ...state, pinnedSessionId: 'pinned-chat' }, tabId)).toBe(
      'pinned-chat'
    )
  })

  test('is unknown until the workspace state loads', () => {
    expect(selectedSessionForTab(undefined, 'dashboard')).toBeUndefined()
    expect(selectedSessionForTab(workspaceState(), 'dashboard')).toBeNull()
  })

  test('showing a chat in one tab keeps other tabs and the workspace pin', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      workspaceKeys.state(WORKSPACE_ID),
      workspaceState({ selected: { dashboard: 'old' }, pinnedSessionId: 'pin' })
    )
    setSelectedSessionInCache(queryClient, WORKSPACE_ID, 'next', 'dashboard')
    setSelectedSessionInCache(queryClient, WORKSPACE_ID, 'notes', 'canvas')
    expect(cachedState(queryClient)).toMatchObject({
      selected: { dashboard: 'next', canvas: 'notes' },
      pinnedSessionId: 'pin'
    })
  })

  test('a renamed chat keeps its tabs, pin, settings, fork children, and build', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      workspaceKeys.state(WORKSPACE_ID),
      workspaceState({
        pinnedSessionId: 'temp',
        selected: { dashboard: 'temp', 'quintlets/board': 'temp' },
        sessions: {
          temp: { tabId: 'quintlets/board', config: { model: 'muse-spark-1.3' } },
          child: { fork: { fromSessionId: 'temp' } }
        },
        pendingQuintlets: {
          board: { status: 'starting', requirements: '', buildSessionId: 'temp' }
        }
      })
    )

    renameSelectedSessionInCache(queryClient, WORKSPACE_ID, 'temp', 'real')

    expect(cachedState(queryClient)).toEqual(
      workspaceState({
        pinnedSessionId: 'real',
        selected: { dashboard: 'real', 'quintlets/board': 'real' },
        sessions: {
          real: { tabId: 'quintlets/board', config: { model: 'muse-spark-1.3' } },
          child: { fork: { fromSessionId: 'real' } }
        },
        pendingQuintlets: {
          board: { status: 'starting', requirements: '', buildSessionId: 'real' }
        }
      })
    )
  })
})
