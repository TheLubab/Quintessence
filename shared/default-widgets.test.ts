import { describe, expect, test } from 'bun:test'

import type { WidgetInfo } from './types'
import {
  createDefaultWidgetGrid,
  DEFAULT_SUGGESTIONS_WIDGET,
  DEFAULT_QUINTLETS_WIDGET,
  isDefaultWidget,
  upgradeDefaultWidgetGrid,
  withDefaultWidgets
} from './default-widgets'

const clock: WidgetInfo = {
  id: 'clock',
  config: { colSpan: 2, rowSpan: 1 }
}

describe('default widgets', () => {
  test('registers defaults before applet widgets', () => {
    expect(withDefaultWidgets([clock])).toEqual([
      DEFAULT_QUINTLETS_WIDGET,
      DEFAULT_SUGGESTIONS_WIDGET,
      clock
    ])
    expect(isDefaultWidget(DEFAULT_QUINTLETS_WIDGET.id)).toBe(true)
    expect(isDefaultWidget(clock.id)).toBe(false)
  })

  test('creates their default grid entries', () => {
    expect(DEFAULT_QUINTLETS_WIDGET.config.colSpan).toBe(4)
    expect(createDefaultWidgetGrid()).toEqual([
      { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 },
      { i: DEFAULT_SUGGESTIONS_WIDGET.id, x: 0, y: 1 }
    ])
  })

  test('updates the old default layout without changing a customized layout', () => {
    const previous = [
      { i: DEFAULT_SUGGESTIONS_WIDGET.id, x: 2, y: 0 },
      { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 }
    ]
    expect(upgradeDefaultWidgetGrid(previous)).toEqual(createDefaultWidgetGrid())
    const customized = [{ ...previous[0], w: 2 }, previous[1]]
    expect(upgradeDefaultWidgetGrid(customized)).toEqual(customized)
  })
})
