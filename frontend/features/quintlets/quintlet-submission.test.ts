import type { SessionSummary, WorkspaceState } from '@/shared/types'
import { afterEach, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { recoverQuintletSubmission } from './quintlet-submission'
import { liveStore, attachmentKey } from '@/frontend/features/chat/chat-store'
import { useUiStore } from '@/frontend/store/ui'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { composerDraftKey, draftSessionId } from '@/shared/session-drafts'
import type { StagedAttachment } from '@/frontend/features/chat/composer/attachments/types'

const originalFetch = globalThis.fetch
const workspaceId = 'recovery'
const text = 'Build a gardening board'
const attachment: StagedAttachment = {
  kind: 'text',
  localId: 'brief',
  source: 'quintlets/garden',
  label: 'Brief',
  text
}

afterEach(() => {
  globalThis.fetch = originalFetch
  liveStore.setState({ attachments: {}, activity: {}, errors: {} })
  useUiStore.setState({ composerDrafts: {} })
})

function setup(status?: 'draft' | 'failed' | 'submitted') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const state: WorkspaceState = {
    revision: 2,
    selected: status && status !== 'draft' ? { 'quintlets/garden': 'native' } : {},
    sessions: {},
    pendingQuintlets: status
      ? {
          garden: {
            status,
            requirements: text,
            ...(status === 'draft' ? {} : { buildSessionId: 'native' })
          }
        }
      : {}
  }
  const requests: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    if (!status) throw new Error('Offline')
    if (!url.endsWith('/state')) throw new Error(`Unexpected request: ${url}`)
    return Response.json(state)
  }) as typeof fetch
  liveStore.setState({
    attachments: { [attachmentKey(workspaceId, 'temporary')]: [attachment] },
    activity: { [`${workspaceId}:temporary`]: 'running' }
  })
  qc.setQueryData(workspaceKeys.sessions(workspaceId), [{ sessionId: 'temporary' }])
  return { qc, requests, state }
}

test('validation rejection restores fresh composer, prompt, and attachments', async () => {
  const { qc, requests, state } = setup('draft')
  await recoverQuintletSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  const draftId = draftSessionId('quintlets/garden')
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, draftId)]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, draftId)]).toBe(text)
  expect(qc.getQueryData<WorkspaceState>(workspaceKeys.state(workspaceId))).toEqual(state)
  expect(qc.getQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId))).toEqual([])
  expect(requests).toEqual([`/api/workspaces/${workspaceId}/state`])
})

test('failed startup keeps the server chat and restores its draft after native rename', async () => {
  const { qc, state } = setup('failed')
  liveStore.getState().renameSession(workspaceId, 'temporary', 'native')
  await recoverQuintletSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'native')]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'native')]).toBe(text)
  expect(qc.getQueryData<WorkspaceState>(workspaceKeys.state(workspaceId))).toEqual(state)
})

test('lost response after accepted startup retains the chat without replaying or marking it idle', async () => {
  const { qc, requests } = setup('submitted')
  await recoverQuintletSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().activity[`${workspaceId}:native`]).toBe('running')
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'native')]).toEqual([
    attachment
  ])
  expect(requests.every(url => !url.endsWith('/submit'))).toBe(true)
})

test('offline recovery preserves the draft and attachments without replaying', async () => {
  const { qc, requests } = setup()
  await recoverQuintletSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(liveStore.getState().attachments[attachmentKey(workspaceId, 'temporary')]).toEqual([
    attachment
  ])
  expect(useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'temporary')]).toBe(
    text
  )
  expect(requests).toHaveLength(1)
})

test('rejected submission moves the existing composer draft back without replacing it', async () => {
  const { qc } = setup('draft')
  useUiStore.getState().setComposerDraft(composerDraftKey(workspaceId, 'temporary'), '')
  await recoverQuintletSubmission(qc, workspaceId, 'garden', 'temporary', text, false)
  expect(
    useUiStore.getState().composerDrafts[
      composerDraftKey(workspaceId, draftSessionId('quintlets/garden'))
    ]
  ).toBe('')
  expect(
    useUiStore.getState().composerDrafts[composerDraftKey(workspaceId, 'temporary')]
  ).toBeUndefined()
})
