import { useCallback, useMemo, useState } from 'react'

import { AnimatePresence, LayoutGroup } from 'motion/react'

import { sortLayoutItemsByRowCol } from 'react-grid-layout'

import { useAppletThumbnails } from '@/frontend/features/applets/applet-thumbnail'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import { renderDefaultWidget } from '@/frontend/features/dashboard/default/registry'
import {
  findWidgetPosition,
  packItems,
  updateStoredGridPositions
} from '@/frontend/features/dashboard/grid'
import type { GridItem, GridPosition, PositionedGridItem } from '@/frontend/features/dashboard/grid'
import { WidgetShell } from '@/frontend/features/applets/widget-shell'
import { Button } from '@/frontend/components/ui/button'
import { useUiStore } from '@/frontend/store/ui'
import type { CompiledQuintlet, WidgetInfo } from '@/shared/types'
import { isDefaultWidget } from '@/shared/default-widgets'

import { HiddenPanel } from './hidden-panel'
import { WidgetCanvas } from './widget-canvas'

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
}

function NoWidgetsCreated({ onCreateWidget }: NoWidgetsCreatedProps) {
  return (
    <button
      type="button"
      onClick={onCreateWidget}
      className="group flex size-full min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background p-5 text-center text-sm text-foreground transition-colors duration-200 ease-out squircle hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="text-muted-foreground">Ask your agent to create a widget to show here</span>
    </button>
  )
}

type DashboardCustomizeBarProps = {
  onAutoArrange: () => void
  onReset: () => void
  onDone: () => void
}

function DashboardCustomizeBar({ onAutoArrange, onReset, onDone }: DashboardCustomizeBarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">Customize widgets</p>
        <p className="hidden text-xs text-muted-foreground sm:block">Drag widgets to rearrange</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onAutoArrange}>
          Auto-arrange
        </Button>
        <Button type="button" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}

// Reserve the open bottom panel's height in the canvas so every widget stays reachable.
function usePanelHeight() {
  const [height, setHeight] = useState(0)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    let frame: number | undefined
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const box = entry.borderBoxSize?.[0]
      const height = box ? box.blockSize : entry.contentRect.height
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = undefined
        setHeight(height)
      })
    })
    ro.observe(node)
    return () => {
      ro.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [])
  return [ref, height] as const
}

type DashboardProps = {
  onCreateWidget: () => void
  onStartPrompt: (prompt: string) => void
  onCreateQuintlet: () => void
  onOpenQuintlet: (quintletId: string) => void
  onAskAgent: (widgetName: string) => void
  customizing: boolean
  onCustomizingChange: (customizing: boolean) => void
  // Authoritative widget set from useWidgets; positions come from layout.
  widgets: WidgetInfo[]
  quintlets: CompiledQuintlet[]
}

