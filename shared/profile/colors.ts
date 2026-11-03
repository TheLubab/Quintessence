export type UserColor =
  | 'pink'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'cyan'
  | 'blue'
  | 'violet'

// The eight Tailwind palette names available for users. Their shades live in CSS.
export const USER_COLORS = [
  'pink',
  'orange',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet'
] as const satisfies readonly UserColor[]

export function isUserColor(value: unknown): value is UserColor {
  return typeof value === 'string' && (USER_COLORS as readonly string[]).includes(value)
}

export function colorForId(id: string): UserColor {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return USER_COLORS[(hash >>> 0) % USER_COLORS.length] ?? USER_COLORS[0]
}
