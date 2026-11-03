import type { PreviewBlock, StreamEvent } from './format'
import type { AppIconId } from './app-icons'
import type { QuintContext } from './quint-context'
import type { WorkspaceTheme } from './themes'
import type { AttachmentInput, WidgetConfig } from 'quint'

export type { AttachmentInput, QuintletConfig, WidgetConfig } from 'quint'

// A custom UI unit embedded in a workspace.
export type AppletKind = 'quintlet' | 'widget'

// What a bundled applet's `quint` module may call on its host-attached bridge.
// Inputs stay unknown at this trust boundary; the browser host narrows them.
export type AppletBridge = {
  addChatAttachment: (input: unknown) => void
  navigate: (url: unknown) => void
  resolveUrl: (url: unknown) => string
  sendChatMessage: (input: unknown, context?: unknown) => void
}

export type AppletInfo = {
  id: string
  // Content revision of the built bundle (`<size>-<mtime>` of index.js).
  // Absent when the build output cannot be statted.
  revision?: string
}

export type WidgetInfo = AppletInfo & {
  config: WidgetConfig
}

// A quintlet is a full-screen, agent-authored "app" (`.quint/quintlets/<name>.tsx`),
// shown one-at-a-time in the workspace nav. Same build/RPC machinery as a
// widget, minus the grid: no sizing, the quintlet owns its own layout and scroll.
export type PendingQuintlet = {
  id: string
  status: 'draft' | 'starting' | 'submitted' | 'failed'
  title?: string
  icon?: string
  requirements: string
  // The chat running the build: usually the quintlet tab's own chat, or the
  // pinned chat when one is pinned. Ownership lives in the chat's `tabId`.
  buildSessionId?: string
  error?: string
}

export type CompiledQuintlet = {
  id: string
  status: 'compiled'
  title: string
  icon?: string
  requiredEnv?: string[]
  revision?: string
}

export type QuintletInfo = PendingQuintlet | CompiledQuintlet

// ---- Applet error journal (see docs/applet-runtime.md) ------------------

// Where an applet error was observed. `build` and `rpc` are recorded
// server-side (bundle pipeline, RPC route); `load`/`render`/`window`/`runtime`
// are browser-side and reach the journal via POST
// /api/workspaces/:id/applet-log. `runtime` is the applet API refusing a
// request rather than code throwing — a `navigate` to a quintlet that no longer
// exists, a `sendChatMessage` dropped by the rate limit — which the applet's
// own code never sees.
export type AppletLogSource = 'build' | 'load' | 'render' | 'window' | 'rpc' | 'runtime'

// One journal entry, as returned to `quint debug logs`. `kind`/`name` attribute
// the applet when known; `module`/`fn` pin down the server function for `rpc`
// entries. `count` dedups repeats of the identical error (crash loops are one
// line, not a hundred); `ts` is the LAST occurrence.
export type AppletLogEntry = {
  ts: number
  source: AppletLogSource
  kind?: AppletKind
  name?: string
  module?: string
  fn?: string
  message: string
  stack?: string
  count: number
}

// The browser-reported subset (the server-side sources can't be spoofed by a
// tab — the POST route rejects them). `kind`/`name` are optional because a
// `runtime` entry may have no applet to blame: a stale bookmark pointing at a
// deleted quintlet is the host redirecting, not an applet misbehaving.
export type AppletClientErrorSource = 'load' | 'render' | 'window' | 'runtime'
export type AppletClientError = {
  source: AppletClientErrorSource
  kind?: AppletKind
  name?: string
  message: string
  stack?: string
}

// A Canvas draw/view operation issued by `quint canvas`. Mutations run
// server-side against a headless tldraw store; `view` relays to a live tab. The
// server assigns each add op a `name` (the `--id`, or a generated one) so the
// derived tldraw shape id is deterministic and addressable later. Arrow endpoints
// bind to a shape (by name) or sit at a free point. See docs/quint-canvas.md.
export type CanvasPoint = { x: number; y: number }
export type CanvasArrowEnd = { name: string } | CanvasPoint

