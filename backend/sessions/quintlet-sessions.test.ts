import { sessionService } from './service'
import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  readWorkspaceState,
  setWorkspaceStateRoot,
  updateWorkspaceState
} from '../workspace-storage'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceEntry, WorkspaceTabId } from '@/shared/types'
import { renderQuintContext } from '@/shared/quint-context'
import { allHarnesses, harnessFor } from '../agents/registry'
import type { SendMessageInput } from '../agents/types'
import { ForkUnsupportedError } from '../agents/fork'
import { createQuintletFromSession, submitQuintlet, failInterruptedQuintletStarts } from './quintlet-sessions'
import {
  createPendingQuintlet,
  getPendingQuintlet,
  listPendingQuintlets,
  updatePendingQuintlet,
  completeQuintletBuild,
  discardPendingQuintlet,
  startQuintletBuild,
  patchPendingQuintlet
} from './pending-quintlets'
import { getSessionEntry, updateSessionEntry } from './store'
import {
  forgetSessionRenames,
  getPinnedSession,
  pinSession,
  saveSelectedSession,
  unpinSession
} from './selected'
import { renameSessionReferences } from './lifecycle'
import { getSessionConfig, saveSessionConfig } from './config'
import { setEventServer } from '../events'
import { getClientFrameLog } from '../agents/debug'
const harness = harnessFor('meta')
const original = {
  forkSession: harness.forkSession,
  sendMessage: harness.sendMessage,
  listSessions: harness.listSessions,
  sessionEvents: harness.sessionEvents,
  activeSessions: harness.activeSessions,
  interrupt: harness.interrupt,
  archiveSession: harness.archiveSession
}
let dir: string
let ws: WorkspaceEntry
let sent: SendMessageInput[]
let events: unknown[]
let forks: number
let archived: string[]
let stopped: string[]
const selectedIn = async (tabId: WorkspaceTabId = 'dashboard') =>
  (await readWorkspaceState(ws)).selected[tabId]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'quint-quintlet-sessions-'))
  ws = { id: 'test', path: dir, type: 'meta', addedAt: '' }
  setWorkspaceStateRoot(join(dir, 'state'))
  forgetSessionRenames()
  sent = []
  events = []
  forks = 0
  archived = []
  stopped = []
  harness.interrupt = async (_, sessionId) => {
    stopped.push(sessionId)
  }
  harness.archiveSession = async (_, sessionId) => {
    expect(stopped).toContain(sessionId)
    archived.push(sessionId)
  }
  setEventServer({ publish: (_topic, text) => events.push(JSON.parse(text)) })
  harness.listSessions = async () => [{ sessionId: 'source', summary: 'Source', lastModified: 1 }]
  harness.activeSessions = () => [{ workspaceId: ws.id, sessionId: 'source', activity: 'running' }]
  harness.forkSession = async () => {
    forks++
    return 'child'
  }
  harness.sessionEvents = async () => [
    {
      kind: 'turn',
      turn: {
        id: 'boundary',
        role: 'user',
        origin: { kind: 'user-input' },
        parts: [{ type: 'text', text: 'Background' }],
        timestamp: '2026-09-18T00:00:00Z'
      }
    }
  ]
  harness.sendMessage = async input => {
    sent.push(input)
  }
})
afterEach(async () => {
  Object.assign(harness, original)
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  setEventServer({ publish: () => {} })
  await rm(dir, { recursive: true, force: true })
})
test('manual creation has no session until submission, then attaches once', async () => {
  const quintlet = await createPendingQuintlet(ws)
  expect(quintlet.buildSessionId).toBeUndefined()
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBeUndefined()
  const result = await submitQuintlet(ws, quintlet.id, { requirements: 'Build cards', sessionId: 'fresh' })
  expect(result).toEqual({ quintletId: quintlet.id, sessionId: 'fresh' })
  expect(await getSessionEntry(ws, 'fresh')).toEqual({ tabId: `quintlets/${quintlet.id}` })
  expect(sent[0]).toMatchObject({ sessionId: 'fresh', isNew: true, content: 'Build cards' })
  expect(renderQuintContext(sent[0].context!)).toContain('Build a new quintlet from this message.')
  expect(renderQuintContext(sent[0].context!)).toContain('quint quintlets create --requirements')
  expect(sent[0].context?.activeTab).toBeUndefined()
  expect(sent[0].context?.session).toEqual({
    id: 'fresh',
    tabId: `quintlets/${quintlet.id}`,
    pinned: false
  })
  expect(sent[0]).not.toHaveProperty('quintletBuildId')
  expect((await getPendingQuintlet(ws, quintlet.id))?.status).toBe('submitted')
})
test('CLI prepares a fork and boundary before creating a quintlet while source stays running', async () => {
  harness.forkSession = async () => {
    forks++
    expect(await listPendingQuintlets(ws)).toEqual([])
    return 'child'
  }
  harness.sessionEvents = async () => {
    expect(await getSessionEntry(ws, 'child')).toEqual({ fork: { fromSessionId: 'source' } })
    expect(await listPendingQuintlets(ws)).toEqual([])
    return []
  }
  harness.sendMessage = async input => {
    expect(await getSessionEntry(ws, 'child')).toMatchObject({
      tabId: input.context?.session?.tabId
    })
    expect((await getSessionEntry(ws, 'child')).fork?.throughMessageId).toBeUndefined()
    sent.push(input)
  }
  const result = await createQuintletFromSession(ws, 'source', 'Build cards')
  expect(result).toEqual({ quintletId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(result).not.toHaveProperty('url')
  expect(sent).toHaveLength(1)
  expect(sent[0].isNew).toBe(false)
  expect(renderQuintContext(sent[0].context!)).toContain('Build a new quintlet from this message.')
  expect(sent[0].context?.session).toEqual({
    id: 'child',
    tabId: `quintlets/${result.quintletId}`,
    pinned: false
  })
  expect(sent[0].context?.activeTab).toBeUndefined()
  expect(renderQuintContext(sent[0].context!)).toContain('quint quintlets create --requirements')
  expect(renderQuintContext(sent[0].context!)).not.toContain('--from-session')
  expect(renderQuintContext(sent[0].context!)).toContain('Inherited conversation is background.')
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'child',
    isNew: false,
    content: 'Make the cards smaller',
    context: { activeTab: { id: `quintlets/${result.quintletId}` } }
  })
  expect(renderQuintContext(sent[1].context!)).not.toContain(
    'Inherited conversation is background.'
  )
  expect(renderQuintContext(sent[1].context!)).not.toContain('quint quintlets create')
  expect(forks).toBe(1)
  expect(events).not.toContainEqual(expect.objectContaining({ type: 'tab:focus' }))
})
test('handoff waits for send acceptance', async () => {
  const gate = Promise.withResolvers<void>()
  harness.sendMessage = async input => {
    sent.push(input)
    await gate.promise
  }
  let completed = false
  const request = createQuintletFromSession(ws, 'source', 'Build cards').then(result => {
    completed = true
    return result
  })
  while (!sent.length) await Bun.sleep(1)
  expect(completed).toBe(false)
  gate.resolve()
  await request
  expect(completed).toBe(true)
})
test.each(['manual', 'cli'])(
  'pinned %s build preserves ownership and leaves the quintlet selection empty',
  async entry => {
    await updateSessionEntry(ws, 'source', { tabId: 'quintlets/original' })
    await saveSelectedSession(ws, 'source', 'quintlets/original')
    await pinSession(ws, 'source')
    const result =
      entry === 'cli'
        ? await createQuintletFromSession(ws, undefined, 'Build cards')
        : await submitQuintlet(ws, (await createPendingQuintlet(ws)).id, {
            requirements: 'Build cards'
          })
    expect(forks).toBe(0)
    expect(sent).toHaveLength(entry === 'cli' ? 0 : 1)
    expect(await getSessionEntry(ws, 'source')).toEqual({ tabId: 'quintlets/original' })
    expect(await selectedIn(`quintlets/${result.quintletId}`)).toBeUndefined()
    if (entry === 'cli') {
      expect(result).toMatchObject({
        mode: 'in-place',
        buildInstructions: expect.arrayContaining([
          expect.stringContaining(`.quint/quintlets/${result.quintletId}.tsx`),
          expect.stringContaining('quint quintlets create --requirements')
        ])
      })
    } else {
      expect(sent[0].isNew).toBe(false)
      expect(sent[0].context?.session?.tabId).toEqual('quintlets/original')
      expect(sent[0].context?.activeTab).toBeUndefined()
      expect(renderQuintContext(sent[0].context!)).toContain('Build a new quintlet from this message.')
      expect(renderQuintContext(sent[0].context!)).toContain('quint quintlets create --requirements')
    }
    harness.activeSessions = () => []
    await unpinSession(ws, 'source')
    await sessionService.send(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'new-chat',
      isNew: true,
      content: 'Continue',
      context: { activeTab: { id: `quintlets/${result.quintletId}` } }
    })
    expect(await getSessionEntry(ws, 'new-chat')).toEqual({ tabId: `quintlets/${result.quintletId}` })
    expect(renderQuintContext(sent.at(-1)!.context!)).toContain(
      `The quintlet id is \`${result.quintletId}\`.`
    )
  }
)
test.each([false, true])(
  'CLI creation without a source creates only a quintlet (pinned: %s)',
  async pinned => {
    await updateSessionEntry(ws, 'source', { tabId: 'canvas' })
    if (pinned) await pinSession(ws, 'source')
    harness.listSessions = async () => {
      throw new Error('Should not look up chats')
    }
    harness.activeSessions = () => {
      throw new Error('Should not look up chats')
    }
    const result = await createQuintletFromSession(ws, undefined, '  Build cards  ')
    expect(result.mode).toBe('in-place')
    const instructions = result.buildInstructions?.join('\n')
    expect(instructions).toContain('quint quintlets create --requirements')
    expect(instructions).not.toContain('--from-session')
    const quintlet = await getPendingQuintlet(ws, result.quintletId)
    expect(quintlet).toMatchObject({ requirements: 'Build cards', status: 'submitted' })
    expect(quintlet?.buildSessionId).toBeUndefined()
    expect(await getSessionEntry(ws, 'source')).toEqual({ tabId: 'canvas' })
    expect(await getSessionEntry(ws, 'child')).toEqual({})
    expect(await getPinnedSession(ws)).toBe(pinned ? 'source' : undefined)
    expect(await selectedIn(`quintlets/${result.quintletId}`)).toBeUndefined()
    expect(forks).toBe(0)
    expect(sent).toEqual([])
  }
)
test('CLI creation rejects an empty explicit source', async () => {
  await expect(createQuintletFromSession(ws, '', 'Build cards')).rejects.toThrow(
    'Session id cannot be empty'
  )
  expect(await listPendingQuintlets(ws)).toEqual([])
  expect(forks).toBe(0)
  expect(sent).toEqual([])
})
test('CLI creation forks the explicit source even when a different chat is pinned', async () => {
  await pinSession(ws, 'source')
  harness.listSessions = async () => [{ sessionId: 'other', summary: 'Other', lastModified: 1 }]
  harness.forkSession = async (_ws, sourceId) => {
    expect(sourceId).toBe('other')
    forks++
    return 'child'
  }
  const result = await createQuintletFromSession(ws, 'other', 'Build cards')
  expect(result).toEqual({ quintletId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(await getSessionEntry(ws, 'child')).toMatchObject({
    tabId: `quintlets/${result.quintletId}`,
    fork: { fromSessionId: 'other' }
  })
  expect(await selectedIn(`quintlets/${result.quintletId}`)).toBe('child')
  expect(await getPinnedSession(ws)).toBe('source')
  expect(forks).toBe(1)
  expect(sent).toHaveLength(1)
  expect(sent[0].context?.session?.pinned).toBe(false)
})
test('CLI creation rejects an unknown explicit source before creating a quintlet', async () => {
  await expect(createQuintletFromSession(ws, 'missing', 'Build cards')).rejects.toThrow(
    'Source chat not found'
  )
  expect(await listPendingQuintlets(ws)).toEqual([])
  expect(forks).toBe(0)
  expect(sent).toEqual([])
})
test('CLI creation still requires nonempty requirements in a pinned chat', async () => {
  await pinSession(ws, 'source')
  await expect(createQuintletFromSession(ws, undefined, '  ')).rejects.toThrow(
    'Quintlet requirements are required'
  )
  expect(await listPendingQuintlets(ws)).toEqual([])
})
test.each(['missing', 'unsupported'])('fresh fallback for %s fork support', async kind => {
  harness.forkSession =
    kind === 'missing'
      ? undefined
      : async () => {
          throw new ForkUnsupportedError()
        }
  const result = await createQuintletFromSession(ws, 'source', 'Build cards')
  expect(await getSessionEntry(ws, result.sessionId!)).toEqual({
    tabId: `quintlets/${result.quintletId}`
  })
  expect(sent[0].isNew).toBe(true)
})
test('uncertain fork failure does not create a quintlet or retry', async () => {
  harness.forkSession = async () => {
    forks++
    throw new Error('Connection lost')
  }
  await expect(createQuintletFromSession(ws, 'source', 'Build cards')).rejects.toThrow(
    'Connection lost'
  )
  expect(forks).toBe(1)
  expect(await listPendingQuintlets(ws)).toEqual([])
  expect(sent).toEqual([])
})
test('boundary read failure keeps the fork and continues with full history', async () => {
  harness.sessionEvents = async () => {
    throw new Error('History unavailable')
  }
  const result = await createQuintletFromSession(ws, 'source', 'Build cards')
  expect(result).toEqual({ quintletId: expect.any(String), mode: 'handoff', sessionId: 'child' })
  expect(await getSessionEntry(ws, 'child')).toEqual({
    fork: { fromSessionId: 'source' },
    tabId: `quintlets/${result.quintletId}`
  })
  expect(sent[0]?.content).toBe('Build cards')
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'child',
    isNew: false,
    content: 'Continue'
  })
  expect(sent.at(-1)?.content).toBe('Continue')
})
test('send failure retains quintlet and child and reports both IDs', async () => {
  harness.sendMessage = async () => {
    throw new Error('Send failed')
  }
  await expect(createQuintletFromSession(ws, 'source', 'Build cards')).rejects.toMatchObject({
    sessionId: 'child',
    quintletId: expect.any(String)
  })
  const [quintlet] = await listPendingQuintlets(ws)
  expect(quintlet).toMatchObject({ status: 'failed', buildSessionId: 'child' })
  await failInterruptedQuintletStarts(ws)
  expect(forks).toBe(1)
})
test('completion removes build state without moving selection, ownership, or pin', async () => {
  const result = await createQuintletFromSession(ws, 'source', 'Build cards')
  await pinSession(ws, 'source')
  await completeQuintletBuild(ws, result.quintletId)
  await completeQuintletBuild(ws, result.quintletId)
  expect(await listPendingQuintlets(ws)).toEqual([])
  expect(await selectedIn(`quintlets/${result.quintletId}`)).toBe('child')
  expect(await getSessionEntry(ws, 'child')).toMatchObject({
    tabId: `quintlets/${result.quintletId}`,
    fork: { throughMessageId: 'boundary' }
  })
  expect(await getPinnedSession(ws)).toBe('source')
})
test('late send acceptance does not recreate a completed build', async () => {
  harness.sendMessage = async input => {
    await completeQuintletBuild(ws, input.context!.session!.tabId!.slice('quintlets/'.length))
  }
  await createQuintletFromSession(ws, 'source', 'Build cards')
  expect(await listPendingQuintlets(ws)).toEqual([])
})
test('native rename preserves the execution reference and attached selection', async () => {
  harness.sendMessage = async input => {
    await renameSessionReferences(ws, input.sessionId, 'native')
  }
  const result = await createQuintletFromSession(ws, 'source', 'Build cards')
  expect(result.sessionId).toBe('native')
  expect((await getPendingQuintlet(ws, result.quintletId))?.buildSessionId).toBe('native')
  expect(await selectedIn(`quintlets/${result.quintletId}`)).toBe('native')
})
test.each(allHarnesses().map(harness => harness.id))(
  '%s handoff inherits source settings through native fork or fresh fallback',
  async type => {
    const target = harnessFor(type)
    const original = {
      forkSession: target.forkSession,
      sendMessage: target.sendMessage,
      listSessions: target.listSessions,
      sessionEvents: target.sessionEvents,
      activeSessions: target.activeSessions
    }
    const config = { model: 'model', effort: 'high', fastMode: false }
    const workspace = { ...ws, type, agentId: 'agent' }
    await saveSessionConfig(ws, 'source', config)
    target.listSessions = harness.listSessions
    target.activeSessions = harness.activeSessions
    target.sessionEvents = async () => []
    target.sendMessage = async input => {
      expect(await getSessionConfig(ws, input.sessionId)).toEqual(config)
      sent.push(input)
    }
    target.forkSession = original.forkSession
      ? async (_ws, sourceId, sourceConfig) => {
          expect(sourceId).toBe('source')
          expect(sourceConfig).toEqual(config)
          // A later source edit must not change the settings of this fork.
          await saveSessionConfig(ws, sourceId, { model: 'other', effort: 'low' })
          return 'child'
        }
      : undefined
    try {
      const result = await createQuintletFromSession(workspace, 'source', 'Build cards')
      expect(await getSessionConfig(ws, result.sessionId!)).toEqual(config)
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ ...config, isNew: !original.forkSession })
    } finally {
      Object.assign(target, original)
    }
  }
)
test('restart fails a starting quintlet without forking or sending', async () => {
  const quintlet = await createPendingQuintlet(ws, {
    status: 'starting',
    buildSessionId: 'child'
  })
  await failInterruptedQuintletStarts(ws)
  expect((await getPendingQuintlet(ws, quintlet.id))?.status).toBe('failed')
  expect(sent).toEqual([])
  expect(forks).toBe(0)
})
test('metadata updates neither create quintlets nor change status', async () => {
  await expect(updatePendingQuintlet(ws, 'missing', { title: 'Cards' })).rejects.toThrow('not found')
  const quintlet = await createPendingQuintlet(ws)
  const updated = await updatePendingQuintlet(ws, quintlet.id, { title: 'Cards', icon: 'book' })
  expect(updated).toMatchObject({ title: 'Cards', icon: 'book', status: 'draft' })
})
test('duplicate submissions are rejected', async () => {
  const quintlet = await createPendingQuintlet(ws)
  const results = await Promise.allSettled([
    submitQuintlet(ws, quintlet.id, { requirements: 'Cards' }),
    submitQuintlet(ws, quintlet.id, { requirements: 'Cards' })
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(sent).toHaveLength(1)
})
test('discard blocks startup and active construction, then archives attributed chats', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await updateWorkspaceState(ws, state => startQuintletBuild(state, quintlet.id, 'Cards', 'child', false))
  await expect(discardPendingQuintlet(ws, quintlet.id, new Set())).rejects.toThrow('only be closed')
  await failInterruptedQuintletStarts(ws)
  await updateSessionEntry(ws, 'child', {
    tabId: `quintlets/${quintlet.id}`,
    fork: { fromSessionId: 'source' }
  })
  await expect(discardPendingQuintlet(ws, quintlet.id, new Set(['child']))).rejects.toThrow(
    'only be closed'
  )
  expect(archived).toEqual([])
  await updateSessionEntry(ws, 'follow-up', { tabId: `quintlets/${quintlet.id}` })
  await saveSelectedSession(ws, 'child', `quintlets/${quintlet.id}`)
  await saveSelectedSession(ws, 'child')
  await pinSession(ws, 'follow-up')
  await discardPendingQuintlet(ws, quintlet.id, new Set())
  expect(archived).toEqual(['child', 'follow-up'])
  expect(await getPendingQuintlet(ws, quintlet.id)).toBeUndefined()
  expect(await getSessionEntry(ws, 'child')).toEqual({
    tabId: `quintlets/${quintlet.id}`,
    fork: { fromSessionId: 'source' }
  })
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBeUndefined()
  expect(await selectedIn()).toBeUndefined()
  expect(await getPinnedSession(ws)).toBeUndefined()
  expect(getClientFrameLog(ws.id).map(entry => entry.frame)).toEqual(
    expect.arrayContaining(
      archived.map(sessionId => ({
        type: 'session_archived',
        workspaceId: ws.id,
        sessionId
      }))
    )
  )
})

test('discard archives quintlet attribution rather than a pinned execution chat', async () => {
  const quintlet = await createPendingQuintlet(ws, {
    status: 'submitted',
    buildSessionId: 'source'
  })
  await updateSessionEntry(ws, 'source', { tabId: 'canvas' })
  await updateSessionEntry(ws, 'sibling', { tabId: 'quintlets/sibling' })
  await updateSessionEntry(ws, 'owned', { tabId: `quintlets/${quintlet.id}` })
  await pinSession(ws, 'source')
  await saveSelectedSession(ws, 'source', `quintlets/${quintlet.id}`)
  await saveSelectedSession(ws, 'source', 'canvas')
  await discardPendingQuintlet(ws, quintlet.id, new Set())
  expect(archived).toEqual(['owned'])
  expect(await getPinnedSession(ws)).toBe('source')
  expect(await selectedIn('canvas')).toBe('source')
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBeUndefined()
  expect(await getSessionEntry(ws, 'source')).toEqual({ tabId: 'canvas' })
})

test('archive failure leaves a pending quintlet and its selection available to retry', async () => {
  const quintlet = await createPendingQuintlet(ws, {
    status: 'failed',
    buildSessionId: 'child'
  })
  await updateSessionEntry(ws, 'child', { tabId: `quintlets/${quintlet.id}` })
  await saveSelectedSession(ws, 'child', `quintlets/${quintlet.id}`)
  harness.archiveSession = async () => {
    throw new Error('Archive failed')
  }
  await expect(discardPendingQuintlet(ws, quintlet.id, new Set())).rejects.toThrow('Archive failed')
  expect(await getPendingQuintlet(ws, quintlet.id)).toEqual(quintlet)
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBe('child')
  harness.archiveSession = async (_, sessionId) => {
    archived.push(sessionId)
  }
  await discardPendingQuintlet(ws, quintlet.id, new Set())
  expect(archived).toEqual(['child'])
  expect(await getPendingQuintlet(ws, quintlet.id)).toBeUndefined()
})

test('fresh handoff failure reports the provider ID after a native rename', async () => {
  harness.forkSession = undefined
  harness.sendMessage = async input => {
    await renameSessionReferences(ws, input.sessionId, 'native-child')
    throw new Error('Send rejected')
  }
  await expect(createQuintletFromSession(ws, 'source', 'Cards')).rejects.toMatchObject({
    sessionId: 'native-child',
    quintletId: expect.any(String)
  })
  expect((await listPendingQuintlets(ws))[0]).toMatchObject({
    status: 'failed',
    buildSessionId: 'native-child'
  })
})

test('a fresh chat after unpinning receives the saved quintlet requirements', async () => {
  harness.activeSessions = () => []
  const quintlet = await createPendingQuintlet(ws, {
    requirements: 'Build a gardening board with watering reminders',
    status: 'submitted',
    buildSessionId: 'source'
  })
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: true,
    content: 'Continue',
    context: { activeTab: { id: `quintlets/${quintlet.id}` } }
  })
  expect(sent[0].context?.directives).toContain(
    'Original quintlet requirements:\nBuild a gardening board with watering reminders'
  )
  expect(await getSessionEntry(ws, 'fresh')).toEqual({ tabId: `quintlets/${quintlet.id}` })
})

