import type { ReactNode } from 'react'
import { cloneElement, useCallback, useMemo, useState } from 'react'

import { motion } from 'motion/react'

import {
  type EventCallback,
  type Layout,
  GridLayout,
  noCompactor,
  useContainerWidth
} from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { appletId } from '@/frontend/features/applets/applet-cache'
import { DEFAULT_SUGGESTIONS_WIDGET } from '@/shared/default-widgets'

import { packItems } from './grid'
import type { GridPosition, PositionedGridItem } from './grid'
import { WidgetFrame } from './widget-frame'

const WIDE_GRID_MIN_WIDTH = 620
const GRID_COLS = { narrow: 2, wide: 4 } as const
const CREATION_ITEM_ID = '__dashboard_create_widget'

export type WidgetCanvasProps = {
  items: PositionedGridItem[]
  customizing?: boolean
  emptyState?: ReactNode
  bottomInset?: number
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

type WidgetGridProps = {
  items: PositionedGridItem[]
  customizing?: boolean
  emptyState?: ReactNode
  renderItem: (id: string) => ReactNode
  onMove?: (positions: GridPosition[]) => void
  onRemove?: (id: string) => void
}

function WidgetGrid({
  items,
  customizing,
  emptyState,
  renderItem,
  onMove,
  onRemove
}: WidgetGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true })
  const wide = width >= WIDE_GRID_MIN_WIDTH
  const editable = !!customizing && wide
  const [interaction, setInteraction] = useState<{ id: string }>()
  const refreshInteraction = useCallback<EventCallback>((_layout, _previous, item) => {
    if (item) setInteraction({ id: item.i })
  }, [])
  // RGL owns the live interaction. Derive its input from saved positions only;
  // sending intermediate positions through workspace state adds a feedback loop.
  const layout = useMemo<Layout>(() => {
    const responsiveItems = wide
      ? items
      : [...items]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map(({ id, w, h }) => ({
            id,
            w:
              id === DEFAULT_SUGGESTIONS_WIDGET.id
                ? GRID_COLS.narrow
                : Math.min(w, GRID_COLS.narrow),
            h
          }))
    const gridItems = emptyState
      ? [...responsiveItems, { id: CREATION_ITEM_ID, w: 1, h: 1 }]
      : responsiveItems
    return packItems(gridItems, [], wide ? GRID_COLS.wide : GRID_COLS.narrow).map(item => ({
      ...item,
      minW: 1,
      minH: 1,
      maxW: wide ? GRID_COLS.wide : GRID_COLS.narrow,
      maxH: 4
    }))
  }, [items, wide, emptyState])

  const gridConfig = useMemo(
    () => ({
      cols: wide ? GRID_COLS.wide : GRID_COLS.narrow,
      rowHeight: 160,
      margin: [12, 12] as const,
      containerPadding: [0, 0] as const
    }),
    [wide]
  )

  const widgetElements = useMemo(
    () =>
      layout.map(item => (
        <div key={item.i}>
          {item.i === CREATION_ITEM_ID ? (
            emptyState
          ) : (
            <div data-applet-thumbnail={appletId('widgets', item.i)} className="size-full">
              <WidgetFrame
                customizing={customizing}
                movable={editable}
                widgetId={item.i}
                onRemove={onRemove ? () => onRemove(item.i) : undefined}
              >
                {renderItem(item.i)}
              </WidgetFrame>
            </div>
          )}
        </div>
      )),
    [layout, customizing, editable, onRemove, renderItem, emptyState]
  )

  const commitLayout = useCallback(
    (next: Layout) => {
      setInteraction(undefined)
      if (!editable) return
      const previousById = new Map(items.map(item => [item.id, item]))
      const changed = next.some(item => {
        const previous = previousById.get(item.i)
        return (
          previous &&
          (previous.x !== item.x ||
            previous.y !== item.y ||
            previous.w !== item.w ||
            previous.h !== item.h)
        )
      })
      if (!changed) return
      onMove?.(next.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })))
    },
    [editable, items, onMove]
  )

  return (
    <div ref={containerRef} className="flex w-full flex-col gap-2">
      {mounted && (
        <>
          {customizing && !wide && (
            <p className="text-sm text-muted-foreground">
              Widen this area to move or resize widgets
            </p>
          )}
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={gridConfig}
            dragConfig={{ enabled: editable, cancel: 'button', threshold: 4 }}
            resizeConfig={{ enabled: editable, handles: ['se'] }}
            compactor={noCompactor}
            onDrag={refreshInteraction}
            onResize={refreshInteraction}
            onDragStop={commitLayout}
            onResizeStop={commitLayout}
          >
            {widgetElements.map(element =>
              // RGL 2.3 stores pixel positions in refs but memoizes items by snapped
              // coordinates. Refresh only the active wrapper on every pointer event;
              // keep its contents stable so applets do not render during dragging.
              element.key === interaction?.id ? cloneElement(element) : element
            )}
          </GridLayout>
        </>
      )}
    </div>
  )
}

export function WidgetCanvas({
  items,
  customizing,
  emptyState,
  bottomInset = 0,
  renderItem,
  onMove,
  onRemove
}: WidgetCanvasProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <motion.div
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-col gap-3"
        animate={{ marginBottom: bottomInset }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      >
        {(items.length > 0 || emptyState) && (
          <WidgetGrid
            items={items}
            customizing={customizing}
            emptyState={emptyState}
            renderItem={renderItem}
            onMove={onMove}
            onRemove={onRemove}
          />
        )}
      </motion.div>
    </div>
  )
}
