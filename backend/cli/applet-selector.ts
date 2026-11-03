import type { AppletSelector } from '@/shared/applet-selector'
import { parseAppletSelector } from '@/shared/applet-selector'
import pc from './pc'

export const appletOnlyArg = {
  type: 'string' as const,
  description: 'Limit to "widgets", "quintlets", "widgets/<id>", or "quintlets/<id>"'
}

export function readAppletSelector(value: string | undefined): AppletSelector | undefined {
  if (value === undefined) return undefined
  if (parseAppletSelector(value)) return value as AppletSelector
  console.error(
    '\n' +
      pc.red('✗') +
      ` Invalid --only value "${value}" — use "widgets", "quintlets", "widgets/<id>", or "quintlets/<id>".\n`
  )
  process.exit(1)
}
