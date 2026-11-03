import type { HarnessAvailability } from '@/shared/types'

export type AgentAvailability =
  | HarnessAvailability
  | { status: 'checking' }
  | { status: 'disconnected' }

export function resolveAgentAvailability(
  availability: HarnessAvailability | undefined,
  disconnected: boolean
): AgentAvailability {
  if (disconnected) return { status: 'disconnected' }
  return availability ?? { status: 'checking' }
}
