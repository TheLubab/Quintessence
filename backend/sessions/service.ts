import type { ApprovalResponse, WorkspaceEntry, WorkspaceTabId } from '@/shared/types'
import type { Harness } from '../agents/types'
import { harnessFor } from '../agents/registry'
import { updateWorkspaceState } from '../workspace-storage'
import { archiveWorkspaceSession } from './archive'
import { saveSessionConfig, type SessionConfigPatch } from './config'
import { renameSessionReferences } from './lifecycle'
import { prepareWorkspaceMessage, type WorkspaceMessageInput } from './message-preparation'
import { patchPendingQuintlet } from './pending-quintlets'
import {
  deselectSession,
  pinSession,
  unpinSession,
  resolveRenamedSession,
  selectSessionForTab
} from './selected'

const canonicalId = (ws: WorkspaceEntry, id: string) => resolveRenamedSession(ws.id, id)

// Application entry point. Native execution state and transcripts stay in Muse;
// workspace-state transactions own application metadata and selections.
export const sessionService = {
  async send(ws: WorkspaceEntry, input: WorkspaceMessageInput) {
    const { message, pending } = await prepareWorkspaceMessage(ws, input)
    try {
      await harnessFor(ws).sendMessage(message, { renamed: renameSessionReferences })
    } catch (error) {
      if (pending)
        await patchPendingQuintlet(ws, pending.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Couldn’t start quintlet chat'
        })
      throw error
    }
    if (pending && pending.status !== 'starting')
      await patchPendingQuintlet(ws, pending.id, { status: 'submitted', error: undefined })
  },
  isRunning(ws: WorkspaceEntry, id: string) {
    id = canonicalId(ws, id)
    return harnessFor(ws)
      .activeSessions()
      .some(s => s.workspaceId === ws.id && s.sessionId === id && s.activity === 'running')
  },
  list(ws: WorkspaceEntry) {
    return harnessFor(ws).listSessions(ws)
  },
  history(ws: WorkspaceEntry, id: string) {
    return harnessFor(ws).sessionEvents(ws, canonicalId(ws, id))
  },
  state(ws: WorkspaceEntry, id: string) {
    return harnessFor(ws).sessionState?.(ws, canonicalId(ws, id)) ?? Promise.resolve(null)
  },
  stop(ws: WorkspaceEntry, id: string) {
    return harnessFor(ws).interrupt(ws.id, canonicalId(ws, id))
  },
  async approve(ws: WorkspaceEntry, input: ApprovalResponse) {
    const respond = harnessFor(ws).respondToApproval
    if (!respond) throw new Error('Approvals are not supported')
    await respond({ ...input, workspaceId: ws.id, sessionId: canonicalId(ws, input.sessionId) })
  },
  async answer(
    ws: WorkspaceEntry,
    input: Parameters<NonNullable<Harness['respondToQuestion']>>[0]
  ) {
    const respond = harnessFor(ws).respondToQuestion
    if (!respond) throw new Error('Questions are not supported')
    await respond({ ...input, workspaceId: ws.id, sessionId: canonicalId(ws, input.sessionId) })
  },
  configure(ws: WorkspaceEntry, id: string, patch: SessionConfigPatch) {
    return saveSessionConfig(ws, canonicalId(ws, id), patch)
  },
  async pin(ws: WorkspaceEntry, id: string) {
    id = canonicalId(ws, id)
    const harness = harnessFor(ws)
    const active = harness.activeSessions().some(s => s.workspaceId === ws.id && s.sessionId === id)
    if (!active && !(await harness.listSessions(ws)).some(s => s.sessionId === id)) return false
    await pinSession(ws, id)
    return true
  },
  unpin(ws: WorkspaceEntry, id: string) {
    return unpinSession(ws, canonicalId(ws, id))
  },
  select(ws: WorkspaceEntry, id: string, tabId: WorkspaceTabId, ifMatch?: string | null) {
    return updateWorkspaceState(ws, state => {
      if (state.pinnedSessionId) return false
      selectSessionForTab(state, ws.id, id, tabId, ifMatch)
      return true
    })
  },
  deselect(ws: WorkspaceEntry, id: string, tabId: WorkspaceTabId) {
    return deselectSession(ws, canonicalId(ws, id), tabId)
  },
  archive(ws: WorkspaceEntry, id: string) {
    return archiveWorkspaceSession(ws, canonicalId(ws, id))
  }
}
