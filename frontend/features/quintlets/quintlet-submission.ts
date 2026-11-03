import type { QueryClient } from '@tanstack/react-query'
import { requestJson } from '@/frontend/api/http'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { moveChatDraft } from '@/frontend/features/chat/chat-send'
import { liveStore } from '@/frontend/features/chat/chat-store'
import {
  getCachedWorkspaceState,
  receiveWorkspaceState
} from '@/frontend/features/workspace/workspace-state'
import { useUiStore } from '@/frontend/store/ui'
import { composerDraftKey, draftSessionId } from '@/shared/session-drafts'
import { quintletTabId } from '@/shared/workspace-tabs'
import type { SessionSummary, WorkspaceState } from '@/shared/types'

// A failed HTTP response does not prove startup failed. Refresh the server's
// state before restoring the fresh composer; never replay the request.
export async function recoverQuintletSubmission(
  queryClient: QueryClient,
  workspaceId: string,
  quintletId: string,
  sessionId: string,
  text: string,
  pinned: boolean
) {
  const tabId = quintletTabId(quintletId)
  let target =
    getCachedWorkspaceState(queryClient, workspaceId)?.pendingQuintlets[quintletId]?.buildSessionId ??
    sessionId
  try {
    const state = await requestJson<WorkspaceState>(`/api/workspaces/${workspaceId}/state`)
    const quintlet = state.pendingQuintlets[quintletId]
    if (!pinned && quintlet?.status === 'draft') {
      target = draftSessionId(tabId)
      queryClient.setQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId), sessions =>
        sessions?.filter(session => session.sessionId !== sessionId)
      )
      queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
    } else {
      target =
        quintlet?.buildSessionId ??
        (pinned ? state.pinnedSessionId : state.selected[tabId]) ??
        sessionId
    }
    moveChatDraft(workspaceId, sessionId, target)
    if (quintlet?.status === 'draft' || quintlet?.status === 'failed')
      liveStore.getState().setActivity(workspaceId, target, 'idle')
    receiveWorkspaceState(queryClient, workspaceId, state)
  } catch {
    moveChatDraft(workspaceId, sessionId, target)
    // Offline: retain the draft at its current identity until state can refresh.
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.state(workspaceId) })
  }
  const draftKey = composerDraftKey(workspaceId, target)
  const ui = useUiStore.getState()
  ui.setComposerDraft(draftKey, ui.composerDrafts[draftKey] ?? text)
}
