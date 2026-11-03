import { Redirect } from 'wouter'
import { useAccount } from '../account/account-provider'
import { ProfileSettings } from './profile-settings'

export function SettingsPage() {
  const account = useAccount()
  if (account.demo) return <Redirect to="/" replace />
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-12">
        <h1 className="text-xl font-medium">Settings</h1>
        <div className="flex w-full max-w-xl min-w-0 flex-col gap-4">
          <ProfileSettings />
        </div>
      </div>
    </div>
  )
}