test('follow-ups keep chat context without repeating the build request, including off the quintlet tab', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, { requirements: 'Build cards', sessionId: 'fresh' })
  for (const activeTab of [`quintlets/${quintlet.id}`, 'dashboard'] as const) {
    await sessionService.send(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'fresh',
      isNew: false,
      content: 'Make the cards smaller',
      context: { activeTab: { id: activeTab }, directives: ['Use compact spacing.'] }
    })
    const context = sent.at(-1)!.context!
    expect(context.session).toEqual({ id: 'fresh', tabId: `quintlets/${quintlet.id}`, pinned: false })
    expect(context.activeTab).toEqual({ id: activeTab })
    const rendered = renderQuintContext(context)
    expect(rendered).not.toContain('Build a new quintlet from this message.')
    expect(rendered).not.toContain('quint quintlets set')
    expect(rendered).not.toContain('Available quintlet icons')
    expect(rendered).toContain('# Session')
    expect(context).not.toHaveProperty('chat')
    expect(rendered).toContain('Pinned: no.')
    expect(rendered).not.toContain('quint quintlets create')
    expect(rendered).toContain('# This message only\nUse compact spacing.')
  }
})

test('an unrelated pinned chat cannot take ownership of a running quintlet build', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, {
    requirements: 'Build a weather dashboard',
    sessionId: 'builder'
  })
  await saveSelectedSession(ws, 'source', 'dashboard')
  await pinSession(ws, 'source')
  harness.activeSessions = () => [{ workspaceId: ws.id, sessionId: 'builder', activity: 'running' }]
  const before = await getPendingQuintlet(ws, quintlet.id)

  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'What are you working on?',
    context: { activeTab: { id: `quintlets/${quintlet.id}` } }
  })

  const message = sent.at(-1)!
  expect(message.sessionId).toBe('source')
  expect(message.context?.activeTab).toEqual({ id: `quintlets/${quintlet.id}` })
  expect(message.context?.session?.tabId).toBeUndefined()
  expect(renderQuintContext(message.context!)).not.toContain('Build a new quintlet from this message.')
  expect(await getSessionEntry(ws, 'builder')).toEqual({ tabId: `quintlets/${quintlet.id}` })
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBe('builder')
  expect(await getPinnedSession(ws)).toBe('source')
  expect(await getPendingQuintlet(ws, quintlet.id)).toEqual(before)
})

