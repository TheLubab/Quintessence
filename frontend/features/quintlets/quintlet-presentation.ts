import { DocumentTextIcon } from '@solar-icons/react/linear'
import type { Icon as SolarIcon } from '@solar-icons/react/lib/types'

import { resolveAppIcon } from '@/frontend/utils/app-icon-registry'
import type { QuintletInfo } from '@/shared/types'

export function getQuintletLabel(quintlet: QuintletInfo): string {
  return quintlet.title || (quintlet.status === 'compiled' ? quintlet.id : 'New quintlet')
}

export function getQuintletIcon(quintlet: QuintletInfo): SolarIcon {
  return resolveAppIcon(quintlet.icon) ?? DocumentTextIcon
}
