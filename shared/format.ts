import type { AttachmentOrigin, DrawingPurpose, TextAttachment } from './types'

export type ToolCaller = 'model' | 'server-tool' | 'mcp' | 'subagent'

export type ToolState =
  | 'pending'
  | 'approval-pending'
  | 'approval-denied'
  | 'running'
  | 'success'
  | 'error'

export type SubagentStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type SubagentRecord = {
  taskId: string
  description: string
  progress: string[]
  status: SubagentStatus
  usage?: { totalTokens?: number; toolUses?: number; durationMs?: number }
  transcript: Turn[]
}

export type SkillRecord = {
  skillName: string
  body?: string
}

export type ToolCall = {
  toolCallId: string
  name: string
  caller: ToolCaller
  // Origin platform — lets the UI pick the right display label and brief
  // for the same canonical action (`read` vs `Read`, `exec` vs `Bash`).
  // Adapters are responsible for setting it; UI defaults to a generic
  // rendering when absent.
  provider?: 'meta'
  mcpServer?: string
  state: ToolState
  input: unknown
  output?: unknown
  errorText?: string
  sidecar?: Record<string, unknown>
  subagent?: SubagentRecord
  skill?: SkillRecord
}

export type Citation = { url?: string; title?: string; quote?: string }

export type Part =
  | ({ type: 'text-attachment' } & TextAttachment)
  | { type: 'text'; text: string; citations?: Citation[] }
  | {
      type: 'reasoning'
      text: string
      redacted?: boolean
      signature?: string
      durationMs?: number
    }
  | { type: 'tool-call'; call: ToolCall }
  | ({
      type: 'file-attachment'
      mediaType: string
      label?: string
      previewUrl?: string
      path?: string
      // Only present for drawing images.
      purpose?: DrawingPurpose
    } & Partial<AttachmentOrigin>)
  | { type: 'source-url'; url: string; title?: string; sourceId: string }
  | { type: 'source-document'; mediaType: string; title: string; sourceId: string }
  | { type: 'data'; name: string; data: unknown }

// Why a synthetic turn exists. Set by adapters — from the backend's own
// synthetic flag or from shared/system-messages.ts text classification. The UI
// hides every synthetic turn; the reason is kept for debugging and future
// "show system messages" affordances.
export type SyntheticTurnReason =
  | 'skill-body'
  | 'system-reminder'
  | 'hook-output'
  | 'slash-command'
  | 'interrupt'
  | 'other'

export type TurnOrigin =
  | { kind: 'user-input' }
  | { kind: 'tool-return'; toolCallId: string }
  | { kind: 'synthetic'; reason: SyntheticTurnReason }
  // A backend notification (e.g. a background-task completion) rewritten to
  // readable text by shared/system-messages.ts. Rendered as plain text in the
  // flow for now — a dedicated notification block is planned; key it off
  // this origin.
  | { kind: 'notification' }
  | { kind: 'subagent-prompt'; parentToolCallId: string }
  | { kind: 'inter-session' }
  | { kind: 'replay' }

export type TurnMeta = {
  // Identifies the local user turn replaced by this durable turn.
  optimisticId?: string
  model?: string
  provider?: string
  stopReason?: string
  durationMs?: number
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number }
  // The API message id (`msg_...`) that produced this assistant turn, when the
  // backend reports one. NOT the Turn `id`. Used to reconcile a live streaming
  // preview against its finalized turn — the client clears the preview keyed by
  // this id the instant the real turn lands (see PreviewFrame).
  apiMessageId?: string
}

export type Turn = {
  id: string
  role: 'user' | 'assistant'
  origin: TurnOrigin
  parentTaskId?: string
  parts: Part[]
  timestamp?: string
  seq?: number
  meta?: TurnMeta
}

export type McpServerInfo = { name: string; status: string }
export type PluginInfo = { name: string; path: string }

