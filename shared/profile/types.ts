import type { UserColor } from './colors'
export type UserProfile = {
  id: string
  name?: string
  color: UserColor
  avatar?: string
  email?: string
}
