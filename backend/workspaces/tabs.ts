// Tab discovery with portable navigation addresses.
import type { QuintletInfo, WorkspaceTabId } from '@/shared/types'
import { quintletTabId } from '@/shared/workspace-tabs'

// One row of `quint tabs`. `isDefault` marks the workspace's saved default tab
// (`layout.tabs.active`) — where a bare `/workspace/:id` lands.
export type TabRow = {
  id: WorkspaceTabId
  title: string
  isDefault: boolean
  href: string
}

// The always-present tabs, titled like the tab bar renders them.
const STATIC_TABS: { id: WorkspaceTabId; title: string }[] = [
  { id: 'dashboard', title: 'Dashboard' },
  { id: 'canvas', title: 'Canvas' }
]

// The `quint tabs` listing: static tabs plus every compiled or pending quintlet, with
// the saved default marked.
export function assembleTabRows(quintlets: QuintletInfo[], defaultTab: WorkspaceTabId): TabRow[] {
  return [
    ...STATIC_TABS,
    ...quintlets.map(quintlet => ({ id: quintletTabId(quintlet.id), title: quintlet.title || quintlet.id }))
  ].map(row => ({
    ...row,
    isDefault: row.id === defaultTab,
    href: `quint:/${row.id}`
  }))
}

// CLI navigation checks the server's current built-quintlet list before asking a
// browser to move. The browser repeats the availability check in case its quintlet
// list is stale in either direction.
export function assertNavigableTab(tab: WorkspaceTabId, quintlets: QuintletInfo[]): void {
  const rows = assembleTabRows(quintlets, 'dashboard')
  if (rows.some(row => row.id === tab)) return
  throw new Error(
    `Unknown destination "quint:/${tab}". Valid addresses: ${rows.map(row => row.href).join(', ')}`
  )
}