// The Canvas's color palette — the same six swatches the UI toolbar offers,
// so the agent can only paint what the user can. The CLI also accepts an arbitrary
// hex and snaps it to the nearest of these (tldraw shapes hold a palette color, not
// free hex).
export type CanvasColor = 'black' | 'grey' | 'blue' | 'green' | 'yellow' | 'red'

// tldraw's DefaultSizeStyle, exposed under two friendlier CLI names for the two
// shapes that use it: arrows take `--stroke small|large` (line weight), text &
// notes take `--font-size regular|big` (label size). Both map onto the same
// underlying tldraw size — `small`/`regular` → 'm', `large`/`big` → 'xl'.
export type CanvasSize = 'm' | 'xl'

// Fill style for rectangles — the UI toolbar's four options. The CLI takes
// `none|semi|pattern|solid`; ops carry the tldraw DefaultFillStyle value. Note the
// tldraw quirk (see defaultFills / FILL_OPTIONS in frontend/features/canvas/canvas-controls.tsx):
// fill value 'solid' paints the lighter "semi" color, while 'fill' paints the true
// solid (body === border). Keep the names in sync with that frontend list.
export type CanvasFill = 'none' | 'solid' | 'pattern' | 'fill'

// Optional styling carried by every add op. Omitted fields fall back to the
// shape's tldraw default. `size` is set from `--stroke` (arrows) or `--font-size`
// (text/notes); `fill` from `--fill` (rectangles).
export type CanvasStyle = { color?: CanvasColor; size?: CanvasSize; fill?: CanvasFill }

// Resize preset for `add image`: 'lo' caps the long side smaller (default, keeps
// the canvas light), 'hi' allows more pixels when detail matters.
export type CanvasImageQuality = 'lo' | 'hi'

export type CanvasOp =
  | ({ kind: 'add-text'; name: string; x: number; y: number; text: string } & CanvasStyle)
  | ({
      kind: 'add-rect'
      name: string
      x: number
      y: number
      w: number
      h: number
      text?: string
    } & CanvasStyle)
  | ({ kind: 'add-note'; name: string; x: number; y: number; text: string } & CanvasStyle)
  // Add an image from a local file `path` — the server resizes it to fit the
  // canvas and embeds it (color/stroke don't apply, so no CanvasStyle).
  // `quality` picks the resize preset: 'lo' (default, smaller) or 'hi' (sharper).
  | {
      kind: 'add-image'
      name: string
      x: number
      y: number
      path: string
      quality?: CanvasImageQuality
    }
  | ({
      kind: 'add-arrow'
      name: string
      from: CanvasArrowEnd
      to: CanvasArrowEnd
      // Right-angle (orthogonal) routing for clean diagrams; default is a curved arc.
      elbow?: boolean
    } & CanvasStyle)
  | { kind: 'move'; name: string; x: number; y: number }
  | { kind: 'set'; name: string; text: string }
  | { kind: 'delete'; name: string }
  | { kind: 'clear' }
  | { kind: 'view' }

// What a tab returns after running an op: a shape's `name` for add ops, a PNG
// data URL for `view`, or a bare ack for mutations.
export type CanvasOpResult = { name: string } | { image: string } | { ok: true }

// The process that last persisted `.quint/.canvas.json` (always the server —
// browser saves funnel through it). Stamped on save so an older reader hitting
// the snapshot can name the version it needs (see shared/canvas-skew.ts).
export type CanvasWriter = { quint: string; tldraw: string }

// Attachments: caller input → upload receipt → send reference → resolved data.
// Text skips uploading. Origin and drawing purpose follow the attachment.
export type DrawingPurpose = 'annotation' | 'sketch'

// Host-stamped ID of the applet or workspace tab that created the attachment.
export type AttachmentOrigin = { source: string }

export type TextAttachment = Partial<AttachmentOrigin> & { label: string; text: string }

type FileAttachment = Partial<AttachmentOrigin> & {
  mediaType: string
  path: string
  // Only set when the file contains a drawing image.
  purpose?: DrawingPurpose
}

type ImageAttachment = Partial<AttachmentOrigin> & {
  mediaType: string
  label: string
  purpose?: DrawingPurpose
}

// Resolved payloads: JSON-safe data shared by prompts and transcript replay.
export type Attachment =
  | ({ type: 'text' } & TextAttachment)
  | ({ type: 'file' } & FileAttachment)
  | ({ type: 'image' } & ImageAttachment)