test('an unrelated pinned chat cannot clear a failed quintlet build or its error', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, {
    requirements: 'Build a weather dashboard',
    sessionId: 'builder'
  })
  await patchPendingQuintlet(ws, quintlet.id, {
    status: 'failed',
    error: 'Weather data could not be loaded'
  })
  await saveSelectedSession(ws, 'source', 'dashboard')
  await pinSession(ws, 'source')
  harness.activeSessions = () => []
  const before = await getPendingQuintlet(ws, quintlet.id)

  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'What are you working on?',
    context: { activeTab: { id: `quintlets/${quintlet.id}` } }
  })

  expect(sent.at(-1)?.sessionId).toBe('source')
  expect(renderQuintContext(sent.at(-1)!.context!)).not.toContain(
    'Build a new quintlet from this message.'
  )
  expect(await getPendingQuintlet(ws, quintlet.id)).toEqual(before)
})

test('a fresh chat cannot take over a quintlet while its builder is running', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, { requirements: 'Build a weather dashboard', sessionId: 'builder' })
  harness.activeSessions = () => [{ workspaceId: ws.id, sessionId: 'builder', activity: 'running' }]
  const before = await getPendingQuintlet(ws, quintlet.id)

  await expect(
    sessionService.send(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'fresh',
      isNew: true,
      content: 'Continue',
      context: { activeTab: { id: `quintlets/${quintlet.id}` } }
    })
  ).rejects.toThrow('already being built in another chat')

  expect(sent).toHaveLength(1)
  expect(await getPendingQuintlet(ws, quintlet.id)).toEqual(before)
  expect(await selectedIn(`quintlets/${quintlet.id}`)).toBe('builder')
  expect(await getSessionEntry(ws, 'fresh')).toEqual({})
})

