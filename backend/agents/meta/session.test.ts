import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Session } from '@muse-code/sdk'
import type { Turn } from '@muse-code/sdk'
import * as runtimeClient from './client'
import type { MetaRuntime } from './client'
import * as state from '../../state'
import { DEFAULT_WORKSPACE_STATE_ROOT, setWorkspaceStateRoot } from '../../workspace-storage'
import {
  forgetAllMetaSessions,
  getMetaSessionState,
  getMetaSessionEvents,
  listMetaSessionsForWorkspace,
  interruptMetaRun,
  sendMetaMessage
} from './session'

let directory: string
let session: Session
let runtime: MetaRuntime
let commands: { method: string; params: Record<string, unknown> }[]
let restores: (() => void)[] = []
const start = mock(async (_options: unknown) => session)
const resume = mock(async (_options: unknown) => session)
let send: ReturnType<typeof spyOn<Session, 'sendUserTurn'>>
let broadcast: ReturnType<typeof spyOn<typeof state, 'broadcast'>>

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'quint-meta-session-'))
  setWorkspaceStateRoot(join(directory, 'state'))
  session = new Session({ sessionId: 'native-session', durability: { kind: 'durable' } })
  commands = []
  start.mockClear()
  resume.mockClear()
  start.mockImplementation(async () => session)
  resume.mockImplementation(async () => session)
  // Only the process boundary is replaced. The SDK session/fold and Quint's
  // lifecycle, attachment preparation, persistence and model checks stay real.
  runtime = {
    workspacePath: directory,
    sessions: new Map(),
    client: { startSession: start, resumeSession: resume },
    connection: {
      command: async (method: string, params: Record<string, unknown>) => {
        commands.push({ method, params })
        return {}
      }
    }
  } as unknown as MetaRuntime
  const getRuntime = spyOn(runtimeClient, 'getMetaRuntime').mockResolvedValue(runtime)
  const catalog = spyOn(runtimeClient, 'listMetaModels').mockResolvedValue([
    { value: 'default', resolvedModel: 'muse-spark-1.3', displayName: 'Default' },
    { value: 'muse-spark-1.3', displayName: 'Muse Spark', defaultEffort: 'medium' }
  ])
  send = spyOn(session, 'sendUserTurn').mockResolvedValue({
    turnId: 'turn-1',
    items: async function* () {},
    deltas: async function* () {},
    completed: Promise.resolve({ kind: 'completed', params: { terminal: 'completed' } })
  } as unknown as Turn)
  broadcast = spyOn(state, 'broadcast').mockImplementation(() => {})
  restores = [
    () => getRuntime.mockRestore(),
    () => catalog.mockRestore(),
    () => send.mockRestore(),
    () => broadcast.mockRestore()
  ]
})
afterEach(async () => {
  forgetAllMetaSessions()
  for (const restore of restores) restore()
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(directory, { recursive: true, force: true })
})
function input(isNew = true, model?: string) {
  return {
    workspaceId: 'workspace',
    workspacePath: directory,
    sessionId: 'native-session',
    isNew,
    content: 'Hello',
    model
  }
}

