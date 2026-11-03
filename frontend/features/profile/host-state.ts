import { isUserProfile } from '@/shared/profile/protocol'
import type { UserProfile } from '@/shared/profile/types'
import { createLocalUser } from './local-user'
const PROFILE_KEY = 'quint:local-profile'
let currentUser: UserProfile | undefined
const listeners = new Set<() => void>()
export function getCurrentUser() {
  return currentUser
}
export function subscribeCurrentUserStore(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function setLocalUser(profile: UserProfile) {
  if (!isUserProfile(profile)) throw new Error('Invalid user profile')
  currentUser = profile
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {}
  listeners.forEach(listener => listener())
}
export function initializeLocalUser(local: boolean) {
  if (!local || currentUser) return
  try {
    const saved = localStorage.getItem(PROFILE_KEY)
    if (saved) {
      const profile: unknown = JSON.parse(saved)
      if (isUserProfile(profile)) {
        setLocalUser(profile)
        return
      }
    }
  } catch {}
  setLocalUser(createLocalUser())
}
export function subscribeLocalProfileStorage() {
  const receive = (event: StorageEvent) => {
    if (event.key !== PROFILE_KEY || !event.newValue) return
    try {
      const profile: unknown = JSON.parse(event.newValue)
      if (isUserProfile(profile)) {
        currentUser = profile
        listeners.forEach(listener => listener())
      }
    } catch {}
  }
  window.addEventListener('storage', receive)
  return () => window.removeEventListener('storage', receive)
}
