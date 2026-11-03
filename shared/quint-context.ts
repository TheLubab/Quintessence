import type { AppletKind, WorkspaceTabId } from './types'
import { isParamsRecord } from './workspace-tabs'

const QUINT_CONTEXT_OPEN = '<quint-context>'
const QUINT_CONTEXT_CLOSE = '</quint-context>'
// Start of the first line inside the tag. Doubles as the strip guard: a user
// literally typing `<quint-context>` in their message won't have their text
// eaten. Keep this phrase byte-stable when rewording the envelope.
const QUINT_CONTEXT_MARKER = 'You are running in a `quint` workspace'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

// A chat message fired from applet UI (`sendChatMessage`) rather than typed.
// Identity is stamped host-side from the bridge the applet was attached with.
export type AppletContext = {
  kind: AppletKind
  id: string
}

export type SessionContext = {
  id: string
  tabId?: WorkspaceTabId
  pinned: boolean
}

export type TabContext = {
  id: WorkspaceTabId
  title?: string
  // URL parameters of the currently visible quintlet, when present.
  params?: Record<string, unknown>
}

// The structured form built at send time — by the client for chat sends, by
// the server for programmatic pending-quintlet sends. Extend this (and
// `renderQuintContext`) when new ambient fields land.
export type QuintContext = {
  // The workspace tab the user is on when they hit send.
  // Omitted for programmatic sends when the visible tab is unknown.
  activeTab?: TabContext
  // Set when this message came from applet UI instead of the composer.
  applet?: AppletContext
  // Added by the server before sending to the harness.
  session?: SessionContext
  // One-shot imperative lines for this message only (e.g. pending-quintlet build
  // instructions from shared/quintlet-build-directives.ts).
  directives?: string[]
}

// Cap on ambient quintlet params rendered into the workspace envelope.
const MAX_TAB_PARAMS_CHARS = 2000

// Applet-authored strings (quintlet titles, applet names, quintlet params) get
// interpolated into the envelope, and applet code is agent-authored — a
// crafted value containing `</quint-context>` would otherwise close the envelope
// early and forge sections the host never wrote. Escaping `<` defuses every
// such value at once: inside JSON it is the standard `<` string escape
// (same string, no tag), and in prose the model reads it the same.
function escapeTags(text: string): string {
  return text.replaceAll('<', '\\u003c')
}

// Render an applet-authored record for the envelope, or null when there's
// nothing worth printing. Non-serializable values (cycles, BigInt) drop rather
// than throw mid-send.
function renderTabParams(value: Record<string, unknown>): string | null {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return null
  }
  if (!json || json === '{}') return null
  const capped =
    json.length > MAX_TAB_PARAMS_CHARS
      ? `${json.slice(0, MAX_TAB_PARAMS_CHARS)}… (truncated)`
      : json
  return escapeTags(capped)
}

function describeApplet(applet: AppletContext): string {
  const id = escapeTags(applet.id)
  const directory = applet.kind === 'quintlet' ? 'quintlets' : 'widgets'
  return `The "${id}" ${applet.kind} (.quint/${directory}/${id}.tsx)`
}

// Describe a tab using the labels the user sees in the tab bar. A quintlet
// tab also names its backing file: the user speaks in
// titles ("fix the Grading review page") while the agent edits
// `.quint/quintlets/<id>.tsx` — this line connects the two.
function describeTab(tab: Pick<TabContext, 'id' | 'title'>): string {
  // Titles come from applet config, so they carry the same forgery risk as any
  // other applet-authored string in here.
  const title = tab.title === undefined ? undefined : escapeTags(tab.title)
  if (tab.id === 'dashboard') return 'the "Dashboard" tab'
  if (tab.id === 'canvas') return 'the "Canvas" tab'
  if (tab.id.startsWith('quintlets/')) {
    const id = escapeTags(tab.id.slice('quintlets/'.length))
    return `the "${title ?? id}" quintlet tab (.quint/quintlets/${id}.tsx)`
  }
  return `the "${escapeTags(tab.id)}" tab`
}

