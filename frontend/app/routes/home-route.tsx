import { TopbarLayout } from '@/frontend/app/shell/topbar-layout'
import { HomePage } from '@/frontend/features/home/home-page'
import { useWorkspaceTheme } from '@/frontend/platform/workspace-theme'
import { DEFAULT_WORKSPACE_THEME } from '@/shared/themes'

// The `/` route: the app shell wrapping the workspaces quintlet.
export function HomeRoute() {
  // Home has its own neutral appearance, independent of the last workspace.
  useWorkspaceTheme(DEFAULT_WORKSPACE_THEME)
  return (
    <TopbarLayout>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HomePage />
      </div>
    </TopbarLayout>
  )
}
