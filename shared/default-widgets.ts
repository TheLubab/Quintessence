import type { LayoutGridItem, WidgetInfo } from './types'

export type DefaultWidgetDefinition = WidgetInfo & {
  defaultPosition: Omit<LayoutGridItem, 'i'>
}

export const DEFAULT_QUICK_ACCESS_WIDGET = {
  // Persisted ID predates Quick access; keep saved positions and hidden state.
  // Keep the persisted widget id stable across the Quintlet rename.
  id: '_quint_views',
  config: { colSpan: 4, rowSpan: 1 },
  defaultPosition: { x: 0, y: 0 }
} as const satisfies DefaultWidgetDefinition

// Compatibility for callers using the original built-in widget definition.
export const DEFAULT_QUINTLETS_WIDGET = DEFAULT_QUICK_ACCESS_WIDGET

export const DEFAULT_SUGGESTIONS_WIDGET = {
  // Preserve the original welcome widget's saved position and hidden state.
  id: '_quint_welcome',
  config: { colSpan: 2, rowSpan: 2 },
  defaultPosition: { x: 0, y: 1 }
} as const satisfies DefaultWidgetDefinition

export const DEFAULT_WIDGETS = [
  DEFAULT_QUICK_ACCESS_WIDGET,
  DEFAULT_SUGGESTIONS_WIDGET
] as const satisfies readonly DefaultWidgetDefinition[]

export type DefaultWidgetId = (typeof DEFAULT_WIDGETS)[number]['id']

const DEFAULT_WIDGET_IDS = new Set<string>(DEFAULT_WIDGETS.map(widget => widget.id))

export function isDefaultWidget(id: string): id is DefaultWidgetId {
  return DEFAULT_WIDGET_IDS.has(id)
}

// Registry order seeds defaults and the hidden panel; saved positions control visible order.
export function withDefaultWidgets(widgets: readonly WidgetInfo[]): WidgetInfo[] {
  return [...DEFAULT_WIDGETS, ...widgets]
}

export function createDefaultWidgetGrid(): LayoutGridItem[] {
  return DEFAULT_WIDGETS.map(widget => ({ i: widget.id, ...widget.defaultPosition }))
}

export function upgradeDefaultWidgetGrid(grid: LayoutGridItem[]): LayoutGridItem[] {
  // Refresh only the original, untouched two-widget arrangement.
  const welcome = grid.find(item => item.i === DEFAULT_SUGGESTIONS_WIDGET.id)
  const quickAccess = grid.find(item => item.i === DEFAULT_QUICK_ACCESS_WIDGET.id)
  if (
    grid.length === 2 &&
    grid.every(item => item.w === undefined && item.h === undefined) &&
    ((welcome?.x === 0 && welcome.y === 1 && quickAccess?.x === 0 && quickAccess.y === 0) ||
      (welcome?.x === 0 && welcome.y === 0 && quickAccess?.x === 1 && quickAccess.y === 0) ||
      (welcome?.x === 3 && welcome.y === 0 && quickAccess?.x === 0 && quickAccess.y === 0) ||
      (welcome?.x === 2 && welcome.y === 0 && quickAccess?.x === 0 && quickAccess.y === 0))
  ) {
    return createDefaultWidgetGrid()
  }
  return grid
}
