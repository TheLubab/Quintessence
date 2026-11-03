import { APP_ICON_IDS } from '@/shared/app-icons'
import { quintletBuildDirectives } from '@/shared/quintlet-build-directives'
import { quintletTabId } from '@/shared/workspace-tabs'
import type { PendingQuintlet, WorkspaceEntry } from '@/shared/types'
import { harnessFor } from '../agents/registry'
import type { SendMessageInput } from '../agents/types'
import { ForkUnsupportedError, inheritedHistoryBoundary } from '../agents/fork'
import { updateWorkspaceState } from '../workspace-storage'
import { resolveRenamedSession, selectSessionForTab } from './selected'
import { setSessionTab, updateSessionEntry } from './store'
import { getSessionConfig, saveSessionConfig } from './config'
import { attachSession } from './message-preparation'
import { sessionService } from './service'
import {
  createPendingQuintlet,
  listPendingQuintlets,
  patchPendingQuintlet,
  startQuintletBuild
} from './pending-quintlets'

export class QuintletStartupError extends Error {
  constructor(
    error: unknown,
    public sessionId?: string,
    public quintletId?: string
  ) {
    super(error instanceof Error ? error.message : 'Couldn’t start quintlet chat')
  }
}
type BuildSendOptions = Pick<
  SendMessageInput,
  'attachments' | 'optimisticId' | 'model' | 'effort' | 'fastMode' | 'stream'
>
export type SubmitQuintletInput = BuildSendOptions & { requirements: string; sessionId?: string }

async function sendBuild(
  ws: WorkspaceEntry,
  quintlet: PendingQuintlet,
  sessionId: string,
  isNew: boolean,
  options: BuildSendOptions
) {
  await sessionService.send(ws, {
    ...options,
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId,
    isNew,
    quintletBuildId: quintlet.id,
    content: quintlet.requirements
  })
  await patchPendingQuintlet(ws, quintlet.id, { status: 'submitted' }, 'starting')
}
async function failStartup(
  ws: WorkspaceEntry,
  error: unknown,
  sessionId?: string,
  quintlet?: PendingQuintlet
): Promise<never> {
  if (quintlet)
    await patchPendingQuintlet(
      ws,
      quintlet.id,
      {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Couldn’t start quintlet chat'
      },
      'starting'
    )
  throw new QuintletStartupError(
    error,
    sessionId ? resolveRenamedSession(ws.id, sessionId) : undefined,
    quintlet?.id
  )
}

export async function submitQuintlet(ws: WorkspaceEntry, quintletId: string, input: SubmitQuintletInput) {
  const tabId = quintletTabId(quintletId)
  // The build, the chat's tab and the tab's selection start in one write. A
  // pinned chat takes the build and keeps its own tab.
  const { quintlet, sessionId, pinned } = await updateWorkspaceState(ws, state => {
    const pinned = state.pinnedSessionId
    const sessionId = pinned ?? input.sessionId ?? crypto.randomUUID()
    const quintlet = startQuintletBuild(
      state,
      quintletId,
      input.requirements,
      sessionId,
      !!input.attachments?.length
    )
    if (!pinned) {
      setSessionTab(state, sessionId, tabId)
      selectSessionForTab(state, ws.id, sessionId, tabId)
    }
    return { quintlet, sessionId, pinned }
  })
  try {
    await sendBuild(ws, quintlet, sessionId, !pinned, input)
  } catch (error) {
    return failStartup(ws, error, sessionId, quintlet)
  }
  return { quintletId, sessionId: resolveRenamedSession(ws.id, sessionId) }
}
export async function createQuintletFromSession(
  ws: WorkspaceEntry,
  fromSessionId: string | undefined,
  requirements: string
) {
  if (!requirements.trim()) throw new Error('Quintlet requirements are required')
  if (fromSessionId === undefined) {
    const quintlet = await createPendingQuintlet(ws, {
      requirements: requirements.trim(),
      status: 'submitted'
    })
    return {
      quintletId: quintlet.id,
      mode: 'in-place' as const,
      buildInstructions: quintletBuildDirectives(quintlet.id, APP_ICON_IDS)
    }
  }
  if (!fromSessionId) throw new Error('Session id cannot be empty')
  fromSessionId = resolveRenamedSession(ws.id, fromSessionId)
  const harness = harnessFor(ws)
  if (
    !(await harness.listSessions(ws)).some(session => session.sessionId === fromSessionId) &&
    !harness
      .activeSessions()
      .some(session => session.workspaceId === ws.id && session.sessionId === fromSessionId)
  )
    throw new Error('Source chat not found')
  let sessionId: string | undefined
  let quintlet: PendingQuintlet | undefined
  try {
    const sourceConfig = await getSessionConfig(ws, fromSessionId)
    try {
      sessionId = await harness.forkSession?.(ws, fromSessionId, sourceConfig)
    } catch (error) {
      if (!(error instanceof ForkUnsupportedError)) throw error
    }
    const isNew = !sessionId
    sessionId ??= crypto.randomUUID()
    if (!isNew) {
      await updateSessionEntry(ws, sessionId, { fork: { fromSessionId } })
      // The fork API returns only a child ID. A failed history read leaves the
      // child usable and its full transcript visible.
      const history = await harness.sessionEvents(ws, sessionId).catch(() => undefined)
      if (history)
        await updateSessionEntry(ws, sessionId, {
          fork: { fromSessionId, ...inheritedHistoryBoundary(history) }
        })
    }
    const config = await saveSessionConfig(ws, sessionId, sourceConfig)
    quintlet = await createPendingQuintlet(ws, {
      status: 'starting',
      requirements: requirements.trim(),
      buildSessionId: sessionId
    })
    await attachSession(ws, quintletTabId(quintlet.id), sessionId)
    await sendBuild(ws, quintlet, sessionId, isNew, config)
    return {
      quintletId: quintlet.id,
      mode: 'handoff' as const,
      sessionId: resolveRenamedSession(ws.id, sessionId)
    }
  } catch (error) {
    return failStartup(ws, error, sessionId, quintlet)
  }
}
export async function failInterruptedQuintletStarts(ws: WorkspaceEntry) {
  for (const quintlet of await listPendingQuintlets(ws)) {
    if (quintlet.status === 'starting')
      await patchPendingQuintlet(
        ws,
        quintlet.id,
        {
          status: 'failed',
          error:
            'Quintlet chat startup was interrupted. Check the chat before continuing; it has not been retried.'
        },
        'starting'
      )
  }
}
