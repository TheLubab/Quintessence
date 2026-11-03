import { useCallback, useMemo } from 'react'

import type { WorkspaceTabsState } from '@/shared/types'
import { normalizeWorkspaceTabs } from '@/shared/workspace-layout'
import { useWorkspaceLayoutCtx } from './workspace-layout-context'

export function useWorkspaceTabs() {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const defaults = useMemo(() => normalizeWorkspaceTabs(layout.tabs), [layout.tabs])
  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      const next = normalizeWorkspaceTabs(tabs)
      setLayout({ tabs: next })
      return next
    },
    [setLayout]
  )
  return [defaults, setTabs] as const
}