test('the builder can resume its failed quintlet while an unrelated failed quintlet is visible', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, { requirements: 'Build weather cards', sessionId: 'builder' })
  await patchPendingQuintlet(ws, quintlet.id, { status: 'failed', error: 'Build failed' })
  const other = await createPendingQuintlet(ws, {
    status: 'failed',
    requirements: 'Build a calendar',
    buildSessionId: 'other-builder',
    error: 'Other build failed'
  })
  const otherBefore = await getPendingQuintlet(ws, other.id)
  await pinSession(ws, 'builder')

  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'builder',
    isNew: false,
    content: 'Fix the weather cards',
    context: { activeTab: { id: `quintlets/${other.id}` } }
  })

  expect(await getPendingQuintlet(ws, quintlet.id)).toMatchObject({
    status: 'submitted',
    buildSessionId: 'builder'
  })
  expect((await getPendingQuintlet(ws, quintlet.id))?.error).toBeUndefined()
  expect(await getPendingQuintlet(ws, other.id)).toEqual(otherBefore)
  expect(sent.at(-1)?.context?.session).toEqual({
    id: 'builder',
    tabId: `quintlets/${quintlet.id}`,
    pinned: true
  })
  expect(sent.at(-1)?.context?.activeTab).toEqual({ id: `quintlets/${other.id}` })
  expect(renderQuintContext(sent.at(-1)!.context!)).not.toContain(
    'Build a new quintlet from this message.'
  )
})