// Caller input: text or a browser file / workspace-relative path.
export type TextAttachmentInput = Omit<Extract<AttachmentInput, { type: 'text' }>, 'type'>

// Upload receipt: returned by the upload API before sending the message.
// Bytes or an absolute file path live in the server's workspace-scoped store.
export type UploadKind = 'image' | 'file'
export type UploadInfo = {
  id: string
  kind: UploadKind
  // Normalized media type (images are re-encoded to a vision-safe type).
  mediaType: string
  filename: string
  size: number
  // Pixel dimensions, for images only — lets the composer reserve space.
  width?: number
  height?: number
}

// Send reference: inline text or an upload ID for the server to resolve.
// Drawing purpose belongs to this message's use of the uploaded image.
export type MessageAttachment =
  | ({ type: 'text' } & TextAttachment)
  | ({ type: 'upload'; uploadId: string; purpose?: DrawingPurpose } & Partial<AttachmentOrigin>)

// Client → server messages, routed by workspaceId over the shared WebSocket.
export type ClientMessage =
  | ApprovalResponse
  | {
      type: 'chat'
      workspaceId: string
      content: string
      sessionId: string
      isNew: boolean
      // Text and upload references for this turn. The server resolves uploads
      // and describes all attachments together, preserving their order.
      attachments?: MessageAttachment[]
      // Client-chosen stable id for the user's turn. The server tells the
      // adapter to use this id when the SDK echoes the user input back, so
      // the optimistic bubble the client rendered gets upserted in place.
      optimisticId?: string
      // Model id to run this turn with (from the picker / `supportedModels()`
      // `value`). Omitted means the server's default. Applied per turn, so it
      // can change between messages in the same session.
      model?: string
      // Reasoning effort for this turn (one of the model's `supportedEffortLevels`).
      // Omitted means the provider default. The Meta runtime applies changes before
      // the next send.
      effort?: string
      // Opt into the selected model's faster processing mode. Omitted inherits
      // the provider configuration; false explicitly disables a stored default.
      fastMode?: boolean
      stream?: boolean
      // Structured quint context (shared/quint-context.ts): ambient workspace state
      // snapshotted at send time, assembled by
      // frontend/features/workspace/quint-context.ts. The server renders it per
      // harness; display paths strip the rendered envelope from bubbles.
      context?: QuintContext
    }
  | { type: 'stop'; workspaceId: string; sessionId: string }
  | {
      type: 'question_response'
      workspaceId: string
      sessionId: string
      userInputId: string
      action: 'answer'
      answers: UserInputQuestionAnswer[]
    }
  | {
      type: 'question_response'
      workspaceId: string
      sessionId: string
      userInputId: string
      action: 'cancel'
      reason?: string
    }
  | {
      type: 'question_response'
      workspaceId: string
      sessionId: string
      userInputId: string
      action: 'clarify'
      clarification: string
    }
  // Reply to a relayed Canvas op (see CanvasOpMessage). Carries the
  // op's correlation id so the server settles the right pending CLI request.
  | { type: 'canvas:op-result'; opId: string; result?: CanvasOpResult; error?: string }

// Session details supplied by the agent backend.
export type SessionSummary = {
  sessionId: string
  summary: string
  lastModified: number
  cwd?: string
  origin?: { provider: string; label?: string }
  // Session flavor beyond a plain chat: scheduled cron runs and spawned
  // subagent sessions get a badge in the chat selector.
  flavor?: 'chat' | 'cron' | 'subagent'
}

// Per-chat agent settings, overriding the workspace defaults in
// `.quint/.workspace.json`. A chat reopens with the model/effort/Fast mode it
// last ran with; a brand-new chat is seeded from the workspace defaults.
export type SessionConfig = {
  model?: string
  effort?: string
  fastMode?: boolean
}

export type SessionFork = {
  fromSessionId: string
  // Last copied turn in the child. Without a cutoff, show its full history.
  throughMessageId?: string
  noticeIds?: string[]
}

