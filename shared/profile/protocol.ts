import { isUserColor } from './colors'
import type { UserProfile } from './types'
export function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    !!v.id.trim() &&
    isUserColor(v.color) &&
    (v.name === undefined || typeof v.name === 'string') &&
    (v.avatar === undefined || typeof v.avatar === 'string') &&
    (v.email === undefined || typeof v.email === 'string')
  )
}
