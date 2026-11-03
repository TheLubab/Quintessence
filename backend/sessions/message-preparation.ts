import { APP_ICON_IDS } from '@/shared/app-icons'
import { quintletBuildDirectives } from '@/shared/quintlet-build-directives'
import { quintletIdFromTab } from '@/shared/workspace-tabs'
import type { WorkspaceEntry, WorkspaceTabId } from '@/shared/types'
import { harnessFor } from '../agents/registry'
import type { SendMessageInput } from '../agents/types'
import { getPinnedSession, saveSelectedSession, resolveRenamedSession } from './selected'
import { getSessionEntry, updateSessionEntry } from './store'
import {
  getPendingQuintlet,
  listPendingQuintlets,
  patchPendingQuintlet,
  PendingQuintletError
} from './pending-quintlets'

export type WorkspaceMessageInput = SendMessageInput & {
  quintletBuildId?: string
}

// Shared preparation for ordinary chat and initial quintlet builds.
export async function prepareWorkspaceMessage(ws: WorkspaceEntry, input: WorkspaceMessageInput) {
  const { quintletBuildId, ...message } = input
  const sessionId = resolveRenamedSession(ws.id, input.sessionId)
  const record = await getSessionEntry(ws, sessionId)
  const tabId = input.context?.activeTab?.id ?? record.tabId ?? 'dashboard'
  const targetQuintletId = quintletBuildId ?? (input.isNew ? quintletIdFromTab(tabId) : undefined)
  const ownedQuintlets = targetQuintletId
    ? []
    : (await listPendingQuintlets(ws)).filter(quintlet => quintlet.buildSessionId === sessionId)
  const pending = targetQuintletId
    ? await getPendingQuintlet(ws, targetQuintletId)
    : (ownedQuintlets.find(quintlet => quintlet.id === quintletIdFromTab(tabId)) ??
      ownedQuintlets[0])
  const isBuildRequest = pending && (quintletBuildId === pending.id || input.isNew)
  if (
    isBuildRequest &&
    pending.buildSessionId &&
    pending.buildSessionId !== sessionId &&
    (pending.status === 'starting' ||
      harnessFor(ws)
        .activeSessions()
        .some(
          session => session.workspaceId === ws.id && session.sessionId === pending.buildSessionId
        ))
  )
    throw new PendingQuintletError('This quintlet is already being built in another chat', 409)
  if (input.isNew && record.tabId !== tabId) {
    record.tabId = tabId === 'dashboard' ? undefined : tabId
    await attachSession(ws, tabId, sessionId)
  }
  if (isBuildRequest)
    await patchPendingQuintlet(ws, pending.id, {
      buildSessionId: sessionId
    })
  const pinnedSessionId = await getPinnedSession(ws)
  const prepared: SendMessageInput = {
    ...message,
    sessionId,
    context: {
      ...input.context,
      session: {
        id: sessionId,
        tabId: record.tabId,
        pinned: pinnedSessionId === sessionId
      },
      directives: [
        ...(input.context?.directives ?? []),
        ...(isBuildRequest ? quintletBuildDirectives(pending.id, APP_ICON_IDS) : []),
        ...(isBuildRequest && record.fork
          ? [
              'Inherited conversation is background. Work on the current request; do not resume unrelated earlier tasks.'
            ]
          : []),
        ...(pending && input.isNew && pending.requirements !== input.content
          ? [`Original quintlet requirements:\n${pending.requirements}`]
          : []),
        ...(pending && input.attachments?.length
          ? ['Use the attachments as reference material for the intended quintlet.']
          : [])
      ]
    }
  }
  return { message: prepared, pending }
}
export async function attachSession(
  ws: WorkspaceEntry,
  tabId: WorkspaceTabId,
  sessionId: string,
  ifMatch?: string | null
) {
  await updateSessionEntry(ws, sessionId, { tabId: tabId === 'dashboard' ? undefined : tabId })
  await saveSelectedSession(ws, sessionId, tabId, ifMatch)
}
