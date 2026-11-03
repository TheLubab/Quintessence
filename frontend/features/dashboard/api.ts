import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { requestJson } from '@/frontend/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/frontend/api/query-options'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import { useGridReconcile } from '@/frontend/features/dashboard/use-grid-reconcile'
import { withDefaultWidgets } from '@/shared/default-widgets'
import type { WidgetInfo } from '@/shared/types'

export function useWidgets(workspaceId: string) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const query = useQuery<WidgetInfo[]>({
    queryKey: workspaceKeys.widgets(workspaceId),
    queryFn: async () => {
      const data = await requestJson<{ widgets: WidgetInfo[] }>(
        `/api/workspaces/${workspaceId}/widgets`
      )
      return data.widgets
    },
    ...WORKSPACE_RESOURCE_OPTIONS
  })
  const widgets = useMemo(() => withDefaultWidgets(query.data ?? []), [query.data])

  useGridReconcile(workspaceId, query.data ? widgets : undefined, layout, setLayout)

  return { ...query, data: widgets }
}
