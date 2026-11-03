import type { CanvasOp, CanvasOpResult } from '@/shared/types'

// A live Canvas editor registers an executor here while it's mounted, keyed
// by workspace id. The chat-socket frame handler (connection.ts) looks one up
// when a `canvas:op` arrives and runs it against the tab's tldraw editor.
// Only the tab actually showing a workspace's canvas has an entry, so ops from
// `quint canvas` reach the right editor (and no-op everywhere else).

type CanvasExecutor = (op: CanvasOp) => Promise<CanvasOpResult>

const executors = new Map<string, CanvasExecutor>()

export function setCanvasExecutor(workspaceId: string, fn: CanvasExecutor | null) {
  if (fn) executors.set(workspaceId, fn)
  else executors.delete(workspaceId)
}

export function getCanvasExecutor(workspaceId: string): CanvasExecutor | undefined {
  return executors.get(workspaceId)
}
