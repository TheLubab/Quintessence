import type { WorkspaceEntry } from '@/shared/types'
import { quintletTabId } from '@/shared/workspace-tabs'
import { harnessFor } from '../agents/registry'
import { clearSelectedSession, dropSessionTab } from './selected'
import { getSessionEntries } from './store'
import { broadcast } from '../state'

export async function archiveWorkspaceSession(ws: WorkspaceEntry, sessionId: string) {
  const harness = harnessFor(ws)
  if (!harness.archiveSession) throw new Error('Chat archiving is not supported')
  await harness.interrupt(ws.id, sessionId)
  await harness.archiveSession(ws, sessionId)
  await clearSelectedSession(ws, sessionId)
  broadcast(ws.id, { type: 'session_archived', sessionId })
}

export async function archiveQuintletSessions(ws: WorkspaceEntry, quintletId: string) {
  const tabId = quintletTabId(quintletId)
  for (const [sessionId, session] of Object.entries(await getSessionEntries(ws))) {
    if (session.tabId === tabId) await archiveWorkspaceSession(ws, sessionId)
  }
  await dropSessionTab(ws, tabId)
}
