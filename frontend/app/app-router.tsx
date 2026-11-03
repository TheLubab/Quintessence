import { useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/frontend/features/chat/connection/chat-connection'
import { useWorkspaceStateSync } from '@/frontend/features/workspace/workspace-state'

import { SettingsRoute } from './routes/settings-route'
import { HomeRoute } from './routes/home-route'
import { WorkspaceRoute } from './routes/workspace-route'

// Top-level router — sets up all frontend routes
export function AppRouter() {
  const [, navigate] = useLocation()
  useWorkspaceStateSync()

  // When the server broadcasts a workspace:switch (e.g. from `quint start`),
  // navigate to that workspace
  useEffect(() => {
    setWorkspaceSwitchHandler(id => navigate(`/workspace/${id}`))
    return () => setWorkspaceSwitchHandler(null)
  }, [navigate])

  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/settings" component={SettingsRoute} />
      {/* The wildcard is the destination path (`quintlets/orders`, `dashboard`, …) —
          the URL is the tab address, read downstream with `useParams`. This
          pattern is its only definition. Keyed by workspace id only, so tab
          switches never remount the workspace tree. */}
      <Route path="/workspace/:id/*?">
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