test('ordinary sends preserve the visible tab snapshot and resolve the chat tab separately', async () => {
  await updateSessionEntry(ws, 'source', { tabId: 'quintlets/original' })
  const activeTab = { id: 'quintlets/current', title: 'Current quintlet', params: { item: '42' } } as const
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'Explain this item',
    context: { activeTab, session: { id: 'forged', tabId: 'quintlets/forged', pinned: true } }
  })
  expect(sent[0].context?.activeTab).toEqual(activeTab)
  expect(sent[0].context?.session).toEqual({ id: 'source', tabId: 'quintlets/original', pinned: false })
  expect(renderQuintContext(sent[0].context!)).toContain(
    'The user is on the "Current quintlet" quintlet tab'
  )
  expect(renderQuintContext(sent[0].context!)).toContain(
    'This chat belongs to the "original" quintlet tab'
  )
  expect(await getPinnedSession(ws)).toBeUndefined()
  expect(await getSessionEntry(ws, 'source')).toEqual({ tabId: 'quintlets/original' })
})

test('session pin state describes the sender even when a different chat is pinned', async () => {
  await pinSession(ws, 'other')
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'Create a quintlet',
    context: { activeTab: { id: 'dashboard' } }
  })
  expect(sent[0].context?.session).toEqual({ id: 'source', tabId: undefined, pinned: false })
})

