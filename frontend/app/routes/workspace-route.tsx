import { useWorkspaceTheme } from '@/frontend/platform/workspace-theme'
import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { TopbarLayout } from '@/frontend/app/shell/topbar-layout'
import { useSelectedSession } from '@/frontend/features/chat/sessions/use-selected-session'
import { useAppletCacheInvalidation } from '@/frontend/features/applets/use-applet'
import { Workspace } from '@/frontend/features/workspace/workspace-context'
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayoutCtx
} from '@/frontend/features/workspace/workspace-layout-context'
import { WorkspaceScreen } from '@/frontend/features/workspace/workspace-screen'
import { useQuintlets } from '@/frontend/features/quintlets/api'
import { useWidgets } from '@/frontend/features/dashboard/api'
import { useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'
import { BROWSER_TAB_ID } from '@/frontend/utils/browser-tab-id'

type WorkspaceRouteProps = {
  id: string
}

// Navigation reads the raw browser address so encoded paths and query params
// are decoded exactly once; the route only owns the workspace ID.
export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <WorkspaceContent id={id} />
      </WorkspaceLayoutProvider>
    </Workspace>
  )
}

function WorkspaceContent({ id }: WorkspaceRouteProps) {
  const queryClient = useQueryClient()
  const [selectedSessionId] = useSelectedSession()
  const { isLoading: layoutLoading, layout } = useWorkspaceLayoutCtx()
  useWorkspaceTheme(layout.theme)
  const widgets = useWidgets(id)
  const quintlets = useQuintlets(id)
  useAppletCacheInvalidation()

  useWorkspaceEvent(event => {
    if (event.type === 'theme:updated' || event.type === 'workspace:updated') {
      // Skip our own save: the cache already holds it, and the refetch could
      // land an older value over a newer optimistic change.
      if (event.origin === BROWSER_TAB_ID) return
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(id) })
    } else if (event.type === 'widget-layout:updated' || event.type === 'widget:updated') {
      // widget:updated too: a rebundle bumps the widget's content revision, and
      // the thumbnail invalidation hook reads it off this query.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.widgets(id) })
    } else if (event.type === 'quintlet-layout:updated' || event.type === 'quintlet:updated') {
      // quintlet:updated also bumps the built bundle revision used by thumbnail
      // freshness checks.
      queryClient.invalidateQueries({ queryKey: workspaceKeys.quintlets(id) })
    }
  })

  const contentPending =
    layoutLoading || selectedSessionId === undefined || widgets.isLoading || quintlets.isLoading

  return (
    <TopbarLayout>
      {/* Reset the screen when switching between shared and browser tab state. */}
      <WorkspaceScreen
        key={'shared'}
        contentPending={contentPending}
        widgets={widgets.data}
        quintlets={quintlets.data ?? []}
      />
    </TopbarLayout>
  )
}
