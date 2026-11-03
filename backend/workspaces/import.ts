import type { WorkspaceType } from '@/shared/types'

export type WorkspaceImportMetadata = {
  name?: string
  lastRunAt?: string
}

// Meta workspaces carry no provider-owned identity. The external runtime
// supplies conversation state at request time, so import needs no extra
// registry metadata.
export async function resolveWorkspaceImportMetadata(
  _path: string,
  _type: WorkspaceType
): Promise<WorkspaceImportMetadata> {
  return {}
}
