import { join } from 'path'

import type {
  AppletKind,
  LayoutGridItem,
  WorkspaceLayout,
  WorkspaceLayoutSave,
  WorkspacePreview
} from '@/shared/types'
import { createDefaultWorkspaceLayout, normalizeWorkspaceTabs } from '@/shared/workspace-layout'
import { isWorkspaceIcon } from '@/shared/workspace-icon'
import { normalizeQuickAccessLinks } from '@/shared/quick-access'
import { upgradeDefaultWidgetGrid } from '@/shared/default-widgets'

import { getCapturedThumbnails } from '../applet-engine/thumbnails'

function normalizeLayout(parsed: Record<string, unknown>): WorkspaceLayout {
  const defaults = createDefaultWorkspaceLayout()
  const layout = { ...defaults, ...parsed } as Record<string, unknown>
  layout.tabs = normalizeWorkspaceTabs(layout.tabs)
  if (Array.isArray(layout.widgetGrid)) {
    layout.widgetGrid = upgradeDefaultWidgetGrid(layout.widgetGrid as LayoutGridItem[])
  }
  if (layout.quickAccessLinks !== undefined) {
    layout.quickAccessLinks = normalizeQuickAccessLinks(layout.quickAccessLinks)
  }
  if (typeof layout.icon === 'string') {
    layout.icon = { type: 'upload', value: layout.icon }
  } else if (layout.icon !== undefined && !isWorkspaceIcon(layout.icon)) {
    delete layout.icon
  }
  // Legacy thumbnail caches are intentionally dropped, not migrated — images
  // now live as files under `.quint/.cache/thumbnails` (backend/applet-engine/thumbnails.ts)
  // and applets are simply captured again there.
  delete layout.widgetThumbnails
  delete layout.quintletThumbnails
  delete layout.appletThumbnails
  delete layout.sectionMode
  delete layout.chatMode
  delete layout.layoutMode
  return layout as unknown as WorkspaceLayout
}

export function getLayoutPath(workspacePath: string): string {
  return join(workspacePath, '.quint', '.workspace.json')
}

export async function loadLayout(workspacePath: string): Promise<WorkspaceLayout> {
  try {
    const text = await Bun.file(getLayoutPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed?.version === 1) return normalizeLayout(parsed)
  } catch {}
  return createDefaultWorkspaceLayout()
}

export async function saveLayout(layout: WorkspaceLayout, workspacePath: string): Promise<void> {
  await Bun.write(getLayoutPath(workspacePath), JSON.stringify(layout, null, 2))
}

// Merge a client-submitted layout over the stored one for persistence.
//
// Everything (grid, theme, AND identity) shares one
// `.workspace.json`, but the grid editor and `quint config` own different fields.
// The client's layout PUT is authoritative for the editor fields (widgetGrid,
// theme, selectedModel) — but it strips `name` and round-trips a
// possibly-stale `icon`.
// A blind overwrite therefore erases a `quint config`-set name (and could revert an
// icon). So drop whatever identity the body carries and re-apply the server-owned
// fields from `existing` — conditionally, so an absent field never serializes
// as `name: undefined`.
export function mergeLayoutForSave(
  existing: WorkspaceLayout,
  body: WorkspaceLayoutSave
): WorkspaceLayout {
  const { name: _name, icon: _icon, ...editor } = body
  // Stale clients may still round-trip the pre-`.cache` thumbnail records;
  // never let a layout PUT resurrect them in `.workspace.json`.
  delete (editor as Record<string, unknown>).appletThumbnails
  const quickAccessLinks = editor.quickAccessLinks ?? existing.quickAccessLinks
  return {
    ...editor,
    ...(quickAccessLinks !== undefined && {
      quickAccessLinks: normalizeQuickAccessLinks(quickAccessLinks)
    }),
    // Personal navigation never writes tabs. Other layout edits must not
    // round-trip a stale copy of the workspace's authored defaults.
    tabs: editor.tabs === undefined ? existing.tabs : normalizeWorkspaceTabs(editor.tabs),
    ...(existing.name !== undefined && { name: existing.name }),
    ...(existing.icon !== undefined && { icon: existing.icon })
  }
}

// Thumbnails for the home screen's workspace card. Widgets take the front
// slots in grid order, then recent quintlets fill what remains.
const PREVIEW_LIMIT = 3
const PREVIEW_MESSAGE_LIMIT = 240

function normalizePreviewMessage(message: string | undefined): string | undefined {
  const normalized = message?.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (normalized.length <= PREVIEW_MESSAGE_LIMIT) return normalized
  return `${normalized.slice(0, PREVIEW_MESSAGE_LIMIT - 1).trimEnd()}…`
}

export type WorkspacePreviewOptions = {
  getProviderPreview?: (includeFirstUserMessage: boolean) => Promise<{
    firstUserMessage?: string
    updatedAt?: number
  }>
  quintletIds?: readonly string[]
  // Maps a captured applet to the image URL the home card should render —
  // the API layer owns the route shape (GET .../applet-thumbnails/:kind/:id).
  // `version` changes with every capture, so the URL can be cached forever.
  thumbnailUrl: (kind: AppletKind, id: string, version: string) => string
}

export async function getWorkspacePreview(
  workspacePath: string,
  { getProviderPreview, quintletIds = [], thumbnailUrl }: WorkspacePreviewOptions
): Promise<WorkspacePreview> {
  try {
    const layout = await loadLayout(workspacePath)
    const captured = await getCapturedThumbnails(workspacePath)
    const validQuintletIds = new Set(quintletIds)
    const capturedWidgets = new Map(
      captured
        .filter(record => record.kind === 'widget')
        .map(record => [record.id, record.capturedAt])
    )
    const widgetImages = [...layout.widgetGrid]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .flatMap(item => {
        const version = capturedWidgets.get(item.i)
        return version === undefined ? [] : [thumbnailUrl('widget', item.i, version)]
      })
    const quintletImages = captured
      .filter(record => record.kind === 'quintlet' && validQuintletIds.has(record.id))
      .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt))
      .map(record => thumbnailUrl('quintlet', record.id, record.capturedAt))
    const thumbnails = [...widgetImages, ...quintletImages].slice(0, PREVIEW_LIMIT)
    // The message bubble is the card's fallback for "nothing to show": gate on
    // captured thumbnails, not grid emptiness — a workspace with widgets that
    // were never captured (never opened in a browser) still renders an empty
    // folder otherwise.
    const includeFirstUserMessage = thumbnails.length === 0
    const providerPreview = await getProviderPreview?.(includeFirstUserMessage).catch(
      () => undefined
    )
    const updatedAt = providerPreview?.updatedAt
    const theme = layout.theme

    if (includeFirstUserMessage) {
      const firstUserMessage = normalizePreviewMessage(providerPreview?.firstUserMessage)
      return {
        thumbnails,
        ...(firstUserMessage ? { firstUserMessage } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
        ...(theme ? { theme } : {})
      }
    }

    return {
      thumbnails,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
      ...(theme ? { theme } : {})
    }
  } catch {
    return { thumbnails: [] }
  }
}
