// The harness contract: what an agent backend must implement to be drivable
// by quint. See README.md in this folder for the full checklist and the
// message-type layers; each harness's index.ts exports one Harness object
// wrapping its session/adapter/transport modules.
import type { MessageAttachment } from '@/shared/types'
import type { QuintContext } from '@/shared/quint-context'
import type {
  HarnessAvailability,
  HarnessLogin,
  McpServer,
  MetaSessionState,
  ApprovalResponse,
  Model,
  SessionActivity,
  SessionConfig,
  SessionSummary,
  StreamEvent,
  UserInputQuestionAnswer,
  WorkspaceEntry,
  WorkspaceType
} from '@/shared/types'

export type HarnessLoginAttempt = HarnessLogin & {
  completed?: Promise<void>
  cancel?: () => void | Promise<void>
  submitCode?: (code: string) => void | Promise<void>
}

export type SendMessageInput = {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  content: string
  // Uploaded files and drawings, or structured context from applets.
  attachments?: MessageAttachment[]
  optimisticId?: string
  model?: string
  effort?: string
  fastMode?: boolean
  stream?: boolean
  context?: QuintContext
}

// Static, per-harness feature flags. These let orchestration code stay
// generic instead of special-casing providers (e.g. the models endpoint's
// streaming toggle). An entry describes what the BACKEND can do — partial
// support/workarounds are documented in README.md's capability matrix.
export type HarnessCapabilities = {
  // Can the UI offer live token-by-token streaming for this backend?
  supportsStreaming: boolean
  // How image attachments reach the agent.
  imagesInline: 'base64' | 'data-url' | 'path-note'
  // Model/effort can change mid-session without a rebuild dance.
  liveModelSwitch: boolean
  liveEffortSwitch: boolean
  // Does the backend echo the sent user message back (with our optimistic id)?
  nativeUserEcho: boolean
}

// Home-page workspace card data beyond thumbnails: latest session activity
// and (for widget-less workspaces) the oldest session's first user message.
export type WorkspaceActivityPreview = {
  firstUserMessage?: string
  updatedAt?: number
}

export type DiscoveredWorkspaceCandidate = {
  path: string
  type: WorkspaceType
}

export type HarnessWorkspace = Pick<WorkspaceEntry, 'id' | 'path' | 'type'>

export type SessionLifecycle = {
  renamed: (
    workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
    from: string,
    to: string
  ) => Promise<void>
}

export type Harness = {
  id: WorkspaceType
  capabilities: HarnessCapabilities

  // -- chat lifecycle ---------------------------------------------------------
  // Resolves after native acceptance/queueing; rejects startup failures.
  // Failures after acceptance are delivered through the native event stream.
  sendMessage(input: SendMessageInput, lifecycle?: SessionLifecycle): Promise<void>
  respondToApproval?(input: ApprovalResponse): Promise<void>
  interrupt(workspaceId: string, sessionId: string): Promise<void>
  // Optional because some providers do not expose an archive operation.
  archiveSession?(ws: WorkspaceEntry, sessionId: string): Promise<void>
  // Silent native fork, returning its durable child id. Apply sourceConfig at
  // creation if the backend needs it there. The caller copies the full config
  // to the child and passes it on the first send, before any work starts.
  forkSession?(ws: WorkspaceEntry, sessionId: string, sourceConfig: SessionConfig): Promise<string>
  // Every session whose activity is not `idle`, across all workspaces (drives
  // the status snapshot and pending-quintlet progress). Activity is mirrored
  // from the backend's native lifecycle signal, never derived by counting.
  activeSessions(): { workspaceId: string; sessionId: string; activity: SessionActivity }[]

  // -- discovery / metadata ---------------------------------------------------
  listSessions(ws: WorkspaceEntry): Promise<SessionSummary[]>
  // Home-page card preview. Called for every card on the home screen, so
  // implementations must stay cheap: no process spawns, no per-session
  // transcript reads unless cached. Failures resolve to {} — the card
  // renders without the activity fields.
  workspacePreview(
    ws: WorkspaceEntry,
    includeFirstUserMessage: boolean
  ): Promise<WorkspaceActivityPreview>
  sessionEvents(ws: WorkspaceEntry, sessionId: string): Promise<StreamEvent[]>
  // Backend-owned session facts that are not transcript items (pending
  // questions, todos, context pressure, cumulative usage).
  sessionState?(ws: WorkspaceEntry, sessionId: string): Promise<MetaSessionState>
  // Answer, cancel, or clarify a pending backend question.
  respondToQuestion?(input: {
    workspaceId: string
    sessionId: string
    userInputId: string
    action: 'answer' | 'cancel' | 'clarify'
    answers?: UserInputQuestionAnswer[]
    reason?: string
    clarification?: string
  }): Promise<void>
  listModels(ws: WorkspaceEntry): Promise<Model[]>
  // MCP server status for the connectors UI; absent = backend has no MCP story.
  mcpStatus?(ws: WorkspaceEntry): Promise<McpServer[]>
  // Workspaces this backend knows about that aren't registered yet.
  discoverWorkspaces?(registeredPaths: Set<string>): Promise<DiscoveredWorkspaceCandidate[]>
  // Without a workspace, only check whether the runtime is installed. With a
  // workspace, also check provider state such as authentication.
  availability?(ws?: HarnessWorkspace): Promise<HarnessAvailability>
  // Global account authentication, independent of workspace configuration.
  startLogin?(): Promise<HarnessLoginAttempt>
  authStatus?(): Promise<HarnessAvailability>

  // -- host integration hooks -------------------------------------------------
  // Env is frozen at spawn everywhere; this reaps idle sessions/processes so
  // the next message picks up fresh env.
  onEnvChanged?(workspacePath: string): void
  // Workspace removal: stop every child process owned by that workspace.
  stopWorkspace?(workspacePath: string): void
  // Server shutdown: kill child processes so nothing is orphaned.
  shutdown?(): void | Promise<void>
  // Where this backend loads workspace skills from (workspace provisioning).
  skillsDir?(workspaceRoot: string): string
  // Extra payload for runtime diagnostics.
  debugInfo?(ws: WorkspaceEntry): Promise<unknown>
  // Key this harness taps its wire frames under in debug.ts.
  wireScope?(ws: WorkspaceEntry): string
  // Lines for the /status introspection page.
  statusLines?(now: number): string[]
}