export function Dashboard({
  onCreateWidget,
  onStartPrompt,
  onCreateQuintlet,
  onOpenQuintlet,
  onAskAgent,
  customizing,
  onCustomizingChange,
  widgets,
  quintlets
}: DashboardProps) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const hasSentMessageFromQuint = useUiStore(state => state.hasSentMessageFromQuint)
  const [customizeSession, setCustomizeSession] = useState(() => ({
    customizing,
    startingGrid: layout.widgetGrid
  }))

  if (customizeSession.customizing !== customizing) {
    setCustomizeSession({
      customizing,
      startingGrid: customizing ? layout.widgetGrid : customizeSession.startingGrid
    })
  }

  const widgetById = useMemo(() => new Map(widgets.map(widget => [widget.id, widget])), [widgets])

  const visibleItems = useMemo<PositionedGridItem[]>(
    () =>
      layout.widgetGrid
        .filter(g => widgetById.has(g.i))
        .map(g => {
          const widget = widgetById.get(g.i)!
          return {
            id: g.i,
            w: Math.min(4, Math.max(1, g.w ?? widget.config.colSpan)),
            h: Math.min(4, Math.max(1, g.h ?? widget.config.rowSpan)),
            x: g.x,
            y: g.y
          }
        }),
    [layout.widgetGrid, widgetById]
  )

  const hiddenItems = useMemo<GridItem[]>(() => {
    const gridIds = new Set(layout.widgetGrid.map(g => g.i))
    return widgets
      .filter(w => !gridIds.has(w.id))
      .map(w => ({ id: w.id, w: w.config.colSpan, h: w.config.rowSpan }))
  }, [layout.widgetGrid, widgets])
  const showCreationState = !customizing && visibleItems.every(item => isDefaultWidget(item.id))
  const showOnboarding =
    !hasSentMessageFromQuint && widgets.every(widget => isDefaultWidget(widget.id))

  const [panelRef, panelHeight] = usePanelHeight()
  const panelOpen = customizing

  useAppletThumbnails({
    kind: 'widget',
    enabled: !customizing,
    targets: visibleItems
      .filter(item => !isDefaultWidget(item.id))
      .map(item => ({
        id: item.id,
        revision: widgetById.get(item.id)?.revision
      }))
  })

  function renderItem(id: string) {
    const defaultWidget = renderDefaultWidget(id, {
      quintlets,
      onOpenQuintlet,
      onCreateQuintlet,
      onStartPrompt,
      showOnboarding
    })
    if (defaultWidget) return defaultWidget
    return <WidgetShell name={id} onAskAgent={() => onAskAgent(id)} />
  }

  function hide(id: string) {
    setLayout({ widgetGrid: layout.widgetGrid.filter(g => g.i !== id) })
  }

  function restore(id: string) {
    const widget = widgetById.get(id)
    if (!widget) return
    const gridWithSizes = layout.widgetGrid.map(g => {
      const widget = widgetById.get(g.i)
      return {
        ...g,
        w: g.w ?? widget?.config.colSpan ?? 1,
        h: g.h ?? widget?.config.rowSpan ?? 1
      }
    })
    const pos = findWidgetPosition(gridWithSizes, widget.config.colSpan, widget.config.rowSpan)
    setLayout({ widgetGrid: [...layout.widgetGrid, { i: id, x: pos.x, y: pos.y }] })
  }

  function move(positions: GridPosition[]) {
    setLayout({ widgetGrid: updateStoredGridPositions(layout.widgetGrid, positions) })
  }

  function autoArrange() {
    const ordered = sortLayoutItemsByRowCol(
      visibleItems.map(({ id, x, y, w, h }) => ({ i: id, x, y, w, h }))
    )
    const packed = packItems(ordered.map(({ i, w, h }) => ({ id: i, w, h })))
    const positions = packed.map(({ i, x, y }) => ({ id: i, x, y }))
    setLayout({ widgetGrid: updateStoredGridPositions(layout.widgetGrid, positions) })
  }

  function resetLayout() {
    setLayout({ widgetGrid: customizeSession.startingGrid.map(item => ({ ...item })) })
  }

  return (
    // Shared working area below the header and positioning context for the bottom panel.
    <div className="relative flex min-h-0 flex-1 flex-col bg-muted/50">
      {customizing && (
        <DashboardCustomizeBar
          onAutoArrange={autoArrange}
          onReset={resetLayout}
          onDone={() => onCustomizingChange(false)}
        />
      )}
      <LayoutGroup>
        <WidgetCanvas
          items={visibleItems}
          customizing={customizing}
          emptyState={
            showCreationState ? <NoWidgetsCreated onCreateWidget={onCreateWidget} /> : undefined
          }
          bottomInset={panelOpen ? panelHeight : 0}
          renderItem={renderItem}
          onMove={move}
          onRemove={hide}
        />

        <AnimatePresence>
          {customizing && (
            <HiddenPanel
              ref={panelRef}
              items={hiddenItems}
              onCreateWidget={onCreateWidget}
              onClose={() => onCustomizingChange(false)}
              onRestore={restore}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
