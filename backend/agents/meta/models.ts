import type { Model } from '@/shared/types'

import { listMetaModels } from './client'

// The Muse host owns the catalog; `model/list` is a query, not a command.
export function getMetaModels(workspacePath: string): Promise<Model[]> {
  return listMetaModels(workspacePath)
}