test('creates a native session with a concrete eligible model and approvals enabled', async () => {
  await sendMetaMessage(input())
  expect(start).toHaveBeenCalledWith({
    workspaceRoot: directory,
    modelId: 'muse-spark-1.3',
    approvalMode: 'onRequest'
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    (await getMetaSessionState({ id: 'workspace', path: directory }, 'native-session')).approvals
  ).toEqual([])
  await interruptMetaRun('workspace', 'native-session')
  expect(commands.some(command => command.method === 'turn/interrupt')).toBe(true)
})

test('a resumed session explicitly receives the approved model before sending', async () => {
  await sendMetaMessage(input(false))
  expect(resume).toHaveBeenCalledTimes(1)
  expect(commands.map(command => command.method)).toEqual([
    'session/setApprovalMode',
    'session/setModel'
  ])
  expect(commands[1].params.model).toEqual({ modelId: 'muse-spark-1.3' })
  expect(send).toHaveBeenCalledTimes(1)
})

test('rejects an unsupported model without starting or sending a session', async () => {
  await expect(sendMetaMessage(input(true, 'unrelated-1'))).rejects.toThrow(
    'Choose an available Meta model'
  )
  expect(start).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(
    broadcast.mock.calls.filter(([, frame]) => 'kind' in frame && frame.kind === 'error')
  ).toHaveLength(0)
})

test('resume failures preserve history identity instead of silently starting a new chat', async () => {
  resume.mockRejectedValueOnce(new Error('Session not found'))
  await expect(sendMetaMessage(input(false))).rejects.toThrow('Session not found')
  expect(start).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(
    broadcast.mock.calls.filter(([, frame]) => 'kind' in frame && frame.kind === 'error')
  ).toHaveLength(0)
})

test('history failures propagate instead of replacing the cached chat with an empty transcript', async () => {
  resume.mockRejectedValueOnce(new Error('Session not found'))
  await expect(
    getMetaSessionEvents({ id: 'workspace', path: directory }, 'missing')
  ).rejects.toThrow('Session not found')
  expect(start).not.toHaveBeenCalled()
})

test('chat list failures propagate instead of erasing the cached history list', async () => {
  const listing = spyOn(runtimeClient, 'listMetaSessions').mockRejectedValue(
    new Error('Runtime disconnected')
  )
  try {
    await expect(
      listMetaSessionsForWorkspace({ id: 'workspace', path: directory })
    ).rejects.toThrow('Runtime disconnected')
  } finally {
    listing.mockRestore()
  }
})

test('sends the moderate catalog default and preserves an explicit thinking choice', async () => {
  await sendMetaMessage(input())
  expect(send.mock.calls[0]?.[0].reasoningEffort).toBe('medium')
  await sendMetaMessage({ ...input(false), effort: 'high' })
  expect(send.mock.calls[1]?.[0].reasoningEffort).toBe('high')
})

test('a native startup rejection reaches the quintlet service and retains the failed build', async () => {
  const { createPendingQuintlet, getPendingQuintlet } = await import('../../sessions/pending-quintlets')
  const { submitQuintlet, QuintletStartupError } = await import('../../sessions/quintlet-sessions')
  const workspace = { id: 'workspace', path: directory, type: 'meta' as const, addedAt: '' }
  const quintlet = await createPendingQuintlet(workspace)
  send.mockRejectedValueOnce(new Error('Runtime disconnected'))
  await expect(
    submitQuintlet(workspace, quintlet.id, {
      requirements: 'Build a dashboard',
      sessionId: 'native-session'
    })
  ).rejects.toBeInstanceOf(QuintletStartupError)
  const failed = await getPendingQuintlet(workspace, quintlet.id)
  expect(failed).toMatchObject({
    status: 'failed',
    buildSessionId: 'native-session',
    error: 'Runtime disconnected'
  })
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    broadcast.mock.calls.filter(([, frame]) => 'kind' in frame && frame.kind === 'error')
  ).toHaveLength(0)
})

test('native renames move application references before the browser is notified', async () => {
  const { sessionService } = await import('../../sessions/service')
  const { updateWorkspaceState, readWorkspaceState } = await import('../../workspace-storage')
  const { resolveRenamedSession, forgetSessionRenames } = await import('../../sessions/selected')
  const workspace = { id: 'workspace', path: directory, type: 'meta' as const, addedAt: '' }
  forgetSessionRenames()
  try {
    await updateWorkspaceState(workspace, state => {
      state.selected.dashboard = 'temporary'
      state.pinnedSessionId = 'temporary'
      state.sessions.temporary = { config: { effort: 'low' } }
    })
    await sessionService.send(workspace, { ...input(), sessionId: 'temporary' })
    const saved = await readWorkspaceState(workspace)
    expect(saved.selected.dashboard).toBe('native-session')
    expect(saved.pinnedSessionId).toBe('native-session')
    expect(saved.sessions['native-session']?.config?.effort).toBe('low')
    expect(saved.sessions.temporary).toBeUndefined()
    expect(resolveRenamedSession(workspace.id, 'temporary')).toBe('native-session')
    expect(broadcast).toHaveBeenCalledWith(workspace.id, {
      type: 'session_renamed',
      from: 'temporary',
      to: 'native-session'
    })
  } finally {
    forgetSessionRenames()
  }
})
