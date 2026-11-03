import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { Toaster } from '@/frontend/components/ui/toast'
import { TooltipProvider } from '@/frontend/components/ui/tooltip'
import { installAppletErrorHook } from '@/frontend/features/applets/applet-log'
import { initConnection } from '@/frontend/features/chat/connection/chat-connection'
import { AccountProvider } from '@/frontend/features/account/account-provider'
import { AppProvider } from './app/app-provider'
import { AppRouter } from './app/app-router'

const queryClient = new QueryClient()

// Open the single app-wide chat WebSocket once and hand it the query client so
// live frames fold into the RQ transcript cache. Lives for the page's lifetime.
initConnection(queryClient)

// Catch applet errors that escape React (handlers, async effects) and journal
// them for `quint debug logs` — attribution is by bundle URL in the stack, so
// host-app errors never match (see features/applets/applet-log.ts).
installAppletErrorHook()

export function mount(el: HTMLElement) {
  function Root() {
    return (
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <TooltipProvider>
            <Router>
              <AccountProvider>
                <AppRouter />
              </AccountProvider>
            </Router>
            <Toaster />
          </TooltipProvider>
        </AppProvider>
      </QueryClientProvider>
    )
  }

  createRoot(el).render(<Root />)
}