// Quint's own record of one chat. Titles and history stay with the agent.
export type WorkspaceSessionState = {
  // The quintlet tab that owns this chat; absent means the dashboard.
  tabId?: WorkspaceTabId
  config?: SessionConfig
  fork?: SessionFork
  // Meta has no native archive verb; Quint hides the row and leaves the log.
  archived?: boolean
  lastRequestUsage?: RequestUsage
}

// Per-user chat state for one workspace, kept in Quint's data dir and served by
// GET /api/workspaces/:id/state. Every write returns it and publishes it as
// `state:changed`.
export type WorkspaceState = {
  // Goes up by one with every saved change. Lets clients drop an older copy
  // that arrives after a newer one.
  revision: number
  // Applies to every tab and overrides `selected`.
  pinnedSessionId?: string
  // The chat each tab shows.
  selected: Partial<Record<WorkspaceTabId, string>>
  sessions: Record<string, WorkspaceSessionState>
  // Quintlets not compiled yet, keyed by quintlet id.
  pendingQuintlets: Record<string, Omit<PendingQuintlet, 'id'>>
}

// A chat-list row: the agent's session plus the tab that owns it.
export type SessionInfo = SessionSummary & { tabId?: WorkspaceTabId }

// App-wide settings, persisted server-side as `settings.json` in Quint's data
// dir and exposed via GET/PATCH /api/settings. Every key has a default, so
// GET always returns a complete object.
export type AppSettings = {
  // Apply bundled workspace-skill updates automatically when a workspace
  // with outdated skills is opened, instead of prompting each time.
  autoUpdateSkills: boolean
}

// Frontend-safe startup config, served by GET /api/config. Deployment settings
// come from config.json and QUINT_* env overrides; experimental flags come from
// explicit CLI options. See backend/app-config.ts.
export type AppEnvironment = 'local' | 'cloud'

export type FrontendAppConfig = {
  environment: AppEnvironment
  // Demo mode: workspace creation is blocked; the UI offers the
  // cloud-demo promo dialog instead.
  demo: boolean
  // Link target for the cloud-demo promo dialog.
  demoInstallUrl: string
}

export type UpdateStatus = {
  runningVersion: string
  availableVersion: string | null
}

export type UpdateResult = {
  installedVersion: string
}

// Re-export the display format
export type {
  Citation,
  Part,
  PreviewBlock,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  StreamPreview,
  SubagentRecord,
  SubagentStatus,
  SystemNotice,
  ToolCall,
  ToolCaller,
  ToolState,
  Turn,
  TurnMeta,
  TurnOrigin,
  ViewState
} from './format'

// Server → Client messages.
// The chat socket is app-wide, so every conversation frame carries both a
// `workspaceId` and a `sessionId` — the client routes each frame to the right
// `(workspaceId, sessionId)` slice of its cache.
export type ServerMessage =
  | (StreamEvent & { sessionId: string; workspaceId: string })
  | PreviewFrame
  | StatusMessage
  | MetaStateMessage
  | SessionRenamedMessage
  | SessionsChangedMessage
  | SessionArchivedMessage
  | WorkspaceSwitchMessage
  | ErrorFrame
  | StoppedFrame
  | StatusSnapshotMessage
  | CanvasOpMessage

// A live token-by-token snapshot of an assistant message still being generated.
// Ephemeral: it is NOT a StreamEvent, never persisted, and never folded into the
// durable transcript (React Query cache). The client keeps it in a separate
// ephemeral store and discards it the instant the real `turn` for `messageId`
// lands. `blocks[].text` is CUMULATIVE, so a lost/reordered/duplicated frame is
// simply overwritten by the next one — it can never corrupt the transcript.
export type PreviewFrame = {
  type: 'preview'
  workspaceId: string
  sessionId: string
  // API message id (`msg_...`), globally unique — the accumulator key, so
  // concurrent streams (parallel subagents) never collide. Matches the eventual
  // turn's `meta.apiMessageId`, which is how the client clears this preview.
  messageId: string
  // null = top-level assistant; a tool_use id = a subagent's nested stream.
  parentToolUseId: string | null
  blocks: PreviewBlock[]
}

