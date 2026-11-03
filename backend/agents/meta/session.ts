import type { ApprovalResponse, SessionApproval } from '@/shared/types'
import { resolveMetaModel } from '@/shared/meta-models'
import { approvalFromParams, validateApprovalChoice, type ApprovalParams } from './approvals'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import {
  MspError,
  type FoldedItem,
  type Session as MuseSession,
  type Turn as MuseTurn
} from '@muse-code/sdk'

import type { PreviewBlock, StreamEvent } from '@/shared/format'
import { renderQuintContext } from '@/shared/quint-context'
import type {
  MetaSessionState,
  RequestUsage,
  SessionActivity,
  SessionContextUsage,
  SessionTodo,
  SessionUsage,
  UserInputPrompt,
  UserInputQuestionAnswer,
  WorkspaceEntry
} from '@/shared/types'

import { broadcast } from '../../state'
import { resolveRenamedSession } from '../../sessions/selected'
import { getSessionEntries, getSessionEntry, updateSessionEntry } from '../../sessions/store'
import { requestUsageSince } from './request-usage'
import type { PreparedAttachmentMessage } from '../../sessions/attachment-message'
import type { SendMessageInput, SessionLifecycle } from '../types'
import { itemToTurn } from './adapter'
import {
  getCachedMetaRuntime,
  getMetaRuntime,
  listMetaSessions,
  listMetaModels,
  onMetaNotification,
  type MetaRuntime
} from './client'
import type { MetaNotification } from './protocol'

type SendTurnOptions = Parameters<MuseSession['sendUserTurn']>[0]
type TurnInputPart = SendTurnOptions['input'][number]
type TurnEffort = SendTurnOptions['reasoningEffort']

const REASONING_EFFORTS = new Set([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra'
])

type MetaSession = {
  runtime: MetaRuntime
  workspaceId: string
  workspacePath: string
  sessionId: string
  muse: MuseSession
  activity: SessionActivity
  model?: string
  activeTurnId?: string
  queuedTurnIds: Set<string>
  approvals: Map<string, SessionApproval>
  questions: Map<string, UserInputPrompt>
  todo: SessionTodo | null
  context: SessionContextUsage | null
  usage: SessionUsage | null
  requestUsage?: RequestUsage
  requestBaseline?: SessionUsage
  attention: string[]
  lastUserText?: string
  updatedAt: number
}

type WorkspacePreview = { firstUserMessage?: string; updatedAt?: number }

const sessions = new Map<string, MetaSession>()
const openingSessions = new Map<string, Promise<MetaSession>>()
const previewCache = new Map<string, WorkspacePreview>()

function previewPath(workspacePath: string): string {
  return join(workspacePath, '.quint', '.cache', 'meta-preview.json')
}

async function readCachedPreview(workspacePath: string): Promise<WorkspacePreview> {
  try {
    const parsed = JSON.parse(await Bun.file(previewPath(workspacePath)).text())
    if (parsed && typeof parsed === 'object') {
      return {
        ...(typeof parsed.firstUserMessage === 'string'
          ? { firstUserMessage: parsed.firstUserMessage }
          : {}),
        ...(typeof parsed.updatedAt === 'number' ? { updatedAt: parsed.updatedAt } : {})
      }
    }
  } catch {}
  return previewCache.get(workspacePath) ?? {}
}

async function writeCachedPreview(workspacePath: string, preview: WorkspacePreview): Promise<void> {
  previewCache.set(workspacePath, preview)
  try {
    await Bun.write(previewPath(workspacePath), JSON.stringify(preview))
  } catch {}
}

