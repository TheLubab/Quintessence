import { afterEach, describe, expect, test } from 'bun:test'

import { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/frontend/api/workspace-keys'
import {
  attachmentsForSend,
  ownsComposerAttachments,
  prepareChatAttachments,
  resolveChatRunOptions,
  startOptimisticSession,
  startOptimisticTurn,
  prepareDraftAttachments
} from '@/frontend/features/chat/chat-send'
import { attachmentKey, liveStore } from '@/frontend/features/chat/chat-store'
import type { StagedAttachment } from '@/frontend/features/chat/composer/attachments/types'
import { MAX_MESSAGE_ATTACHMENTS } from '@/shared/message-attachments'
import type {
  SessionSummary,
  UploadInfo,
  ViewState,
  WorkspaceAgent,
  WorkspaceState
} from '@/shared/types'
import { resolveSelectedModel } from './composer/model-order'

const workspaceId = 'workspace-1'
const sessionId = 'session-1'

afterEach(() => {
  liveStore.setState({ activity: {}, errors: {}, attachments: {} })
})

describe('startOptimisticTurn', () => {
  test('adds the user turn and starts processing', () => {
    const queryClient = new QueryClient()
    const optimisticId = startOptimisticTurn({
      queryClient,
      workspaceId,
      sessionId,
      parts: [{ type: 'text', text: 'Build a dashboard' }]
    })

    const quintlet = queryClient.getQueryData<ViewState>(
      workspaceKeys.events(workspaceId, sessionId)
    )
    expect(optimisticId).toStartWith('optimistic:')
    expect(quintlet?.turns[0]?.parts).toEqual([{ type: 'text', text: 'Build a dashboard' }])
    expect(liveStore.getState().activity[`${workspaceId}:${sessionId}`]).toBe('running')
  })
})

test('prepareChatAttachments rejects oversized batches before preparation', async () => {
  await expect(
    prepareChatAttachments(
      workspaceId,
      Array.from({ length: MAX_MESSAGE_ATTACHMENTS + 1 }, (_, index) => ({
        type: 'text' as const,
        source: 'quintlet:orders',
        label: `Row ${index}`,
        text: String(index)
      }))
    )
  ).rejects.toThrow(`at most ${MAX_MESSAGE_ATTACHMENTS} attachments`)
})

describe('startOptimisticSession', () => {
  test('adds a first-message fallback to the session list immediately', () => {
    const queryClient = new QueryClient()
    startOptimisticSession({
      queryClient,
      workspaceId,
      sessionId,
      text: 'Build a customer dashboard with useful charts'
    })

    expect(
      queryClient.getQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId))
    ).toMatchObject([
      {
        sessionId,
        summary: 'Build a customer dashboard with useful charts'
      }
    ])
  })

  test('files a quintlet chat under its tab before the server confirms it', () => {
    const queryClient = new QueryClient()
    const state: WorkspaceState = { revision: 3, selected: {}, sessions: {}, pendingQuintlets: {} }
    queryClient.setQueryData(workspaceKeys.state(workspaceId), state)
    startOptimisticSession({
      tabId: 'quintlets/notes',
      queryClient,
      workspaceId,
      sessionId,
      text: 'hello'
    })

    expect(
      queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(workspaceId))?.sessions
    ).toEqual({ [sessionId]: { tabId: 'quintlets/notes' } })
  })

  test('leaves an dashboard chat out of the workspace state', () => {
    const queryClient = new QueryClient()
    const state: WorkspaceState = { revision: 3, selected: {}, sessions: {}, pendingQuintlets: {} }
    queryClient.setQueryData(workspaceKeys.state(workspaceId), state)
    startOptimisticSession({
      tabId: 'dashboard',
      queryClient,
      workspaceId,
      sessionId,
      text: 'hello'
    })

    expect(queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(workspaceId))).toBe(state)
  })

  test('uses filenames for an attachment-only chat', () => {
    const queryClient = new QueryClient()
    startOptimisticSession({
      queryClient,
      workspaceId,
      sessionId,
      text: '',
      filenames: ['brief.pdf']
    })

    expect(
      queryClient.getQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId))?.[0]?.summary
    ).toBe('brief.pdf')
  })
})