test('follow-ups refresh the session ID and pin state after a native rename', async () => {
  await updateSessionEntry(ws, 'source', { tabId: 'canvas' })
  await pinSession(ws, 'source')
  const message = {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'source',
    isNew: false,
    content: 'Create a quintlet'
  }
  await sessionService.send(ws, message)
  expect(sent.at(-1)?.context?.session).toEqual({ id: 'source', tabId: 'canvas', pinned: true })

  await renameSessionReferences(ws, 'source', 'native')
  await sessionService.send(ws, message)
  expect(sent.at(-1)?.sessionId).toBe('native')
  expect(sent.at(-1)?.context?.session).toEqual({ id: 'native', tabId: 'canvas', pinned: true })

  await unpinSession(ws, 'native')
  await sessionService.send(ws, message)
  expect(sent.at(-1)?.context?.session).toEqual({
    id: 'native',
    tabId: 'canvas',
    pinned: false
  })
})

test('a new browser chat groups the visible quintlet title and params without attaching params to the chat', async () => {
  const activeTab = { id: 'quintlets/garden', title: 'Garden', params: { plant: 'rose' } } as const
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: true,
    content: 'Explain this plant',
    context: { activeTab }
  })
  expect(sent[0].context?.activeTab).toEqual(activeTab)
  expect(sent[0].context?.session).toEqual({ id: 'fresh', tabId: 'quintlets/garden', pinned: false })
  expect(await getSessionEntry(ws, 'fresh')).toEqual({ tabId: 'quintlets/garden' })
})

