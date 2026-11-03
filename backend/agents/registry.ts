// WorkspaceType → Harness lookup. Meta is the only supported backend.
import type { WorkspaceEntry, WorkspaceType } from '@/shared/types'

import { metaHarness } from './meta'
import type { Harness } from './types'

export type { Harness, HarnessCapabilities, SendMessageInput } from './types'

const harnesses = {
  meta: metaHarness
} satisfies Record<WorkspaceType, Harness>

export function harnessFor(ws?: Pick<WorkspaceEntry, 'type'> | WorkspaceType): Harness {
  const type = typeof ws === 'string' ? ws : ws?.type
  if (type !== undefined && type !== 'meta') throw new Error('Unsupported agent')
  return metaHarness
}

export function allHarnesses(): Harness[] {
  return [metaHarness]
}

export function isHarnessType(value: unknown): value is WorkspaceType {
  return value === 'meta'
}

export { harnesses }