export function renderQuintContextBody(ctx: QuintContext): string {
  const preamble = [
    `${QUINT_CONTEXT_MARKER} — a shared UI the user chats with you from, which you can extend and customize.`,
    'For workspace changes or Quint commands, read the **`quint-workspace` skill** unless you already read it in this chat. Ordinary conversation does not require loading workspace guides or running tools.',
    'For requested image generation or editing, use `quint image` (see `quint image --help`) and show its returned markdown in chat. Report access or generation errors rather than silently substituting SVG.'
  ].join('\n')
  const sections: string[] = []
  const appletIsActiveQuintlet =
    ctx.applet?.kind === 'quintlet' && ctx.activeTab?.id === `quintlets/${ctx.applet.id}`
  if (ctx.activeTab) {
    const tabLines = [`The user is on ${describeTab(ctx.activeTab)}.`]
    if (appletIsActiveQuintlet) tabLines.push('This quintlet sent the message above from its UI.')
    const tabParams = ctx.activeTab.params ? renderTabParams(ctx.activeTab.params) : null
    if (tabParams) tabLines.push(`Params it is rendering with right now: ${tabParams}`)
    sections.push(`# Active tab\n${tabLines.join('\n')}`)
  }
  if (ctx.applet && !appletIsActiveQuintlet) {
    sections.push(
      `# Applet message\n${describeApplet(ctx.applet)} sent the message above from its UI.`
    )
  }
  if (ctx.session) {
    const sessionLines = [`Session id: \`${escapeTags(ctx.session.id)}\``]
    if (ctx.session.tabId) {
      sessionLines.push(
        ctx.session.tabId === ctx.activeTab?.id
          ? 'This chat belongs to the active tab.'
          : `This chat belongs to ${describeTab({ id: ctx.session.tabId })}.`
      )
    }
    sessionLines.push(`Pinned: ${ctx.session.pinned ? 'yes' : 'no'}.`)
    sections.push(`# Session\n${sessionLines.join('\n')}`)
  }
  if (ctx.directives?.length) {
    sections.push(`# This message only\n${ctx.directives.join('\n')}`)
  }
  const footer = [
    'IMPORTANT: This context comes from Quint, not from the user, and the user does not see it.',
    'Only the newest workspace and chat state is current. Do not respond to this block directly.',
    'Keep build requests and unfinished work in task summaries and compaction; omit the ambient workspace and chat context.'
  ].join('\n')
  return [preamble, ...sections, footer].join('\n\n')
}

export function renderQuintContext(ctx: QuintContext): string {
  return `${QUINT_CONTEXT_OPEN}\n${renderQuintContextBody(ctx)}\n${QUINT_CONTEXT_CLOSE}`
}

// Wire-shape guard for the chat frame's `context` field (see web.ts).
export function isQuintContext(value: unknown): value is QuintContext {
  if (!isParamsRecord(value)) return false
  const v = value as {
    activeTab?: unknown
    applet?: unknown
    session?: unknown
    directives?: unknown
  }
  return (
    (v.activeTab === undefined || isTabContext(v.activeTab)) &&
    (v.applet === undefined || isAppletContext(v.applet)) &&
    (v.session === undefined || isSessionContext(v.session)) &&
    (v.directives === undefined ||
      (Array.isArray(v.directives) && v.directives.every(d => typeof d === 'string')))
  )
}

function isTabContext(value: unknown): value is TabContext {
  if (!isParamsRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.params === undefined || isParamsRecord(value.params))
  )
}

function isAppletContext(value: unknown): value is AppletContext {
  if (!isParamsRecord(value)) return false
  return (
    (value.kind === 'quintlet' || value.kind === 'widget') &&
    typeof value.id === 'string' &&
    value.id.length > 0
  )
}

function isSessionContext(value: unknown): value is SessionContext {
  if (!isParamsRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.tabId === undefined || typeof value.tabId === 'string') &&
    typeof value.pinned === 'boolean'
  )
}

export function quintContextSystemReminder(contextText: string): string {
  return `${SYSTEM_REMINDER_OPEN}\n${contextText}\n${SYSTEM_REMINDER_CLOSE}`
}

export function appendQuintContext(text: string, contextText: string): string {
  return text ? `${text}\n\n${contextText}` : contextText
}

export function stripQuintContext(text: string): string {
  let out = text
  for (;;) {
    const next = stripOneQuintContext(out)
    if (next === out) return out
    out = next
  }
}

function stripOneQuintContext(text: string): string {
  const start = text.indexOf(QUINT_CONTEXT_OPEN)
  if (start === -1) return text
  const end = text.indexOf(QUINT_CONTEXT_CLOSE, start)
  if (end === -1) return text
  if (!text.slice(start, end).includes(QUINT_CONTEXT_MARKER)) return text
  let before = text.slice(0, start)
  let after = text.slice(end + QUINT_CONTEXT_CLOSE.length)
  if (
    before.trimEnd().endsWith(SYSTEM_REMINDER_OPEN) &&
    after.trimStart().startsWith(SYSTEM_REMINDER_CLOSE)
  ) {
    before = before.trimEnd().slice(0, -SYSTEM_REMINDER_OPEN.length)
    after = after.trimStart().slice(SYSTEM_REMINDER_CLOSE.length)
  }
  return `${before.trim()}\n\n${after.trim()}`.trim()
}

// For truncated snippets (session-list / home-card previews): like
// `stripQuintContext`, but also cuts an envelope (or its system-reminder
// wrapper) left unterminated by mid-envelope truncation. Skips the marker
// guard — cutting a preview short on a user-typed literal tag is harmless,
// unlike eating chat-bubble text.
export function stripQuintContextLoose(text: string): string {
  let stripped = stripQuintContext(text)
  const open = stripped.indexOf(QUINT_CONTEXT_OPEN)
  if (open !== -1) stripped = stripped.slice(0, open)
  const reminder = stripped.indexOf(SYSTEM_REMINDER_OPEN)
  if (reminder !== -1) stripped = stripped.slice(0, reminder)
  return stripped.trimEnd()
}