export type SessionSnapshot = {
  sessionId: string
  model?: string
  cwd?: string
  permissionMode?: string
  tools: string[]
  mcpServers: McpServerInfo[]
  plugins: PluginInfo[]
  skills: string[]
  slashCommands: string[]
  agents: string[]
  updatedAt: string
}

export type SystemNotice =
  | { id: string; kind: 'warning'; at: string; message: string }
  | {
      id: string
      kind: 'rate-limit'
      at: string
      info?: unknown
    }
  | {
      id: string
      kind: 'api-retry'
      at: string
      attempt?: number
      maxRetries?: number
      delayMs?: number
      error?: string
    }
  | { id: string; kind: 'compact'; at: string; metadata?: unknown }
  | { id: string; kind: 'model-change'; at: string; model: string; prev?: string }
  | {
      id: string
      kind: 'hook'
      at: string
      hookId: string
      hookName: string
      event: string
      status: 'started' | 'progress' | 'response'
      output?: string
      exitCode?: number
      outcome?: 'success' | 'error' | 'cancelled'
    }
  | {
      id: string
      kind: 'session-state'
      at: string
      state: 'idle' | 'running' | 'requires-action'
    }
  | {
      id: string
      kind: 'files-persisted'
      at: string
      files: string[]
      failed: { filename: string; error: string }[]
    }
  | { id: string; kind: 'elicitation'; at: string; server: string; elicitationId: string }

export type ResultSummary = {
  subtype:
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  cost?: number
  turns?: number
  durationMs?: number
}

// Stream events emitted by the adapter.
// Semantics: upsert-by-id for `turn` and `snapshot`; append for `notice`; replace for `result`.
// This is the PERSISTED, replayable union — `getSessionEvents` reconstructs it
// from disk, so anything reconnect-healing trusts must be here. Live-only
// previews (below) are deliberately NOT part of it.
export type StreamEvent =
  | { kind: 'snapshot'; snapshot: SessionSnapshot }
  | { kind: 'turn'; turn: Turn }
  | { kind: 'notice'; notice: SystemNotice }
  | { kind: 'result'; result: ResultSummary }

// One open content block within a live streaming message. `text` is the
// CUMULATIVE text so far (not a diff) — a preview is always a full snapshot, so
// a dropped or reordered frame is simply overwritten by the next one and can
// never desync into corrupted text.
export type PreviewBlock = { index: number; kind: 'text' | 'reasoning'; text: string }

// A live, token-by-token snapshot of an assistant message still being generated.
// Ephemeral and non-persisted: it never enters `StreamEvent`, never touches the
// durable transcript, and is discarded the moment the real `turn` lands. Keyed
// by `messageId` (the API `msg_...` id) so concurrent streams — e.g. parallel
// subagents — accumulate independently and never collide.
export type StreamPreview = {
  messageId: string
  // null = top-level assistant stream; a tool_use id = a subagent's nested
  // stream. Routes the preview to the right UI slot; not part of its identity.
  parentToolUseId: string | null
  blocks: PreviewBlock[]
}

// What the adapter emits per ingested raw message: the persisted stream events,
// plus the live-only preview. Callers that persist/replay filter previews out;
// the live session layer forwards them as PreviewFrames over the socket.
export type AdapterEmit = StreamEvent | { kind: 'preview'; preview: StreamPreview }

// Materialized view state the UI renders from.
export type ViewState = {
  snapshot?: SessionSnapshot
  turns: Turn[]
  notices: SystemNotice[]
  result?: ResultSummary
}

export function emptyViewState(): ViewState {
  return { turns: [], notices: [] }
}

