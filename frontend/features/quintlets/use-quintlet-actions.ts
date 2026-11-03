import { useUiStore } from '@/frontend/store/ui'
import { draftSessionId, composerDraftKey } from '@/shared/session-drafts'
import { useQueryClient } from '@tanstack/react-query'

import {
  prepareOptimisticSend,
  moveChatDraft,
  finishComposerSend,
  attachmentsForSend,
  resolveChatRunOptions,
  startOptimisticSession
} from '@/frontend/features/chat/chat-send'
import {
  renameSelectedSessionInCache,
  setSelectedSessionInCache,
  usePinnedSession
} from '@/frontend/features/chat/sessions/use-selected-session'
import {
  changeWorkspaceStateCache,
  getCachedWorkspaceState
} from '@/frontend/features/workspace/workspace-state'
import { useWorkspaceAgent } from '@/frontend/features/workspace/api'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import {
  useCreateQuintlet,
  useDiscardQuintlet,
  useSaveQuintletDraft,
  useSubmitQuintlet
} from '@/frontend/features/quintlets/api'
import { recoverQuintletSubmission } from './quintlet-submission'
import type { PendingQuintlet } from '@/shared/types'
import { quintletTabId } from '@/shared/workspace-tabs'

export function useQuintletActions() {
  const queryClient = useQueryClient()
  const { workspaceId, layout } = useWorkspaceLayoutCtx()
  const { pinnedSessionId } = usePinnedSession()
  const modelData = useWorkspaceAgent(workspaceId).data
  const createMutation = useCreateQuintlet(workspaceId)
  const saveMutation = useSaveQuintletDraft(workspaceId)
  const submitMutation = useSubmitQuintlet(workspaceId)
  const discardMutation = useDiscardQuintlet(workspaceId)

  const create = () => createMutation.mutateAsync()

  const save = (quintletId: string, requirements: string) =>
    saveMutation.mutateAsync({ quintletId, requirements })

  const submit = async (pendingQuintlet: PendingQuintlet, requirements: string) => {
    const text = requirements.trim()
    const draftId = pinnedSessionId ?? draftSessionId(quintletTabId(pendingQuintlet.id))
    const sessionId = pinnedSessionId ?? crypto.randomUUID()
    const attachments = attachmentsForSend(workspaceId, draftId)
    if (!text && attachments.length === 0) return

    if (!pinnedSessionId)
      startOptimisticSession({
        tabId: quintletTabId(pendingQuintlet.id),
        queryClient,
        workspaceId,
        sessionId,
        text,
        filenames: attachments.map(attachment => attachment.label)
      })
    if (!pinnedSessionId) {
      moveChatDraft(workspaceId, draftId, sessionId)
      setSelectedSessionInCache(
        queryClient,
        workspaceId,
        sessionId,
        quintletTabId(pendingQuintlet.id)
      )
    }
    const prepared = prepareOptimisticSend(
      { queryClient, workspaceId, sessionId, text },
      attachments
    )

    const config = getCachedWorkspaceState(queryClient, workspaceId)?.sessions[sessionId]?.config
    const { model, effort, fastMode, stream } = resolveChatRunOptions(
      modelData,
      config?.model ?? layout.selectedModel,
      config?.effort ?? layout.selectedEffort,
      config?.fastMode ?? layout.selectedFastMode
    )

    changeWorkspaceStateCache(queryClient, workspaceId, draft => {
      const quintlet = draft.pendingQuintlets[pendingQuintlet.id]
      if (quintlet?.status === 'draft')
        Object.assign(quintlet, {
          status: 'starting',
          requirements: text,
          buildSessionId: sessionId
        })
    })

    try {
      const result = await submitMutation.mutateAsync({
        quintletId: pendingQuintlet.id,
        sessionId,
        requirements: text,
        optimisticId: prepared.optimisticId,
        ...(attachments.length > 0
          ? {
              attachments: prepared.attachments
            }
          : {}),
        model,
        effort,
        fastMode,
        stream
      })
      moveChatDraft(workspaceId, sessionId, result.sessionId)
      renameSelectedSessionInCache(queryClient, workspaceId, sessionId, result.sessionId)
      if (!pinnedSessionId)
        setSelectedSessionInCache(
          queryClient,
          workspaceId,
          result.sessionId,
          quintletTabId(pendingQuintlet.id)
        )
      finishComposerSend(workspaceId, attachments)
      const draftKey = composerDraftKey(workspaceId, result.sessionId)
      const ui = useUiStore.getState()
      if (ui.composerDrafts[draftKey]?.trim() === text) ui.setComposerDraft(draftKey, null)
    } catch (error) {
      await recoverQuintletSubmission(
        queryClient,
        workspaceId,
        pendingQuintlet.id,
        sessionId,
        text,
        !!pinnedSessionId
      )
      throw error
    }
  }

  const discard = (quintletId: string) => discardMutation.mutateAsync(quintletId)

  return {
    create,
    save,
    submit,
    discard
  }
}
