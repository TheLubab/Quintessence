import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useAppConfig } from '@/frontend/api/app-config'
import {
  getCurrentUser,
  setLocalUser,
  subscribeCurrentUserStore
} from '@/frontend/features/profile/host-state'

function useAccountState() {
  const { demo } = useAppConfig()
  const profile = useSyncExternalStore(subscribeCurrentUserStore, getCurrentUser, getCurrentUser)
  async function saveName(value: string) {
    const name = value.trim()
    if (!name || name.length > 80) throw new Error('Enter a name of up to 80 characters')
    if (!profile) throw new Error('No local profile is available')
    setLocalUser({ ...profile, name })
    return name
  }
  return {
    demo,
    profile,
    canEdit: true,
    saveName,
    status: demo ? 'signed-out' : profile ? 'ready' : 'error',
    retry: () => window.location.reload()
  }
}
const AccountContext = createContext<ReturnType<typeof useAccountState> | undefined>(undefined)
export function AccountProvider({ children }: { children: ReactNode }) {
  return <AccountContext value={useAccountState()}>{children}</AccountContext>
}
export function useAccount() {
  const account = useContext(AccountContext)
  if (!account) throw new Error('AccountProvider is required')
  return account
}
