import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'

import type { GridPosition, PositionedGridItem } from './grid'
import { WidgetCanvas } from './widget-canvas'

let cleanup = async () => {}
afterEach(() => cleanup())

const initialItems: PositionedGridItem[] = [
  { id: 'a', x: 0, y: 0, w: 2, h: 1 },
  { id: 'b', x: 2, y: 2, w: 2, h: 1 }
]

type TestWidgetProps = { id: string; onRender: (id: string) => void }

function TestWidget({ id, onRender }: TestWidgetProps) {
  onRender(id)
  return <span>{id}</span>
}

async function mount(initialWidth = 800) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  let width = initialWidth
  const prototype = window.HTMLElement.prototype
  const geometryDescriptors = new Map(
    ['clientWidth', 'offsetParent', 'scrollLeft', 'scrollTop', 'getBoundingClientRect'].map(
      key => [key, Object.getOwnPropertyDescriptor(prototype, key)] as const
    )
  )
  const observers = new Set<ResizeObserverCallback>()
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  // Supply browser geometry; keep the grid, draggable, and resize handlers real.
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { configurable: true, get: () => width },
    offsetParent: {
      configurable: true,
      get() {
        return document.body
      }
    },
    scrollLeft: { configurable: true, value: 0, writable: true },
    scrollTop: { configurable: true, value: 0, writable: true }
  })
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: 800,
    width,
    height: 800,
    toJSON() {
      return {}
    }
  })
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    getComputedStyle: () => ({ overflow: 'visible', overflowY: 'visible' }),
    ResizeObserver: class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        observers.add(this.callback)
      }
      disconnect() {
        observers.delete(this.callback)
      }
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback)
      return frameId
    },
    cancelAnimationFrame: (id: number) => {
      frames.delete(id)
    },
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })

  const root = createRoot(document.getElementById('root')!)
  let items = initialItems.map(item => ({ ...item }))
  const saves: GridPosition[][] = []
  const widgetRenders: string[] = []
  const render = () =>
    root.render(
      <WidgetCanvas
        items={items}
        customizing
        renderItem={id => <TestWidget id={id} onRender={id => widgetRenders.push(id)} />}
        onMove={positions => {
          saves.push(positions)
        }}
        onRemove={id => {
          items = items.filter(item => item.id !== id)
          render()
        }}
      />
    )
  cleanup = async () => {
    await act(async () => root.unmount())
    for (const [key, descriptor] of geometryDescriptors) {
      if (descriptor) Object.defineProperty(prototype, key, descriptor)
      else Reflect.deleteProperty(prototype, key)
    }
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  await act(async () => render())

  async function mouse(target: EventTarget, type: string, x: number, y: number) {
    const event = new window.Event(type, { bubbles: true, cancelable: true })
    Object.assign(event, { button: 0, clientX: x, clientY: y })
    await act(async () => {
      target.dispatchEvent(event)
    })
  }
  return {
    document,
    widgetRenders,
    saves,
    mouse,
    cards: () => Array.from(document.querySelectorAll<HTMLElement>('.react-grid-item')),
    update: async (next: PositionedGridItem[]) => {
      items = next
      await act(async () => render())
    },
    resize: async (nextWidth: number) => {
      width = nextWidth
      await act(async () => {
        for (const callback of observers)
          callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver)
        const pendingFrames = [...frames.values()]
        frames.clear()
        for (const callback of pendingFrames) callback(0)
      })
    }
  }
}

test('drag commits once on release and preserves gaps in other widgets', async () => {
  const grid = await mount()
  expect(grid.saves).toEqual([])
  const [card, other] = grid.cards()
  const otherPosition = other!.style.transform
  await grid.mouse(card!, 'mousedown', 20, 20)
  await grid.mouse(grid.document, 'mousemove', 20, 188)
  expect(grid.saves).toEqual([])
  await grid.mouse(grid.document, 'mouseup', 20, 188)
  expect(grid.saves).toEqual([
    [
      { id: 'a', x: 0, y: 1, w: 2, h: 1 },
      { id: 'b', x: 2, y: 2, w: 2, h: 1 }
    ]
  ])
  expect(other!.style.transform).toBe(otherPosition)
})

test('resize commits once on release', async () => {
  const grid = await mount()
  const handle = grid.cards()[0]!.querySelector('.react-resizable-handle')!
  await grid.mouse(handle, 'mousedown', 396, 160)
  await grid.mouse(grid.document, 'mousemove', 598, 328)
  expect(grid.saves).toEqual([])
  await grid.mouse(grid.document, 'mouseup', 598, 328)
  expect(grid.saves).toEqual([
    [
      { id: 'a', x: 0, y: 0, w: 3, h: 2 },
      { id: 'b', x: 2, y: 2, w: 2, h: 1 }
    ]
  ])
})