export function applyEvent(state: ViewState, ev: StreamEvent): ViewState {
  switch (ev.kind) {
    case 'snapshot':
      return { ...state, snapshot: ev.snapshot }
    case 'turn': {
      const idx = state.turns.findIndex(
        t => t.id === ev.turn.id || t.id === ev.turn.meta?.optimisticId
      )
      // Known turn: replace in place. Its position was decided when it first
      // landed and must not move under the reader mid-run.
      if (idx >= 0) {
        return {
          ...state,
          turns: state.turns.flatMap((t, i) =>
            i === idx
              ? [ev.turn]
              : t.id === ev.turn.id || t.id === ev.turn.meta?.optimisticId
                ? []
                : [t]
          )
        }
      }
      // New turn: arrival order is the default, but a backend that reports a
      // transcript position (`seq`) gets placed by it, so a row that arrives
      // late — reconciled after a dropped frame, or replayed after a
      // reconnect — lands where the transcript says it belongs instead of at
      // the end. Only seq-bearing turns are reordered against each other;
      // turns without one keep pure append semantics.
      if (ev.turn.seq === undefined) return { ...state, turns: [...state.turns, ev.turn] }
      const at = state.turns.findIndex(t => t.seq !== undefined && t.seq > ev.turn.seq!)
      if (at < 0) return { ...state, turns: [...state.turns, ev.turn] }
      return { ...state, turns: [...state.turns.slice(0, at), ev.turn, ...state.turns.slice(at)] }
    }
    case 'notice': {
      if (state.notices.some(n => n.id === ev.notice.id)) {
        return {
          ...state,
          notices: state.notices.map(n => (n.id === ev.notice.id ? ev.notice : n))
        }
      }
      return { ...state, notices: [...state.notices, ev.notice] }
    }
    case 'result':
      return { ...state, result: ev.result }
  }
}

export function applyEvents(events: StreamEvent[]): ViewState {
  // Replay owns these arrays, so it can upsert in place instead of copying the
  // entire transcript per event. The live single-event reducer stays immutable.
  const state = emptyViewState()
  const turnIndexes = new Map<string, number>()
  const notices = new Map<string, SystemNotice>()
  let maxSeq = -Infinity

  for (const event of events) {
    switch (event.kind) {
      case 'snapshot':
        state.snapshot = event.snapshot
        break
      case 'turn': {
        const turn = event.turn
        const seq = turn.seq
        const nativeIndex = turnIndexes.get(turn.id)
        const optimisticIndex = turn.meta?.optimisticId
          ? turnIndexes.get(turn.meta.optimisticId)
          : undefined
        if (
          nativeIndex !== undefined &&
          optimisticIndex !== undefined &&
          nativeIndex !== optimisticIndex
        ) {
          // Snapshot and live caches can briefly contain both identities.
          const duplicate = Math.max(nativeIndex, optimisticIndex)
          turnIndexes.delete(state.turns[duplicate]!.id)
          state.turns.splice(duplicate, 1)
          for (let i = duplicate; i < state.turns.length; i++)
            turnIndexes.set(state.turns[i]!.id, i)
        }
        const existingIndex =
          nativeIndex !== undefined && optimisticIndex !== undefined
            ? Math.min(nativeIndex, optimisticIndex)
            : (nativeIndex ?? optimisticIndex)
        if (existingIndex !== undefined) {
          turnIndexes.delete(state.turns[existingIndex]!.id)
          state.turns[existingIndex] = turn
          turnIndexes.set(turn.id, existingIndex)
        } else {
          // Append is the common path, including ordered seq-bearing history.
          // A late turn uses the same insertion rule as applyEvent.
          const before =
            seq !== undefined && seq < maxSeq
              ? state.turns.findIndex(t => t.seq !== undefined && t.seq > seq)
              : -1
          if (before < 0) {
            turnIndexes.set(turn.id, state.turns.length)
            state.turns.push(turn)
          } else {
            state.turns.splice(before, 0, turn)
            for (let i = before; i < state.turns.length; i++) {
              turnIndexes.set(state.turns[i].id, i)
            }
          }
        }
        // Keep an upper bound even if an upsert lowers/removes an earlier seq.
        if (seq !== undefined) maxSeq = Math.max(maxSeq, seq)
        break
      }
      case 'notice':
        notices.set(event.notice.id, event.notice)
        break
      case 'result':
        state.result = event.result
        break
    }
  }
  state.notices = [...notices.values()]
  return state
}