describe('resolveChatRunOptions', () => {
  const models: WorkspaceAgent = {
    provider: 'meta',
    availability: { status: 'available' },
    supportsStreaming: true,
    models: [
      {
        value: 'muse-spark-1.3',
        displayName: 'Muse Spark',
        supportsFastMode: true,
        supportedEffortLevels: ['low', 'high']
      },
      {
        value: 'muse-spark-1.2',
        displayName: 'Muse Spark 1.2',
        supportedEffortLevels: ['low', 'high']
      }
    ]
  }

  test('keeps supported run options', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', 'high')).toEqual({
      model: 'muse-spark-1.3',
      effort: 'high',
      stream: true
    })
  })

  test('keeps the implicit effort unset', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', undefined)).toEqual({
      model: 'muse-spark-1.3',
      effort: undefined,
      stream: true
    })
  })

  test('falls back to the displayed model when the stored choice is stale', () => {
    expect(resolveChatRunOptions(models, 'removed-model', 'medium')).toEqual({
      model: 'muse-spark-1.3',
      effort: undefined,
      stream: true
    })
  })

  test('drops an unsupported effort for a known model', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', 'medium')).toEqual({
      model: 'muse-spark-1.3',
      effort: undefined,
      stream: true
    })
  })

  test('keeps enabled and explicitly disabled Fast mode for a supported model', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', 'high', true)).toEqual({
      model: 'muse-spark-1.3',
      effort: 'high',
      fastMode: true,
      stream: true
    })
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', 'high', false)).toEqual({
      model: 'muse-spark-1.3',
      effort: 'high',
      fastMode: false,
      stream: true
    })
  })

  test('disables Fast mode for a known unsupported model without dropping the preference', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.2', 'high', true)).toEqual({
      model: 'muse-spark-1.2',
      effort: 'high',
      fastMode: false,
      stream: true
    })
  })

  test('validates Fast mode against the displayed fallback model', () => {
    expect(resolveChatRunOptions(models, 'removed-model', 'high', true)).toEqual({
      model: 'muse-spark-1.3',
      effort: 'high',
      fastMode: true,
      stream: true
    })
  })

  test('omits Fast mode when no quint preference exists', () => {
    expect(resolveChatRunOptions(models, 'muse-spark-1.3', 'high')).not.toHaveProperty('fastMode')
  })
})

describe('Meta model selection', () => {
  const catalog: WorkspaceAgent = {
    provider: 'meta',
    availability: { status: 'available' },
    models: [
      { value: 'default', resolvedModel: 'muse-spark-1.3', displayName: '5.6 Sol' },
      {
        value: 'muse-spark-1.2',
        displayName: '5.6 Luna',
        supportedEffortLevels: ['low', 'medium']
      },
      {
        value: 'muse-spark-1.3',
        resolvedModel: 'muse-spark-1.3',
        displayName: '5.6 Sol',
        supportedEffortLevels: ['low', 'xhigh'],
        supportsFastMode: true
      }
    ]
  }

  for (const pick of [undefined, 'default', 'muse-wonder-1.0', 'muse-spark-1.3']) {
    test(`sends the displayed Sol model for ${pick ?? 'an implicit default'}`, () => {
      const displayed = resolveSelectedModel(catalog.models, pick)
      const run = resolveChatRunOptions(catalog, pick, 'xhigh', true)
      expect(displayed?.displayName).toBe('5.6 Sol')
      expect(run).toMatchObject({ model: displayed?.value, effort: 'xhigh', fastMode: true })
    })
  }

  test('an explicit choice overrides the configured default and validates its capabilities', () => {
    expect(resolveChatRunOptions(catalog, 'muse-spark-1.2', 'xhigh', true)).toMatchObject({
      model: 'muse-spark-1.2',
      effort: undefined,
      fastMode: false
    })
  })

  test('an unavailable default uses the same first catalog row as the picker', () => {
    const data = { ...catalog, models: catalog.models.filter(model => model.value !== 'default') }
    expect(resolveChatRunOptions(data, undefined, 'low').model).toBe('muse-spark-1.2')
  })

  test('sends the native model id when it differs from the picker row id', () => {
    const data = {
      ...catalog,
      models: [{ value: 'catalog-sol', resolvedModel: 'muse-spark-1.3', displayName: '5.6 Sol' }]
    }
    expect(resolveChatRunOptions(data, 'catalog-sol', undefined).model).toBe('muse-spark-1.3')
  })

  test('preserves an explicit choice while the catalog is loading', () => {
    expect(resolveChatRunOptions(undefined, 'muse-spark-1.3', 'low').model).toBe('muse-spark-1.3')
  })
})