// A Canvas op relayed to the tab(s) showing `workspaceId`'s canvas. Only
// `view` travels this way now (rendering needs the browser); mutations run
// server-side. The tab with a live editor for that workspace executes it and
// replies with a matching `canvas:op-result` (correlated by `opId`).
export type CanvasOpMessage = {
  type: 'canvas:op'
  workspaceId: string
  opId: string
  op: CanvasOp
}

// Frame as constructed by callers of `broadcast(workspaceId, frame)` — the
// `workspaceId` is stamped on by `broadcast`, so callers omit it.
export type BroadcastFrame =
  | (StreamEvent & { sessionId: string })
  | Omit<PreviewFrame, 'workspaceId'>
  | Omit<StatusMessage, 'workspaceId'>
  | Omit<MetaStateMessage, 'workspaceId'>
  | Omit<SessionRenamedMessage, 'workspaceId'>
  | Omit<SessionsChangedMessage, 'workspaceId'>
  | Omit<SessionArchivedMessage, 'workspaceId'>
  | Omit<ErrorFrame, 'workspaceId'>
  | Omit<StoppedFrame, 'workspaceId'>

// Sent to a client right after it connects (and re-broadcast periodically): the
// authoritative set of non-idle sessions across all workspaces. The client
// treats it as ground truth — any session NOT listed is marked idle — which
// clears a spinner whose terminal `status` frame was lost (disconnect window,
// dropped frame, harness gap).
export type StatusSnapshotMessage = {
  type: 'status_snapshot'
  sessions: { workspaceId: string; sessionId: string; activity: SessionActivity }[]
}

export type WorkspaceSwitchMessage = {
  type: 'workspace:switch'
  workspaceId: string
}

export type WorkspaceType = 'meta'

export type WorkspaceSkillStatus = {
  name: string
  installed: string | null
  bundled: string | null
}

export type WorkspaceSkillsStatus = {
  skills: WorkspaceSkillStatus[]
  updateAvailable: boolean
}

export type WorkspaceSkillsUpdateFailure = WorkspaceSkillsStatus & {
  error: string
}

export type HarnessInstallations = Record<WorkspaceType, boolean>

// Setup checks only runtime availability. Workspace checks may also report
// that the provider needs a login the host can start.
export type HarnessAvailability =
  | { status: 'available' }
  | { status: 'login-required'; reason: string }
  | { status: 'unavailable'; reason: string; code?: 'not-installed' }

// Public instructions for an in-progress harness login. Credentials stay in the CLI.
export type HarnessLogin = {
  id: string
  url: string
  codeUrl?: string
  userCode?: string
}

// The global auth endpoint exposes startup separately from usable sign-in instructions.
// The connection panel polls this state until sign-in completes or fails.
export type HarnessLoginState =
  | { state: 'starting' }
  | ({ state: 'pending' } & HarnessLogin)
  | { state: 'failed'; reason: string }

export type WorkspaceIcon =
  | { type: 'emoji'; value: string; background?: 'theme' }
  | { type: 'glyph'; value: AppIconId; background?: 'theme' }
  | { type: 'upload'; value: string }

// One MCP server's connection status, as surfaced by GET /api/workspaces/:id/mcp
// (a subset of the agent SDK's McpServerStatus — only what the UI renders).
export type McpServerState = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'

export type McpServer = {
  name: string
  status: McpServerState
}

export type WorkspaceEntry = {
  id: string
  path: string
  addedAt: string
  type?: WorkspaceType
  name?: string
  // Workspace icon override. Undefined uses the workspace name initial.
  icon?: WorkspaceIcon
  // Merged in from the layout so app-wide workspace lists can paint a themed
  // icon without inheriting the active workspace's color.
  theme?: WorkspaceTheme
  // Home-relative rendering of `path` (e.g. "~/projects/notes"). Set by the
  // server on the wire — clients render it as-is.
  displayPath?: string
  // Runtime-supplied metadata captured at add time. "lastRunAt" is a snapshot,
  // not live — refresh on demand if it ever needs to stay accurate.
  lastRunAt?: string
}

export type DiscoveredWorkspace = {
  path: string
  displayPath?: string
  // Deduplicated in canonical provider order; empty for folders without agent history.
  types: WorkspaceType[]
}

export type SessionRenamedMessage = {
  type: 'session_renamed'
  workspaceId: string
  from: string
  to: string
}

