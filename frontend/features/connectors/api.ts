import { useQuery } from '@tanstack/react-query'

import { requestJson } from '@/frontend/api/http'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import type { McpServer } from '@/shared/types'

export function useWorkspaceMcp(workspaceId: string, enabled: boolean) {
  return useQuery<McpServer[]>({
    queryKey: workspaceKeys.mcp(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/mcp`),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}
