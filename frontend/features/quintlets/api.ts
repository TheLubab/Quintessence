import type {
  CompiledQuintlet,
  MessageAttachment,
  PendingQuintlet,
  QuintletInfo,
  WorkspaceState
} from '@/shared/types'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { jsonRequest, requestJson, requestVoid } from '@/frontend/api/http'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import {
  getCachedWorkspaceState,
  useWorkspaceState
} from '@/frontend/features/workspace/workspace-state'
import { useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'

// Compiled quintlets from `.quint/quintlets/`. Build and layout events refetch the list;
// mounts within 30 s reuse it.
export function compiledQuintletsOptions(workspaceId: string) {
  return {
    queryKey: workspaceKeys.quintlets(workspaceId),
    queryFn: async () =>
      (
        await requestJson<{ quintlets: CompiledQuintlet[] }>(
          `/api/workspaces/${workspaceId}/quintlets`
        )
      ).quintlets,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  }
}

// Compiled quintlets first, then the quintlets still being built (from the workspace
// state), in creation order. A quintlet that just compiled shows once.
export function mergeQuintlets(
  compiled: CompiledQuintlet[] | undefined,
  pending: WorkspaceState['pendingQuintlets'] | undefined
): QuintletInfo[] | undefined {
  if (!compiled || !pending) return undefined
  const ids = new Set(compiled.map(quintlet => quintlet.id))
  const building = Object.entries(pending)
    .filter(([id]) => !ids.has(id))
    .map(([id, quintlet]): PendingQuintlet => ({ id, ...quintlet }))
  return [...compiled, ...building]
}

export function getCachedQuintlets(
  queryClient: QueryClient,
  workspaceId: string
): QuintletInfo[] | undefined {
  return mergeQuintlets(
    queryClient.getQueryData<CompiledQuintlet[]>(workspaceKeys.quintlets(workspaceId)),
    getCachedWorkspaceState(queryClient, workspaceId)?.pendingQuintlets
  )
}

const selectPendingQuintlets = (state: WorkspaceState) => state.pendingQuintlets

export function useQuintlets(workspaceId: string) {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (event.type === 'quintlet:deleted' && event.workspaceId === workspaceId) {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.quintlets(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    }
  })
  const compiled = useQuery(compiledQuintletsOptions(workspaceId))
  const pending = useWorkspaceState(workspaceId, selectPendingQuintlets)
  const data = useMemo(
    () => mergeQuintlets(compiled.data, pending.data),
    [compiled.data, pending.data]
  )
  return { data, isLoading: compiled.isLoading || pending.isLoading }
}
function useQuintletMutation<T, Input>(
  workspaceId: string,
  mutationFn: (input: Input) => Promise<T>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceKeys.quintlets(workspaceId) })
  })
}
export function useRenameQuintlet(workspaceId: string) {
  return useQuintletMutation(
    workspaceId,
    ({ quintletId, title }: { quintletId: string; title: string }) =>
      requestJson<QuintletInfo>(
        `/api/workspaces/${workspaceId}/quintlets/${encodeURIComponent(quintletId)}`,
        jsonRequest('PATCH', { title }),
        'Couldn’t rename quintlet'
      )
  )
}
export function useDeleteQuintlet(workspaceId: string) {
  return useQuintletMutation(workspaceId, (quintletId: string) =>
    requestVoid(
      `/api/workspaces/${workspaceId}/quintlets/${encodeURIComponent(quintletId)}`,
      { method: 'DELETE' },
      'Couldn’t delete quintlet'
    )
  )
}
export function useCreateQuintlet(workspaceId: string) {
  return useQuintletMutation(workspaceId, () =>
    requestJson<PendingQuintlet>(
      `/api/workspaces/${workspaceId}/quintlets`,
      jsonRequest('POST'),
      'Couldn’t create quintlet'
    )
  )
}
export function useSaveQuintletDraft(workspaceId: string) {
  return useQuintletMutation(
    workspaceId,
    ({ quintletId, requirements }: { quintletId: string; requirements: string }) =>
      requestJson<PendingQuintlet>(
        `/api/workspaces/${workspaceId}/quintlets/${quintletId}`,
        jsonRequest('PATCH', { requirements }),
        'Couldn’t save quintlet requirements'
      )
  )
}
export type SubmitQuintletInput = {
  quintletId: string
  requirements: string
  sessionId: string
  optimisticId: string
  attachments?: MessageAttachment[]
  model?: string
  effort?: string
  fastMode?: boolean
  stream?: boolean
}
export function useSubmitQuintlet(workspaceId: string) {
  return useQuintletMutation(workspaceId, ({ quintletId, ...input }: SubmitQuintletInput) =>
    requestJson<{ quintletId: string; sessionId: string }>(
      `/api/workspaces/${workspaceId}/quintlets/${quintletId}/submit`,
      jsonRequest('POST', input),
      'Couldn’t start quintlet chat'
    )
  )
}
export const useDiscardQuintlet = useDeleteQuintlet