function key(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

function metaState(session: MetaSession): MetaSessionState {
  return {
    approvals: [...session.approvals.values()],
    questions: [...session.questions.values()],
    todo: session.todo,
    context: session.context,
    usage: session.usage,
    requestUsage: session.requestUsage
  }
}

function publishMetaState(session: MetaSession): void {
  broadcast(session.workspaceId, {
    type: 'meta_state',
    sessionId: session.sessionId,
    state: metaState(session)
  })
}

function activityFor(session: MetaSession): SessionActivity {
  if (session.approvals.size > 0 || session.questions.size > 0 || session.attention.length > 0)
    return 'requires-action'
  if (session.activeTurnId || session.queuedTurnIds.size > 0) return 'running'
  return 'idle'
}

function syncActivity(session: MetaSession): void {
  const activity = activityFor(session)
  if (session.activity === activity) return
  session.activity = activity
  session.updatedAt = Date.now()
  broadcast(session.workspaceId, {
    type: 'status',
    sessionId: session.sessionId,
    activity
  })
}

function publishActivity(session: MetaSession, activity: SessionActivity): void {
  session.activity = activity
  session.updatedAt = Date.now()
  broadcast(session.workspaceId, {
    type: 'status',
    sessionId: session.sessionId,
    activity
  })
}

function promptFromParams(params: {
  userInputId: string
  itemId: string
  toolCallId: string
  toolName: string
  turnId: string
  autoResolutionMs?: number
  questions: {
    id: string
    header: string
    question: string
    options: {
      label: string
      description?: string
      preview?: { content: string; format: string }
    }[]
    selection: { mode: 'single' | 'multiple'; minSelections?: number; maxSelections?: number }
  }[]
}): UserInputPrompt {
  return {
    userInputId: params.userInputId,
    itemId: params.itemId,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    turnId: params.turnId,
    ...(params.autoResolutionMs !== undefined ? { autoResolutionMs: params.autoResolutionMs } : {}),
    questions: params.questions.map(question => ({
      id: question.id,
      header: question.header,
      question: question.question,
      options: question.options.map(option => ({
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
        ...(option.preview ? { preview: option.preview } : {})
      })),
      selection: { ...question.selection }
    }))
  }
}

function todoFromParams(params: {
  items?: { text?: string; activeForm?: string; status?: string }[]
  sourceTool?: string
}): SessionTodo | null {
  const items = (params.items ?? []).flatMap(item => {
    if (typeof item.text !== 'string') return []
    const status =
      item.status === 'inProgress'
        ? 'in_progress'
        : item.status === 'in_progress' ||
            item.status === 'completed' ||
            item.status === 'cancelled' ||
            item.status === 'pending'
          ? item.status
          : 'pending'
    return [
      {
        text: item.text,
        status: status as SessionTodo['items'][number]['status'],
        ...(item.activeForm ? { activeForm: item.activeForm } : {})
      }
    ]
  })
  return items.length > 0 ? { items, sourceTool: params.sourceTool ?? '' } : null
}

function usageFromParams(params: {
  cumulative?: {
    promptTokens?: number
    outputTokens?: number
    totalTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    cost?: { usd?: number; partial?: boolean }
  }
}): SessionUsage | null {
  const cumulative = params.cumulative
  if (!cumulative) return null
  return {
    promptTokens: cumulative.promptTokens ?? 0,
    outputTokens: cumulative.outputTokens ?? 0,
    totalTokens: cumulative.totalTokens ?? 0,
    ...(cumulative.cacheReadTokens !== undefined
      ? { cacheReadTokens: cumulative.cacheReadTokens }
      : {}),
    ...(cumulative.cacheWriteTokens !== undefined
      ? { cacheWriteTokens: cumulative.cacheWriteTokens }
      : {}),
    ...(typeof cumulative.cost?.usd === 'number'
      ? { cost: { usd: cumulative.cost.usd, partial: cumulative.cost.partial === true } }
      : {})
  }
}

function seedMetaState(session: MetaSession): void {
  session.approvals = new Map(
    session.muse.fold.pendingApprovals().map(entry => {
      const approval = approvalFromParams(
        (entry.latestUpdate ?? entry.requested) as ApprovalParams,
        approvalFromParams(entry.requested as ApprovalParams)
      )
      return [approval.approvalId, approval]
    })
  )
  const input = session.muse.fold.pendingUserInputs()
  session.questions = new Map(
    input.map(params => [
      params.userInputId,
      promptFromParams(params as unknown as Parameters<typeof promptFromParams>[0])
    ])
  )
  const todo = session.muse.fold.sessionState.get('session/todoListChanged') as
    | Parameters<typeof todoFromParams>[0]
    | null
    | undefined
  session.todo = todo ? todoFromParams(todo) : null
  const context = session.muse.fold.sessionState.get('session/contextUsage') as
    | { usedTokens?: number; windowTokens?: number; pressure?: string }
    | null
    | undefined
  session.context = context
    ? {
        usedTokens: context.usedTokens ?? 0,
        ...(context.windowTokens !== undefined ? { windowTokens: context.windowTokens } : {}),
        pressure: context.pressure ?? 'normal'
      }
    : null
  const usage = session.muse.fold.sessionState.get('session/tokenUsage') as
    | Parameters<typeof usageFromParams>[0]
    | null
    | undefined
  session.usage = usage ? usageFromParams(usage) : null
  session.attention = ((session.muse.opening?.result.session.attention ?? []) as string[]).slice()
  session.activeTurnId = session.muse.fold.activeTurnId ?? undefined
  session.activity = activityFor(session)
}

function sessionFor(workspacePath: string, sessionId: string): MetaSession | undefined {
  for (const session of sessions.values()) {
    if (session.workspacePath === workspacePath && session.sessionId === sessionId) return session
  }
  return undefined
}

function handleMetaNotification(workspacePath: string, notification: MetaNotification): void {
  const params = notification.params as Record<string, unknown> | undefined
  if (notification.method === 'session/started' || notification.method === 'session/closed') {
    const row = params?.session as { sessionId?: unknown } | undefined
    const changedId =
      typeof row?.sessionId === 'string'
        ? row.sessionId
        : typeof params?.sessionId === 'string'
          ? params.sessionId
          : undefined
    const owner = [...sessions.values()].find(session => session.workspacePath === workspacePath)
    if (owner && changedId)
      broadcast(owner.workspaceId, { type: 'sessions_changed', sessionId: changedId })
    return
  }
  const sessionId = typeof params?.sessionId === 'string' ? params.sessionId : undefined
  if (!sessionId) return
  const session = sessionFor(workspacePath, sessionId)
  if (!session) return

  switch (notification.method) {
    case 'approval/requested':
    case 'approval/updated': {
      const approval = approvalFromParams(
        params as unknown as ApprovalParams,
        session.approvals.get(String(params?.approvalId))
      )
      session.approvals.set(approval.approvalId, approval)
      syncActivity(session)
      publishMetaState(session)
      return
    }
    case 'approval/resolved': {
      if (typeof params?.approvalId === 'string') session.approvals.delete(params.approvalId)
      syncActivity(session)
      publishMetaState(session)
      return
    }
    case 'session/nameChanged':
    case 'session/listChanged':
      broadcast(session.workspaceId, { type: 'sessions_changed', sessionId })
      return
    case 'session/statusChanged': {
      session.attention = Array.isArray(params?.attention) ? (params.attention as string[]) : []
      if (params?.status === 'idle') session.activeTurnId = undefined
      syncActivity(session)
      return
    }
    case 'session/todoListChanged':
      session.todo = todoFromParams(params as unknown as Parameters<typeof todoFromParams>[0])
      publishMetaState(session)
      return
    case 'session/contextUsage':
      session.context = {
        usedTokens: Number(params?.usedTokens ?? 0),
        ...(typeof params?.windowTokens === 'number' ? { windowTokens: params.windowTokens } : {}),
        pressure: String(params?.pressure ?? 'normal')
      }
      publishMetaState(session)
      return
    case 'session/tokenUsage':
      session.usage = usageFromParams(params as unknown as Parameters<typeof usageFromParams>[0])
      if (
        session.requestUsage &&
        session.requestUsage.turnId === params?.turnId &&
        session.requestBaseline &&
        session.usage
      ) {
        session.requestUsage.usage = requestUsageSince(session.requestBaseline, session.usage)
      }
      publishMetaState(session)
      return
    case 'userInput/requested': {
      const prompt = promptFromParams(params as unknown as Parameters<typeof promptFromParams>[0])
      session.questions.set(prompt.userInputId, prompt)
      syncActivity(session)
      publishMetaState(session)
      return
    }
    case 'userInput/settled': {
      if (typeof params?.userInputId === 'string') session.questions.delete(params.userInputId)
      syncActivity(session)
      publishMetaState(session)
      return
    }
    case 'turn/started': {
      if (typeof params?.turnId === 'string') {
        if (session.requestUsage?.turnId !== params.turnId) {
          session.requestBaseline = session.usage ?? {
            promptTokens: 0,
            outputTokens: 0,
            totalTokens: 0
          }
          session.requestUsage = { turnId: params.turnId, status: 'running', usage: null }
          publishMetaState(session)
        }
        session.activeTurnId = params.turnId
        session.queuedTurnIds.delete(params.turnId)
        syncActivity(session)
      }
      return
    }
    case 'turn/completed': {
      if (session.requestUsage && session.requestUsage.turnId === params?.turnId) {
        session.requestUsage = { ...session.requestUsage, status: 'completed' }
        void updateSessionEntry(
          { id: session.workspaceId, path: session.workspacePath },
          sessionId,
          { lastRequestUsage: session.requestUsage }
        ).catch(() => undefined)
      }
      if (session.activeTurnId === params?.turnId) session.activeTurnId = undefined
      if (typeof params?.turnId === 'string') session.queuedTurnIds.delete(params.turnId)
      for (const [id, prompt] of session.questions) {
        if (prompt.turnId === params?.turnId) session.questions.delete(id)
      }
      syncActivity(session)
      publishMetaState(session)
      return
    }
    case 'turn/unqueued': {
      if (typeof params?.turnId === 'string') session.queuedTurnIds.delete(params.turnId)
      syncActivity(session)
      return
    }
  }
}

onMetaNotification(handleMetaNotification)

function openSession(
  runtime: MetaRuntime,
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  sessionId: string,
  isNew: boolean,
  modelId?: string,
  lifecycle?: SessionLifecycle
): Promise<MetaSession> {
  const sessionKey = key(workspace.id, sessionId)
  const pending = openingSessions.get(sessionKey)
  if (pending) return pending
  const opening = openSessionInner(
    runtime,
    workspace,
    sessionId,
    isNew,
    modelId,
    lifecycle
  ).finally(() => openingSessions.delete(sessionKey))
  openingSessions.set(sessionKey, opening)
  return opening
}

async function openSessionInner(
  runtime: MetaRuntime,
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  sessionId: string,
  isNew: boolean,
  modelId?: string,
  lifecycle?: SessionLifecycle
): Promise<MetaSession> {
  const existing = sessions.get(key(workspace.id, sessionId))
  if (existing?.runtime === runtime) return existing
  if (existing) sessions.delete(key(workspace.id, sessionId))

  const base = {
    workspaceRoot: workspace.path,
    ...(modelId ? { modelId } : {})
  }
  const startOptions = { ...base, approvalMode: 'onRequest' as const }
  let muse: MuseSession
  let realSessionId = sessionId
  if (isNew) {
    // Muse requires a UUIDv7 session id; the client's temporary chat id is a
    // UUIDv4. Let the host mint the durable id and rekey the chat afterwards.
    muse = await runtime.client.startSession(startOptions)
    realSessionId = muse.sessionId
    if (realSessionId !== sessionId) {
      if (!lifecycle) throw new Error('Session rename handler is required')
      await lifecycle.renamed(workspace, sessionId, realSessionId)
    }
  } else {
    muse = await runtime.client.resumeSession({ ...base, sessionId })
    await runtime.connection.command('session/setApprovalMode', { sessionId, mode: 'onRequest' })
  }

  const session: MetaSession = {
    runtime,
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    sessionId: realSessionId,
    muse,
    activity: 'idle',
    queuedTurnIds: new Set(),
    approvals: new Map(),
    questions: new Map(),
    todo: null,
    context: null,
    usage: null,
    attention: [],
    ...(isNew && modelId ? { model: modelId } : {}),
    updatedAt: Date.now()
  }
  seedMetaState(session)
  const saved = await getSessionEntry(workspace, realSessionId)
  const latestTurn = muse.fold.turns().at(-1)
  if (session.activeTurnId) {
    session.requestUsage = { turnId: session.activeTurnId, status: 'running', usage: null }
  } else if (saved.lastRequestUsage?.turnId === latestTurn?.turnId) {
    session.requestUsage = saved.lastRequestUsage
  }
  sessions.set(key(workspace.id, realSessionId), session)
  runtime.sessions.set(realSessionId, muse)
  return session
}

function buildInput(prepared: PreparedAttachmentMessage, fallbackText: string): TurnInputPart[] {
  const parts: TurnInputPart[] = []
  if (prepared.text) parts.push({ type: 'text', text: prepared.text })
  for (const attachment of prepared.attachments) {
    if (attachment.type === 'image' && 'data' in attachment) {
      parts.push({
        type: 'image',
        mediaType: attachment.mediaType,
        base64Data: attachment.data.toString('base64')
      })
    }
  }
  if (parts.length === 0) parts.push({ type: 'text', text: fallbackText })
  return parts
}

function effortFor(input: SendMessageInput): TurnEffort | undefined {
  return input.effort && REASONING_EFFORTS.has(input.effort)
    ? (input.effort as TurnEffort)
    : undefined
}

function previewBlocks(
  state: Map<string, { text: string; reasoning: string }>,
  itemId: string,
  field: string | undefined,
  delta: string
): PreviewBlock[] | null {
  const entry = state.get(itemId) ?? { text: '', reasoning: '' }
  if (!field || field === 'text') entry.text += delta
  else if (field === 'summary' || field.startsWith('summary.')) entry.reasoning += delta
  else return null
  state.set(itemId, entry)

  const blocks: PreviewBlock[] = []
  if (entry.reasoning)
    blocks.push({ index: blocks.length, kind: 'reasoning', text: entry.reasoning })
  if (entry.text) blocks.push({ index: blocks.length, kind: 'text', text: entry.text })
  return blocks.length ? blocks : null
}

async function hydrateOutput(session: MetaSession, item: FoldedItem): Promise<FoldedItem> {
  if (!item.truncated || item.visibleOutput === undefined || !item.outputRef) return item
  if (item.outputRef.availability !== 'available' || item.outputRef.byteLen > 256 * 1024)
    return item
  try {
    const result = (await session.runtime.connection.request('item/readOutput', {
      sessionId: session.sessionId,
      itemId: item.itemId,
      outputRef: item.outputRef.id
    })) as { content?: unknown; encoding?: unknown }
    if (result.encoding !== 'utf8' || typeof result.content !== 'string') return item
    return { ...item, visibleOutput: result.content, truncated: false }
  } catch {
    return item
  }
}

async function pumpTurn(
  session: MetaSession,
  turn: MuseTurn,
  model?: string,
  optimisticId?: string
): Promise<void> {
  const previews = new Map<string, { text: string; reasoning: string }>()
  let echoItemId: string | undefined
  let started = false
  const publishItem = async (raw: FoldedItem) => {
    if (!started) {
      started = true
      if (session.activeTurnId !== turn.turnId) {
        session.activeTurnId = turn.turnId
        session.queuedTurnIds.delete(turn.turnId)
        syncActivity(session)
      }
    }
    const item = await hydrateOutput(session, raw)
    if (item.kind === 'userMessage' && echoItemId === undefined) echoItemId = item.itemId
    const rendered = itemToTurn(item, {
      ...(optimisticId && item.kind === 'userMessage' && echoItemId === item.itemId
        ? { optimisticId }
        : {}),
      ...(model ? { model } : {})
    })
    if (!rendered) return
    broadcast(session.workspaceId, {
      kind: 'turn',
      sessionId: session.sessionId,
      turn: rendered
    })
  }

  const items = (async () => {
    for await (const item of turn.items()) await publishItem(item)
  })()
  const deltas = (async () => {
    for await (const delta of turn.deltas()) {
      const blocks = previewBlocks(previews, delta.itemId, delta.field, delta.delta)
      if (!blocks) continue
      broadcast(session.workspaceId, {
        type: 'preview',
        sessionId: session.sessionId,
        messageId: delta.itemId,
        parentToolUseId: null,
        blocks
      })
    }
  })()

  await Promise.all([items, deltas])
  const outcome = await turn.completed
  if (outcome.kind === 'completed' && outcome.params.terminal === 'failed') {
    const message =
      outcome.params.error?.message ?? outcome.params.reason ?? 'Muse Code turn failed'
    broadcast(session.workspaceId, {
      kind: 'error',
      sessionId: session.sessionId,
      content: message
    })
  }
  if (session.activeTurnId === turn.turnId) session.activeTurnId = undefined
  session.queuedTurnIds.delete(turn.turnId)
  syncActivity(session)
}

export async function sendMetaMessage(
  input: SendMessageInput,
  lifecycle?: SessionLifecycle
): Promise<void> {
  let session: MetaSession | undefined
  let queued = false
  try {
    const models = await listMetaModels(input.workspacePath)
    const model = resolveMetaModel(models, input.model)
    const runtime = await getMetaRuntime(input.workspacePath)
    session = await openSession(
      runtime,
      { id: input.workspaceId, path: input.workspacePath },
      input.sessionId,
      input.isNew,
      model,
      lifecycle
    )
    session.lastUserText = input.content
    queued = session.activity === 'running' || Boolean(session.activeTurnId)
    if (session.questions.size === 0 && session.approvals.size === 0)
      publishActivity(session, 'running')

    if (session.model !== model) {
      await runtime.connection.command('session/setModel', {
        sessionId: session.sessionId,
        model: { modelId: model }
      })
      session.model = model
    }

    const { prepareAttachmentMessage } = await import('../../sessions/attachment-message')
    const prepared = prepareAttachmentMessage(
      input.workspaceId,
      input.content,
      input.attachments ?? []
    )
    if (input.context) {
      const context = renderQuintContext(input.context)
      prepared.text = prepared.text ? `${prepared.text}\n\n${context}` : context
    }
    const modelDefaults = models.find(row => row.value === model)
    const effort = effortFor({ ...input, effort: input.effort ?? modelDefaults?.defaultEffort })
    const turn = await session.muse.sendUserTurn({
      input: buildInput(prepared, input.content),
      displayText: input.content,
      ifBusy: 'queue',
      ...(effort ? { reasoningEffort: effort } : {})
    })
    if (queued && session.activeTurnId !== turn.turnId) {
      session.queuedTurnIds.add(turn.turnId)
      syncActivity(session)
    }
    void pumpTurn(session, turn, model, input.optimisticId).catch(error => {
      session!.queuedTurnIds.delete(turn.turnId)
      if (session!.activeTurnId === turn.turnId) session!.activeTurnId = undefined
      syncActivity(session!)
      broadcast(input.workspaceId, {
        kind: 'error',
        sessionId: session!.sessionId,
        terminal: session!.activity !== 'running',
        content: error instanceof Error ? error.message : 'Muse Code turn failed'
      })
    })
  } catch (error) {
    if (session) {
      if (queued) syncActivity(session)
      else publishActivity(session, 'idle')
    }
    throw error
  }
}

export async function respondMetaApproval(input: ApprovalResponse): Promise<void> {
  const sessionId = resolveRenamedSession(input.workspaceId, input.sessionId)
  const session = sessions.get(key(input.workspaceId, sessionId))
  if (!session) throw new Error('Approval is no longer available')
  validateApprovalChoice(session.approvals.get(input.approvalId), input)
  await session.runtime.connection.command('approval/decide', {
    sessionId,
    approvalId: input.approvalId,
    requirementId: input.requirementId,
    choiceId: input.choiceId
  })
  // Only the host's updated/resolved event can remove an approval. A decision
  // may accept one stage while leaving the next stage waiting for review.
}

export async function respondMetaQuestion(input: {
  workspaceId: string
  sessionId: string
  userInputId: string
  action: 'answer' | 'cancel' | 'clarify'
  answers?: UserInputQuestionAnswer[]
  reason?: string
  clarification?: string
}): Promise<void> {
  const sessionId = resolveRenamedSession(input.workspaceId, input.sessionId)
  const session = sessions.get(key(input.workspaceId, sessionId))
  if (!session) throw new Error('Question is no longer available')
  const runtime = await getMetaRuntime(session.workspacePath)
  try {
    if (input.action === 'answer') {
      await session.muse.answerUserInput(
        input.userInputId,
        (input.answers ?? []) as Parameters<MuseSession['answerUserInput']>[1]
      )
    } else if (input.action === 'clarify') {
      await runtime.connection.command('userInput/clarify', {
        sessionId: session.sessionId,
        userInputId: input.userInputId,
        clarification: { content: input.clarification ?? '', format: 'text' }
      })
    } else {
      await runtime.connection.command('userInput/cancel', {
        sessionId: session.sessionId,
        userInputId: input.userInputId,
        ...(input.reason ? { reason: input.reason } : {})
      })
    }
    session.questions.delete(input.userInputId)
    syncActivity(session)
    publishMetaState(session)
  } catch (error) {
    if (error instanceof MspError && (error.code === -32055 || error.code === -32056)) {
      session.questions.delete(input.userInputId)
      syncActivity(session)
      publishMetaState(session)
      return
    }
    throw error
  }
}

export async function interruptMetaRun(workspaceId: string, rawSessionId: string): Promise<void> {
  const sessionId = resolveRenamedSession(workspaceId, rawSessionId)
  const session = sessions.get(key(workspaceId, sessionId))
  if (!session) return
  const runtime = await getMetaRuntime(session.workspacePath).catch(() => undefined)
  const queued = [...session.queuedTurnIds]
  const questions = [...session.questions.keys()]
  session.queuedTurnIds.clear()
  session.questions.clear()
  session.approvals.clear()
  if (runtime) {
    await Promise.all([
      ...questions.map(userInputId =>
        runtime.connection
          .command('userInput/cancel', {
            sessionId: session.sessionId,
            userInputId,
            reason: 'Stopped by the user'
          })
          .catch(() => undefined)
      ),
      ...queued.map(turnId =>
        runtime.connection
          .command('turn/unqueue', { sessionId: session.sessionId, turnId })
          .catch(() => undefined)
      ),
      runtime.connection
        .command('turn/interrupt', {
          sessionId: session.sessionId,
          ...(session.activeTurnId ? { turnId: session.activeTurnId } : {})
        })
        .catch(() => undefined)
    ])
  }
  session.activeTurnId = undefined
  publishActivity(session, 'idle')
  publishMetaState(session)
  broadcast(workspaceId, { kind: 'stopped', sessionId })
}

export function getMetaActiveSessions(): {
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}[] {
  return [...sessions.values()]
    .filter(session => session.activity !== 'idle')
    .map(({ workspaceId, sessionId, activity }) => ({ workspaceId, sessionId, activity }))
}

export async function listMetaSessionsForWorkspace(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>
): Promise<Awaited<ReturnType<typeof listMetaSessions>>> {
  const entries = await getSessionEntries(workspace)
  const archived = new Set(
    Object.entries(entries)
      .filter(([, entry]) => entry.archived)
      .map(([sessionId]) => sessionId)
  )
  const rows = (await listMetaSessions(workspace.path)).filter(row => !archived.has(row.sessionId))
  const latest = rows[0]
  if (latest) {
    previewCache.set(workspace.path, {
      firstUserMessage: latest.summary,
      ...(latest.lastModified > 0 ? { updatedAt: latest.lastModified } : {})
    })
  }
  return rows
}

export async function getMetaSessionEvents(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  rawSessionId: string
): Promise<StreamEvent[]> {
  const sessionId = resolveRenamedSession(workspace.id, rawSessionId)
  const runtime = await getMetaRuntime(workspace.path)
  const session = await openSession(runtime, workspace, sessionId, false)
  const events: StreamEvent[] = []
  for (const item of session.muse.fold.items.list()) {
    const turn = itemToTurn(item, {
      ...(session.model ? { model: session.model } : {})
    })
    if (turn) events.push({ kind: 'turn', turn })
  }
  return events
}

export async function getMetaSessionState(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  rawSessionId: string
): Promise<MetaSessionState> {
  const sessionId = resolveRenamedSession(workspace.id, rawSessionId)
  const runtime = await getMetaRuntime(workspace.path)
  return metaState(await openSession(runtime, workspace, sessionId, false))
}

export async function getMetaWorkspacePreview(
  workspace: Pick<WorkspaceEntry, 'path'>,
  includeFirstUserMessage: boolean
): Promise<{ firstUserMessage?: string; updatedAt?: number }> {
  const runtime = await getCachedMetaRuntime(workspace.path)?.catch(() => undefined)
  if (!runtime) {
    const cached = await readCachedPreview(workspace.path)
    return {
      ...(includeFirstUserMessage && cached.firstUserMessage
        ? { firstUserMessage: cached.firstUserMessage }
        : {}),
      ...(cached.updatedAt !== undefined ? { updatedAt: cached.updatedAt } : {})
    }
  }
  const rows = await listMetaSessions(workspace.path).catch(() => [])
  const latest = rows[0]
  if (!latest) return previewCache.get(workspace.path) ?? {}
  const preview = {
    firstUserMessage: latest.summary,
    ...(latest.lastModified > 0 ? { updatedAt: latest.lastModified } : {})
  }
  await writeCachedPreview(workspace.path, preview)
  return includeFirstUserMessage
    ? preview
    : { ...(preview.updatedAt !== undefined ? { updatedAt: preview.updatedAt } : {}) }
}

export async function forkMetaSession(
  workspace: Pick<WorkspaceEntry, 'path'>,
  sessionId: string
): Promise<string> {
  const runtime = await getMetaRuntime(workspace.path)
  const result = await runtime.connection.command('session/fork', { sessionId })
  const session = result.session as { sessionId?: unknown } | undefined
  if (typeof session?.sessionId !== 'string') throw new Error('Muse Code did not return a fork id')
  return session.sessionId
}

export async function archiveMetaSession(
  workspace: Pick<WorkspaceEntry, 'id' | 'path'>,
  sessionId: string
): Promise<void> {
  await updateSessionEntry(workspace, sessionId, { archived: true })
  previewCache.delete(workspace.path)
  await rm(previewPath(workspace.path), { force: true }).catch(() => undefined)
}

export function forgetMetaWorkspace(workspacePath: string): void {
  for (const [sessionKey, session] of sessions) {
    if (session.workspacePath === workspacePath) sessions.delete(sessionKey)
  }
  previewCache.delete(workspacePath)
}

export function forgetAllMetaSessions(): void {
  sessions.clear()
  previewCache.clear()
}

export function metaStatusLines(): string[] {
  const active = getMetaActiveSessions()
  return [
    `live Meta sessions  ${sessions.size}`,
    `live Meta runs  ${active.length}`,
    ...active.map(run => `  ▶ ${run.activity}  ws=${run.workspaceId}  session=${run.sessionId}`)
  ]
}