export type SessionsChangedMessage = {
  type: 'sessions_changed'
  workspaceId: string
  sessionId: string
}

export type SessionArchivedMessage = {
  type: 'session_archived'
  workspaceId: string
  sessionId: string
}

export type ErrorFrame = {
  kind: 'error'
  workspaceId: string
  sessionId: string
  content: string
  // A failed steer or interrupt leaves the current run active. Older senders
  // omit this field and retain terminal-error behavior.
  terminal?: boolean
}

export type StoppedFrame = {
  kind: 'stopped'
  workspaceId: string
  sessionId: string
}

export type SessionActivity = 'idle' | 'running' | 'requires-action'

export type StatusMessage = {
  type: 'status'
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}

export type UserInputSelectionMode = 'single' | 'multiple'

export type UserInputOption = {
  label: string
  description?: string
  preview?: { content: string; format: string }
}

export type UserInputQuestion = {
  id: string
  header: string
  question: string
  options: UserInputOption[]
  selection: { mode: UserInputSelectionMode; minSelections?: number; maxSelections?: number }
}

export type UserInputPrompt = {
  userInputId: string
  itemId: string
  toolCallId: string
  toolName: string
  turnId: string
  questions: UserInputQuestion[]
  autoResolutionMs?: number
}

export type UserInputQuestionAnswer =
  | { questionId: string; selectedLabel: string; note?: string }
  | { questionId: string; selectedLabels: string[]; note?: string }
  | { questionId: string; freeText: string; note?: string }

export type SessionTodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export type SessionTodo = {
  items: { text: string; activeForm?: string; status: SessionTodoStatus }[]
  sourceTool: string
}

export type SessionContextUsage = {
  usedTokens: number
  windowTokens?: number
  pressure: 'normal' | 'warning' | 'blocked' | (string & {})
}

export type SessionUsage = {
  promptTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  cost?: { usd: number; partial: boolean }
}

export type MetaSessionState = {
  approvals: SessionApproval[]
  questions: UserInputPrompt[]
  todo: SessionTodo | null
  context: SessionContextUsage | null
  usage: SessionUsage | null
  requestUsage?: RequestUsage
}

export type SessionApproval = {
  approvalId: string
  requirementId: { approvalId: string; sourceIndex: number }
  toolName: string
  description: string
  choices: { choiceId: string; label: string; scope: string; rulePreview?: string }[]
}

export type ApprovalResponse = {
  type: 'approval_response'
  workspaceId: string
  sessionId: string
  approvalId: string
  requirementId: { approvalId: string; sourceIndex: number }
  choiceId: string
}

export type RequestUsage = {
  turnId: string
  status: 'running' | 'completed'
  usage: SessionUsage | null
}

export type MetaStateMessage = {
  type: 'meta_state'
  workspaceId: string
  sessionId: string
  state: MetaSessionState
}

// Workspace layout persistence
export type LayoutGridItem = {
  i: string
  x: number
  y: number
  // Optional user-set span. Undefined falls back to the widget's configured span.
  w?: number
  h?: number
}

export type WorkspaceTabId = 'dashboard' | 'canvas' | `quintlets/${string}`

// Open tabs plus the workspace's saved DEFAULT tab. `active` is not live focus
// state — the live active tab is each browser tab's URL (`/workspace/:id/<tab>`).
// The saved default answers one question: where a bare `/workspace/:id` lands
// (and which row `quint tabs` marks). Navigating writes it, so it tracks the last
// tab switch, last writer wins across clients.
export type WorkspaceTabsState = {
  open: WorkspaceTabId[]
  active: WorkspaceTabId
}

export type { ColorTheme, FontTheme, RadiusTheme, ThemeAppearance, WorkspaceTheme } from './themes'

export type WorkspaceLayoutSave = Omit<WorkspaceLayout, 'tabs'> & { tabs?: WorkspaceTabsState }

export type QuickAccessLink = {
  id: string
  title: string
  url: string
}