test('clicking a card without moving does not save', async () => {
  const grid = await mount()
  await grid.mouse(grid.cards()[0]!, 'mousedown', 20, 20)
  await grid.mouse(grid.document, 'mouseup', 20, 20)
  expect(grid.saves).toEqual([])
})

test('narrow layout disables moves and restores saved desktop positions when widened', async () => {
  const grid = await mount(500)
  expect(grid.document.body.textContent).toContain('Widen this area to move or resize widgets')
  await grid.mouse(grid.cards()[0]!, 'mousedown', 20, 20)
  await grid.mouse(grid.document, 'mousemove', 20, 188)
  await grid.mouse(grid.document, 'mouseup', 20, 188)
  expect(grid.saves).toEqual([])
  await grid.resize(800)
  expect(grid.document.body.textContent).not.toContain('Widen this area')
  expect(grid.cards()[1]!.style.transform).toBe('translate(404px,336px)')
  expect(grid.saves).toEqual([])
})

test('external reset, removal, and restore update positions without saving', async () => {
  const grid = await mount()
  await grid.update([{ id: 'a', x: 1, y: 3, w: 1, h: 2 }])
  expect(grid.cards()).toHaveLength(1)
  expect(grid.cards()[0]!.style.transform).toBe('translate(202px,504px)')
  await grid.update(initialItems)
  expect(grid.cards()).toHaveLength(2)
  expect(grid.cards()[0]!.style.transform).toBe('translate(0px,0px)')
  expect(grid.saves).toEqual([])
})

test('dropping onto another widget resolves the collision without overlapping', async () => {
  const grid = await mount()
  await grid.mouse(grid.cards()[0]!, 'mousedown', 20, 20)
  await grid.mouse(grid.document, 'mousemove', 424, 356)
  await grid.mouse(grid.document, 'mouseup', 424, 356)
  expect(grid.saves).toEqual([
    [
      { id: 'a', x: 2, y: 2, w: 2, h: 1 },
      { id: 'b', x: 2, y: 3, w: 2, h: 1 }
    ]
  ])
})

test('hiding through the remove button does not start a drag or save positions', async () => {
  const grid = await mount()
  const button = grid.cards()[0]!.querySelector('button[aria-label="Hide widget"]')!
  await grid.mouse(button, 'mousedown', 20, 20)
  await grid.mouse(grid.document, 'mousemove', 424, 356)
  await grid.mouse(grid.document, 'mouseup', 424, 356)
  await grid.mouse(button, 'click', 20, 20)
  expect(grid.cards()).toHaveLength(1)
  expect(grid.document.body.textContent).toBe('b')
  expect(grid.saves).toEqual([])
})

test('held card follows every pointer movement within the same grid cell', async () => {
  const grid = await mount()
  const rendersBeforeDrag = [...grid.widgetRenders]
  const card = grid.cards()[0]!
  await grid.mouse(card, 'mousedown', 20, 20)
  for (const delta of [10, 20, 30]) {
    await grid.mouse(grid.document, 'mousemove', 20 + delta, 20 + delta)
    expect(card.style.transform).toBe(`translate(${delta}px,${delta}px)`)
    const placeholder = grid.document.querySelector<HTMLElement>('.react-grid-placeholder')!
    expect(placeholder.style.transform).toBe('translate(0px,0px)')
    expect(grid.widgetRenders).toEqual(rendersBeforeDrag)
    expect(grid.saves).toEqual([])
  }
  await grid.mouse(grid.document, 'mouseup', 50, 50)
  expect(card.style.transform).toBe('translate(0px,0px)')
  expect(grid.saves).toEqual([])
})

test('resize follows pointer movement before crossing a grid size boundary', async () => {
  const grid = await mount()
  const card = grid.cards()[0]!
  const handle = card.querySelector('.react-resizable-handle')!
  const rendersBeforeResize = [...grid.widgetRenders]
  await grid.mouse(handle, 'mousedown', 396, 160)
  for (const delta of [10, 20, 30]) {
    await grid.mouse(grid.document, 'mousemove', 396 + delta, 160 + delta)
    expect(card.style.width).toBe(`${396 + delta}px`)
    expect(card.style.height).toBe(`${160 + delta}px`)
    expect(grid.saves).toEqual([])
    expect(grid.widgetRenders).toEqual(rendersBeforeResize)
  }
  await grid.mouse(grid.document, 'mouseup', 426, 190)
  expect(card.style.width).toBe('396px')
  expect(card.style.height).toBe('160px')
  expect(grid.saves).toEqual([])
})
