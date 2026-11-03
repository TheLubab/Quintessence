import { describe, expect, test } from 'bun:test'

import { DEFAULT_QUINTLETS_WIDGET } from '@/shared/default-widgets'
import type { WidgetConfig, WidgetInfo } from '@/shared/types'

import { getWidgetSizes, reconcileWidgetGrid } from './use-grid-reconcile'

function widget(
  id: string,
  colSpan: WidgetConfig['colSpan'] = 2,
  rowSpan: WidgetConfig['rowSpan'] = 1
): WidgetInfo {
  return { id, config: { colSpan, rowSpan } }
}

describe('widget grid reconciliation', () => {
  test('keeps a visible default widget when an applet is added', () => {
    const newApplet = widget('new-applet')
    expect(
      reconcileWidgetGrid(
        [{ i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 }],
        [DEFAULT_QUINTLETS_WIDGET, newApplet],
        getWidgetSizes([DEFAULT_QUINTLETS_WIDGET])
      )
    ).toEqual([
      { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 },
      { i: newApplet.id, x: 0, y: 1 }
    ])
  })

  test('keeps a visible default widget when an applet size changes', () => {
    const previousApplet = widget('applet', 2, 1)
    const resizedApplet = widget('applet', 4, 1)
    expect(
      reconcileWidgetGrid(
        [
          { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 },
          { i: resizedApplet.id, x: 2, y: 1 }
        ],
        [DEFAULT_QUINTLETS_WIDGET, resizedApplet],
        getWidgetSizes([DEFAULT_QUINTLETS_WIDGET, previousApplet])
      )
    ).toEqual([
      { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 },
      { i: resizedApplet.id, x: 0, y: 1 }
    ])
  })

  test('does not place a known hidden default into an old workspace', () => {
    const existingApplet = widget('existing')
    const newApplet = widget('new')
    expect(
      reconcileWidgetGrid(
        [{ i: existingApplet.id, x: 0, y: 0 }],
        [DEFAULT_QUINTLETS_WIDGET, existingApplet, newApplet],
        getWidgetSizes([DEFAULT_QUINTLETS_WIDGET, existingApplet])
      )
    ).toEqual([
      { i: existingApplet.id, x: 0, y: 0 },
      { i: newApplet.id, x: 2, y: 0 }
    ])
  })

  test('preserves user-set spans when placing a new widget', () => {
    const resized = widget('resized', 2, 1)
    const newApplet = widget('new')
    expect(
      reconcileWidgetGrid(
        [{ i: resized.id, x: 0, y: 0, w: 4, h: 1 }],
        [resized, newApplet],
        getWidgetSizes([resized])
      )
    ).toEqual([
      { i: resized.id, x: 0, y: 0, w: 4, h: 1 },
      { i: newApplet.id, x: 0, y: 1 }
    ])
  })

  test('leaves known hidden widgets hidden when nothing else changes', () => {
    const hidden = widget('hidden')
    expect(reconcileWidgetGrid([], [hidden], getWidgetSizes([hidden]))).toBeNull()
  })
})
