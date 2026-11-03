import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { useUpdateEnv, useWorkspaceEnv } from '@/frontend/features/settings/api'
import { useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'

// Workspace env state in one hook: the masked env view (query), the patch
// mutation, and live tracking — anything that changes the env outside this
// client (the `quint env` CLI, another tab) makes the server broadcast
// `env:updated`, which invalidates the query so consumers stay fresh without
// wiring the subscription themselves.
export function useEnvVars(workspaceId: string) {
  const qc = useQueryClient()
  useWorkspaceEvent(e => {
    if (e.type === 'env:updated' && e.workspaceId === workspaceId) {
      qc.invalidateQueries({ queryKey: workspaceKeys.env(workspaceId) })
    }
  })
  return { env: useWorkspaceEnv(workspaceId), update: useUpdateEnv(workspaceId) }
}
