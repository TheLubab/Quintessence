import { type ReactNode, useEffect, useState } from 'react'

import { wsUrl } from '@/frontend/utils/ws-url'
import { AppContext, type AppContextValue } from '@/frontend/platform/app-context'
import { WorkspaceEventsClient } from '@/frontend/platform/workspace-events'

type AppProviderProps = {
  children: ReactNode
}

// App-wide services, mounted once at the root (main.tsx). Opens the workspace
// events socket when the app mounts and closes it when the app unmounts, so
// the connection outlives every route.
export function AppProvider({ children }: AppProviderProps) {
  const [value] = useState<AppContextValue>(() => ({
    events: new WorkspaceEventsClient(wsUrl('/api/workspaces/ws'))
  }))

  useEffect(() => {
    value.events.connect()
    return () => value.events.close()
  }, [value])

  return <AppContext value={value}>{children}</AppContext>
}
