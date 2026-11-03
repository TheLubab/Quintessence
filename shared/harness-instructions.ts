import type { WorkspaceType } from './types'

type HarnessInstruction = {
  reason: string
  command: string
}

export const HARNESS_INSTRUCTIONS: Record<WorkspaceType, HarnessInstruction> = {
  meta: {
    reason: 'Set the Meta runtime configuration:',
    command: 'META_RUNTIME_URL=... META_API_KEY=... quint start'
  }
}

export function harnessInstructionMessage(type: WorkspaceType): string {
  const { reason, command } = HARNESS_INSTRUCTIONS[type]
  return `${reason} ${command}`
}
