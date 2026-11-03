import { isAppIconId } from '@/shared/app-icons'
import { newQuintletId } from '@/shared/ids'
import type { PendingQuintlet, WorkspaceEntry, WorkspaceState } from '@/shared/types'
import { readWorkspaceState, updateWorkspaceState, type WorkspaceRef } from '../workspace-storage'
import { archiveQuintletSessions } from './archive'

export class PendingQuintletError extends Error {
  constructor(
    message: string,
    public status: 400 | 404 | 409 = 400
  ) {
    super(message)
  }
}

type PendingQuintletState = Omit<PendingQuintlet, 'id'>
type PendingQuintletPatch = Partial<
  Pick<PendingQuintlet, 'status' | 'requirements' | 'buildSessionId' | 'error'>
>

function applyPatch(quintlet: PendingQuintletState, patch: PendingQuintletPatch): void {
  Object.assign(quintlet, patch)
  for (const key of Object.keys(quintlet) as (keyof PendingQuintletState)[])
    if (quintlet[key] === undefined) delete quintlet[key]
}

export async function listPendingQuintlets(ws: WorkspaceRef): Promise<PendingQuintlet[]> {
  const { pendingQuintlets } = await readWorkspaceState(ws)
  return Object.entries(pendingQuintlets).map(([id, quintlet]) => ({ id, ...quintlet }))
}

export async function getPendingQuintlet(ws: WorkspaceRef, id: string) {
  const quintlet = (await readWorkspaceState(ws)).pendingQuintlets[id]
  return quintlet ? { id, ...quintlet } : undefined
}

export async function createPendingQuintlet(
  ws: WorkspaceRef,
  input: PendingQuintletPatch = {}
): Promise<PendingQuintlet> {
  const id = newQuintletId()
  return updateWorkspaceState(ws, state => {
    const created: PendingQuintletState = { status: 'draft', requirements: '' }
    applyPatch(created, input)
    state.pendingQuintlets[id] = created
    return { id, ...created }
  })
}

export async function patchPendingQuintlet(
  ws: WorkspaceRef,
  id: string,
  patch: PendingQuintletPatch,
  expectedStatus?: PendingQuintlet['status']
) {
  return updateWorkspaceState(ws, state => {
    const quintlet = state.pendingQuintlets[id]
    // A bundle can complete while a send is being accepted.
    if (!quintlet) return undefined
    if (!expectedStatus || quintlet.status === expectedStatus) applyPatch(quintlet, patch)
    return { id, ...quintlet }
  })
}

// Move a draft to `starting` inside a state transaction.
export function startQuintletBuild(
  state: WorkspaceState,
  id: string,
  requirements: string,
  sessionId: string,
  hasAttachments: boolean
): PendingQuintlet {
  if (!requirements.trim() && !hasAttachments)
    throw new PendingQuintletError('Quintlet requirements or an attachment are required')
  const quintlet = state.pendingQuintlets[id]
  if (!quintlet) throw new PendingQuintletError('Pending quintlet not found', 404)
  if (quintlet.status !== 'draft') throw new PendingQuintletError('Quintlet has already been submitted', 409)
  quintlet.status = 'starting'
  quintlet.requirements = requirements.trim()
  quintlet.buildSessionId = sessionId
  return { id, ...quintlet }
}

export async function updatePendingQuintlet(
  ws: WorkspaceRef,
  id: string,
  input: { requirements?: string; title?: string; icon?: string }
) {
  if (input.icon !== undefined && !isAppIconId(input.icon))
    throw new PendingQuintletError(`Unknown quintlet icon id "${input.icon}"`)
  return updateWorkspaceState(ws, state => {
    const quintlet = state.pendingQuintlets[id]
    if (!quintlet) throw new PendingQuintletError('Pending quintlet not found', 404)
    if (input.requirements !== undefined) {
      if (quintlet.status !== 'draft')
        throw new PendingQuintletError('Submitted quintlet input cannot be changed', 409)
      quintlet.requirements = input.requirements
    }
    if (input.title !== undefined) quintlet.title = input.title
    if (input.icon !== undefined) quintlet.icon = input.icon
    return { id, ...quintlet }
  })
}

export async function completeQuintletBuild(ws: WorkspaceRef, id: string) {
  await updateWorkspaceState(ws, state => {
    delete state.pendingQuintlets[id]
  })
}

// Follow a temporary id's rename in every build that runs in it.
export function renameBuildSession(state: WorkspaceState, from: string, to: string): void {
  for (const quintlet of Object.values(state.pendingQuintlets)) {
    if (quintlet.buildSessionId === from) quintlet.buildSessionId = to
  }
}

export async function discardPendingQuintlet(
  ws: WorkspaceEntry,
  id: string,
  activeSessionIds: Set<string>
) {
  const quintlet = (await readWorkspaceState(ws)).pendingQuintlets[id]
  if (!quintlet) throw new PendingQuintletError('Pending quintlet not found', 404)
  if (
    quintlet.status === 'starting' ||
    (quintlet.buildSessionId && activeSessionIds.has(quintlet.buildSessionId))
  )
    throw new PendingQuintletError('A starting or building quintlet can only be closed', 409)
  // Archiving talks to the harness, so it runs before the state transaction.
  await archiveQuintletSessions(ws, id)
  await updateWorkspaceState(ws, state => {
    delete state.pendingQuintlets[id]
  })
}
