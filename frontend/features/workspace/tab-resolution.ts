// Pure tab-state derivation for the workspace screen. The URL is the live
// truth for the active tab (`/workspace/:id/quintlets/<id>`, etc.); the persisted layout
// keeps the open set and the saved DEFAULT tab (`tabs.active`). These helpers
// turn (URL segment + layout + what actually exists) into the rendered state.
import type { QuintletInfo, WorkspaceTabId, WorkspaceTabsState } from '@/shared/types'
import { quintletIdFromTab } from '@/shared/workspace-tabs'
import { createDefaultWorkspaceTabs } from '@/shared/workspace-layout'

const DEFAULT_TABS = createDefaultWorkspaceTabs()

// Whether a tab id points at something that exists: static tabs always do,
// quintlet tabs only while their pending or compiled quintlet exists.
export function tabAvailable(tab: WorkspaceTabId, quintlets: QuintletInfo[]) {
  if (tab === 'dashboard' || tab === 'canvas') return true
  const quintletId = quintletIdFromTab(tab)
  return quintletId ? quintlets.some(quintlet => quintlet.id === quintletId) : false
}

// The effective open set: persisted open tabs filtered to what exists, falling
// back to the defaults when nothing survives.
export function effectiveOpenTabs(tabs: WorkspaceTabsState, quintlets: QuintletInfo[]): WorkspaceTabId[] {
  const open = tabs.open.filter(tab => tabAvailable(tab, quintlets))
  return open.length > 0 ? open : DEFAULT_TABS.open
}

// An explicit URL keeps its destination, including a missing quintlet so the host
// can show recovery and report the correct address to the agent. A bare URL
// uses the saved default.
export function resolveActiveTab(
  requested: WorkspaceTabId | undefined,
  tabs: WorkspaceTabsState,
  quintlets: QuintletInfo[]
): WorkspaceTabId {
  if (requested !== undefined) {
    return requested
  }
  const open = effectiveOpenTabs(tabs, quintlets)
  return open.includes(tabs.active) ? tabs.active : (open[0] ?? 'dashboard')
}