export type WorkspaceLayout = {
  version: 1
  widgetGrid: LayoutGridItem[]
  // External shortcuts shown alongside quintlets in the Quick access widget.
  quickAccessLinks?: QuickAccessLink[]
  // Open tabs and the workspace's saved default tab.
  // `open` order is persisted so future drag-reordering has one source of truth.
  tabs: WorkspaceTabsState
  // User-set display-name override. When empty/undefined the API falls back to
  // the workspace folder name, so the resolved name always comes from the API.
  name?: string
  // Workspace icon override. Emoji and glyphs may use a themed background.
  icon?: WorkspaceIcon
  selectedModel?: string
  // Reasoning-effort default for new sessions (a `supportedEffortLevels` value).
  selectedEffort?: string
  // Fast-mode default for new sessions. Undefined inherits the provider setting.
  selectedFastMode?: boolean
  theme?: WorkspaceTheme
}

// One applet's thumbnail freshness record. Image bytes live as files in the
// workspace's `.quint/.cache/thumbnails/` (backend/applet-engine/thumbnails.ts), never in
// `.workspace.json` — the layout file stays small and commit-safe.
export type AppletThumbnail = {
  kind: AppletKind
  id: string
  revision: string
  capturedAt: string
  viewedAt: string
  // How long the last successful capture took on this client, in ms. Lets the
  // capture hook skip routine re-captures of applets that are slow to
  // screenshot (see SLOW_CAPTURE_MS) instead of janking the main thread.
  captureMs?: number
}

export type AppletThumbnailUpdate = {
  id: string
  revision: string
  // A string replaces the stored image, null records a failed or skipped
  // attempt (the previous image survives), undefined only touches recency.
  image?: string | null
  captureMs?: number
}

export type AppletThumbnailBatch = {
  kind: AppletKind
  thumbnails: AppletThumbnailUpdate[]
}

// Home-screen workspace card preview: widgets in grid order, then recent quintlets,
// capped to the loose stack's visible depth. A workspace with no captured
// applets may instead carry its oldest session's first message.
export type WorkspacePreview = {
  thumbnails: string[]
  firstUserMessage?: string
  updatedAt?: number
  theme?: WorkspaceLayout['theme']
}

// One effective env var, as surfaced by GET /api/workspaces/:id/env. Values are
// NEVER returned — the API masks both `.env` and custom secrets, so editing is
// write-only. Presence in the list (with `source`) is all the UI needs.
export type WorkspaceEnvVar = {
  key: string
  // `dotenv`: only from a `.env` file. `custom`: only a UI-managed secret.
  // `both`: a custom secret shadowing a `.env` value (custom wins).
  source: 'dotenv' | 'custom' | 'both'
  // The `.env` files that declare this key (when dotenv-sourced).
  files?: string[]
}

// GET /api/workspaces/:id/env payload — the env view for the settings UI.
export type WorkspaceEnvView = {
  vars: WorkspaceEnvVar[]
  // Discovered `.env` files with how many keys each holds (values masked).
  files: { file: string; count: number }[]
  inheritDotenv: boolean
  // Where custom secrets are stored: the OS keychain (Bun.secrets) when
  // available, else a 0600 file fallback. Surfaced so the UI can warn.
  backend: 'keychain' | 'file'
  // Keys declared via widget `config.requiredEnv`, with whether they're visible
  // to widgets in the effective env and which widgets asked for them.
  required: { key: string; satisfied: boolean; widgets: string[] }[]
}

export type Model = {
  value: string
  resolvedModel?: string
  displayName: string
  description?: string
  group?: string
  providerId?: string
  supportsEffort?: boolean
  supportedEffortLevels?: string[]
  defaultEffort?: string
  supportsAdaptiveThinking?: boolean
  supportsFastMode?: boolean
  // Provider-resolved default when quint has no stored Fast-mode preference.
  defaultFastMode?: boolean
  supportsAutoMode?: boolean
}

// GET /api/workspaces/:id/agent. Model changes arrive on refetch;
// `harness:updated` events refresh availability.
export type WorkspaceAgent = {
  workspaceFolderMissing?: boolean
  // The agent backend that produced this snapshot — matches the workspace
  // provider.
  provider: WorkspaceType
  // Runtime presence and provider auth state, from the server-side cache.
  availability: HarnessAvailability
  models: Model[]
  supportsStreaming?: boolean
  // Whether the provider can archive chats from the chat selector.
  supportsArchiving?: boolean
}