test('completion keeps the attached chat context without repeating build instructions', async () => {
  const quintlet = await createPendingQuintlet(ws)
  await submitQuintlet(ws, quintlet.id, { requirements: 'Build cards', sessionId: 'fresh' })
  await completeQuintletBuild(ws, quintlet.id)
  await sessionService.send(ws, {
    workspaceId: ws.id,
    workspacePath: ws.path,
    sessionId: 'fresh',
    isNew: false,
    content: 'What do you think?',
    context: { activeTab: { id: 'dashboard' } }
  })
  expect(sent.at(-1)?.context?.session?.tabId).toEqual(`quintlets/${quintlet.id}`)
  expect(renderQuintContext(sent.at(-1)!.context!)).not.toContain(
    'Build a new quintlet from this message.'
  )
})

test('a pinned chat receives one build request per quintlet, with no repeats on follow-ups', async () => {
  await pinSession(ws, 'source')
  for (const requirements of ['Build cards', 'Build a calendar']) {
    const quintlet = await createPendingQuintlet(ws)
    await submitQuintlet(ws, quintlet.id, { requirements })
    expect(renderQuintContext(sent.at(-1)!.context!)).toContain(`The quintlet id is \`${quintlet.id}\`.`)
    expect(renderQuintContext(sent.at(-1)!.context!)).toContain('quint quintlets create --requirements')
    await sessionService.send(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'source',
      isNew: false,
      content: 'Continue',
      context: { activeTab: { id: `quintlets/${quintlet.id}` } }
    })
    const rendered = renderQuintContext(sent.at(-1)!.context!)
    expect(rendered).not.toContain('Build a new quintlet from this message.')
    expect(rendered).not.toContain('quint quintlets create')
    expect(rendered).toContain('Pinned: yes.')
    expect(sent.at(-1)?.context?.session?.tabId).toBeUndefined()
    expect(rendered).not.toContain('start it in its own chat')
  }
})

test('rejected ordinary sends retain a failed pending quintlet for explicit retry', async () => {
  const quintlet = await createPendingQuintlet(ws, { requirements: 'Cards' })
  harness.sendMessage = async () => {
    throw new Error('Unavailable')
  }
  await expect(
    sessionService.send(ws, {
      workspaceId: ws.id,
      workspacePath: ws.path,
      sessionId: 'fresh',
      isNew: true,
      content: 'Continue',
      context: { activeTab: { id: `quintlets/${quintlet.id}` } }
    })
  ).rejects.toThrow('Unavailable')
  expect(await getPendingQuintlet(ws, quintlet.id)).toMatchObject({
    status: 'failed',
    error: 'Unavailable',
    buildSessionId: 'fresh'
  })
})
