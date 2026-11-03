import type { WorkspaceType } from './types'

export const WORKSPACE_TYPE_ORDER = ['meta'] as const satisfies readonly WorkspaceType[]

export function orderWorkspaceTypes(types: Iterable<WorkspaceType>): WorkspaceType[] {
  const unique = new Set(types)
  return WORKSPACE_TYPE_ORDER.filter(type => unique.has(type))
}