// The composer's staged files belong to the message the USER is writing. An
// applet firing a message must not walk off with them — nor clear the list,
// which would also drop still-uploading files the user never sent.
describe('composer attachments', () => {
  const staged: StagedAttachment[] = [
    {
      kind: 'file',
      localId: 'a1',
      label: 'report.pdf',
      mediaType: 'application/pdf',
      status: 'ready',
      upload: { id: 'up-1', kind: 'file' } as UploadInfo
    },
    {
      kind: 'file',
      localId: 'a2',
      label: 'big.mov',
      mediaType: 'video/quicktime',
      status: 'uploading'
    },
    {
      kind: 'drawing',
      purpose: 'annotation',
      localId: 'a3',
      label: 'Annotation.png',
      mediaType: 'image/png',
      source: 'dashboard',
      status: 'draft'
    }
  ]

  const stage = () =>
    liveStore.setState({ attachments: { [attachmentKey(workspaceId, sessionId)]: staged } })

  test('a composer send carries the uploaded ones and skips uploading and draft ones', () => {
    stage()
    expect(attachmentsForSend(workspaceId, sessionId, undefined).map(a => a.localId)).toEqual([
      'a1'
    ])
  })

  test('an applet send carries none, however much is staged', () => {
    stage()
    const applet = { applet: { kind: 'widget', id: 'late-orders' } } as const
    expect(attachmentsForSend(workspaceId, sessionId, applet)).toEqual([])
  })

  test('directives alone do not make a send foreign to the composer', () => {
    stage()
    const withDirectives = { directives: ['Do the thing first.'] }
    expect(attachmentsForSend(workspaceId, sessionId, withDirectives).map(a => a.localId)).toEqual([
      'a1'
    ])
  })

  test('keeps annotation source and purpose on their attachments', () => {
    const annotations: StagedAttachment[] = [
      {
        kind: 'file',
        localId: 'image-1',
        label: 'Reference.png',
        mediaType: 'image/png',
        status: 'ready',
        upload: { id: 'up-image', kind: 'image' } as UploadInfo
      },
      {
        kind: 'drawing',
        purpose: 'annotation',
        localId: 'annotation-1',
        label: 'Annotation.png',
        mediaType: 'image/png',
        source: 'dashboard',
        status: 'ready',
        upload: { id: 'up-annotation', kind: 'image' } as UploadInfo
      },
      {
        kind: 'drawing',
        purpose: 'annotation',
        localId: 'annotation-2',
        label: 'Annotation.png',
        mediaType: 'image/png',
        source: 'quintlets/roadmap',
        status: 'ready',
        upload: { id: 'up-annotation-2', kind: 'image' } as UploadInfo
      }
    ]

    expect(prepareDraftAttachments(annotations).attachments).toEqual([
      { type: 'upload', uploadId: 'up-image' },
      { type: 'upload', uploadId: 'up-annotation', source: 'dashboard', purpose: 'annotation' },
      {
        type: 'upload',
        uploadId: 'up-annotation-2',
        source: 'quintlets/roadmap',
        purpose: 'annotation'
      }
    ])
  })

  test('keeps a new-quintlet sketch purpose with its upload', () => {
    const sketch: StagedAttachment = {
      kind: 'drawing',
      purpose: 'sketch',
      localId: 'sketch-1',
      label: 'Sketch.png',
      mediaType: 'image/png',
      source: 'quintlets/draft-1',
      status: 'ready',
      upload: { id: 'up-sketch', kind: 'image' } as UploadInfo
    }

    expect(prepareDraftAttachments([sketch]).attachments).toEqual([
      {
        type: 'upload',
        uploadId: 'up-sketch',
        source: 'quintlets/draft-1',
        purpose: 'sketch'
      }
    ])
  })

  test('only a composer send may clear the staged list', () => {
    expect(ownsComposerAttachments(undefined)).toBe(true)
    expect(ownsComposerAttachments({ directives: ['x'] })).toBe(true)
    expect(ownsComposerAttachments({ applet: { kind: 'widget', id: 'late-orders' } })).toBe(false)
  })
})
