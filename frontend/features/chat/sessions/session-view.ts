import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { requestJson } from '@/frontend/api/http'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { applyEvents } from '@/shared/format'
import type { StreamEvent, ViewState } from '@/shared/types'

type PendingFetch = {
  workspaceId: string
  sessionId: string
  events: StreamEvent[]
}

const pendingFetches = new WeakMap<QueryClient, Set<PendingFetch>>()

// Keep socket events that arrive after an HTTP snapshot starts loading. This
// also covers the first load, before there is any cached view to patch.
export function bufferSessionEvent(
  client: QueryClient,
  workspaceId: string,
  sessionId: string,
  event: StreamEvent
) {
  for (const pending of pendingFetches.get(client) ?? []) {
    if (pending.workspaceId === workspaceId && pending.sessionId === sessionId) {
      pending.events.push(event)
    }
  }
}

export function sessionViewOptions(workspaceId: string, sessionId: string) {
  return queryOptions({
    queryKey: workspaceKeys.events(workspaceId, sessionId),
    queryFn: async ({ client, signal }) => {
      const requests = pendingFetches.get(client) ?? new Set<PendingFetch>()
      pendingFetches.set(client, requests)
      const pending: PendingFetch = { workspaceId, sessionId, events: [] }
      requests.add(pending)
      try {
        const events = await requestJson<StreamEvent[]>(
          `/api/workspaces/${workspaceId}/sessions/${sessionId}/events`,
          { signal },
          'Couldn’t load chat'
        )
        return applyEvents([...events, ...pending.events])
      } finally {
        requests.delete(pending)
      }
    },
    staleTime: Infinity,
    gcTime: 5 * 60_000
  })
}

// A native ID replaces the optimistic ID. Cancel both requests before moving
// data so neither response can overwrite a newer socket update or revive the old key.
export function renameSessionView(
  client: QueryClient,
  workspaceId: string,
  from: string,
  to: string
) {
  if (from === to) return
  const oldKey = workspaceKeys.events(workspaceId, from)
  const newKey = workspaceKeys.events(workspaceId, to)
  const previous = client.getQueryData<ViewState>(oldKey)
  const current = client.getQueryData<ViewState>(newKey)
  const buffered: StreamEvent[] = []
  for (const pending of pendingFetches.get(client) ?? []) {
    if (
      pending.workspaceId === workspaceId &&
      (pending.sessionId === from || pending.sessionId === to)
    ) {
      buffered.push(...pending.events)
    }
  }
  for (const id of [from, to]) {
    void client.cancelQueries(
      { queryKey: workspaceKeys.events(workspaceId, id), exact: true },
      { revert: false }
    )
    void client.cancelQueries(
      { queryKey: workspaceKeys.sessionState(workspaceId, id), exact: true },
      { revert: false }
    )
  }
  const events: StreamEvent[] = []
  for (const view of [previous, current]) {
    if (!view) continue
    if (view.snapshot)
      events.push({ kind: 'snapshot', snapshot: { ...view.snapshot, sessionId: to } })
    events.push(...view.turns.map(turn => ({ kind: 'turn' as const, turn })))
    events.push(...view.notices.map(notice => ({ kind: 'notice' as const, notice })))
    if (view.result) events.push({ kind: 'result', result: view.result })
  }
  if (previous || current || buffered.length)
    client.setQueryData(newKey, applyEvents([...events, ...buffered]))
  const oldStateKey = workspaceKeys.sessionState(workspaceId, from)
  const newStateKey = workspaceKeys.sessionState(workspaceId, to)
  const state = client.getQueryData(newStateKey) ?? client.getQueryData(oldStateKey)
  if (state !== undefined) client.setQueryData(newStateKey, state)
  client.removeQueries({ queryKey: oldKey, exact: true })
  client.removeQueries({ queryKey: oldStateKey, exact: true })
  // The optimistic cache may contain only the first message. Fetch native
  // history on the next mount, or immediately when the destination is observed.
  void client.invalidateQueries({ queryKey: newKey, exact: true })
  void client.invalidateQueries({ queryKey: newStateKey, exact: true })
}
