import { TopbarLayout } from '@/frontend/app/shell/topbar-layout'
import { SettingsPage } from '@/frontend/features/settings/settings-page'

export function SettingsRoute() {
  return (
    <TopbarLayout>
      <SettingsPage />
    </TopbarLayout>
  )
}
