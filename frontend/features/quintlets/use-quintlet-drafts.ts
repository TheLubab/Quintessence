import { useCallback, useEffect, useRef } from 'react'
import { toast } from '@/frontend/components/ui/toast'
import { useLatestRef } from '@/frontend/utils/use-latest-ref'
import { useUiStore } from '@/frontend/store/ui'
import { composerDraftKey, draftSessionId } from '@/shared/session-drafts'
import { quintletTabId } from '@/shared/workspace-tabs'
import type { PendingQuintlet } from '@/shared/types'

type UseQuintletDraftsOptions = {
  workspaceId: string
  pendingQuintlets: PendingQuintlet[]
  onSave: (quintletId: string, requirements: string) => Promise<unknown>
}

// The composer owns local text. This hook seeds server-saved requirements and
// autosaves changes without subscribing the workspace screen to keystrokes.
export function useQuintletDrafts({ workspaceId, pendingQuintlets, onSave }: UseQuintletDraftsOptions) {
  const initializedRef = useRef(new Set<string>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingQuintletsRef = useLatestRef(pendingQuintlets)
  const onSaveRef = useLatestRef(onSave)
  const clear = useCallback(
    (quintletId: string) => {
      clearTimeout(timersRef.current.get(quintletId))
      timersRef.current.delete(quintletId)
      useUiStore
        .getState()
        .setComposerDraft(composerDraftKey(workspaceId, draftSessionId(quintletTabId(quintletId))), null)
    },
    [workspaceId]
  )

  useEffect(() => {
    for (const quintlet of pendingQuintlets) {
      const draftId = draftSessionId(quintletTabId(quintlet.id))
      const key = composerDraftKey(workspaceId, draftId)
      useUiStore.getState().moveComposerDraft(draftId, key)
      if (quintlet.status !== 'draft') clear(quintlet.id)
      else if (!initializedRef.current.has(key)) {
        initializedRef.current.add(key)
        if (useUiStore.getState().composerDrafts[key] === undefined)
          useUiStore.getState().setComposerDraft(key, quintlet.requirements)
      }
    }
  }, [workspaceId, pendingQuintlets, clear])

  useEffect(() => {
    const timers = timersRef.current
    const saveDraft = (quintletId: string) => {
      if (pendingQuintletsRef.current.find(quintlet => quintlet.id === quintletId)?.status !== 'draft') return
      const key = composerDraftKey(workspaceId, draftSessionId(quintletTabId(quintletId)))
      const value = useUiStore.getState().composerDrafts[key]
      if (value === undefined) return
      void onSaveRef.current(quintletId, value).catch(() => {
        toast.add({ title: 'Couldn’t save quintlet description', type: 'error' })
      })
    }
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      for (const quintlet of pendingQuintletsRef.current) {
        if (quintlet.status !== 'draft') continue
        const key = composerDraftKey(workspaceId, draftSessionId(quintletTabId(quintlet.id)))
        const value = state.composerDrafts[key]
        if (value === previous.composerDrafts[key]) continue
        clearTimeout(timers.get(quintlet.id))
        timers.delete(quintlet.id)
        if (value === undefined) continue
        timers.set(
          quintlet.id,
          setTimeout(() => {
            timers.delete(quintlet.id)
            saveDraft(quintlet.id)
          }, 500)
        )
      }
    })
    return () => {
      unsubscribe()
      // Recovery unmounts the workspace. Flush edits still in the debounce window.
      for (const [quintletId, timer] of timers) {
        clearTimeout(timer)
        saveDraft(quintletId)
      }
      timers.clear()
    }
  }, [workspaceId, pendingQuintletsRef, onSaveRef])

  return { clear }
}
