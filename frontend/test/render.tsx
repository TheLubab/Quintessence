import { act, useLayoutEffect, type ReactNode } from 'react'
import { spyOn } from 'bun:test'
import * as browserEffect from '@base-ui/utils/useIsoLayoutEffect'
import { parseHTML } from 'linkedom'

// Supply browser APIs at the DOM boundary; components and their event handlers stay real.
export async function renderTestUi(content: ReactNode) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(document, 'oninput', { configurable: true, value: null })
  const frames = new Set<ReturnType<typeof setTimeout>>()
  const requestFrame = (callback: FrameRequestCallback) => {
    const timer = setTimeout(() => {
      frames.delete(timer)
      callback(performance.now())
    }, 0)
    frames.add(timer)
    return timer
  }
  const computedStyle = (element: Element) =>
    new Proxy((element as HTMLElement).style, {
      get(style, property) {
        if (property === 'animationName' || property === 'transitionProperty') return 'none'
        if (property === 'getPropertyValue') return style.getPropertyValue.bind(style)
        return Reflect.get(style, property) || ''
      }
    })
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    HTMLInputElement: window.HTMLInputElement,
    KeyboardEvent: class extends window.Event {},
    FocusEvent: class extends window.Event {},
    MouseEvent: class extends window.Event {},
    getComputedStyle: computedStyle,
    requestAnimationFrame: requestFrame,
    cancelAnimationFrame: (timer: ReturnType<typeof setTimeout>) => {
      clearTimeout(timer)
      frames.delete(timer)
    },
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  // Other suites may import Base UI during SSR, caching its no-DOM effect adapter.
  // Select React's real browser effect for this temporary DOM, then restore it.
  const effectSpy = spyOn(browserEffect, 'useIsoLayoutEffect').mockImplementation(useLayoutEffect)
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  const settle = () => new Promise(resolve => setTimeout(resolve, 5))
  const render = async (next: ReactNode) =>
    act(async () => {
      root.render(next)
      await settle()
    })
  const cleanup = async () => {
    await act(async () => root.unmount())
    effectSpy.mockRestore()
    for (const timer of frames) clearTimeout(timer)
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  try {
    await render(content)
  } catch (error) {
    await cleanup()
    throw error
  }
  return {
    document,
    window,
    render,
    cleanup,
    button(name: string) {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        node => (node.getAttribute('aria-label') ?? node.textContent?.trim()) === name
      )
      if (!button) throw new Error(`Button not found: ${name}`)
      return button
    },
    async click(element: HTMLElement) {
      await act(async () => {
        if (!element.hasAttribute('disabled')) {
          const accepted = element.dispatchEvent(
            new window.Event('click', { bubbles: true, cancelable: true })
          )
          // linkedom has no native form default action; dispatch the browser's submit event.
          if (accepted && element.getAttribute('type') === 'submit') {
            element
              .closest('form')
              ?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
          }
        }
        await settle()
      })
    },
    async type(input: HTMLInputElement, value: string) {
      await act(async () => {
        // Native browsers default an input without a type attribute to text.
        if (!input.type) input.type = 'text'
        Object.assign(input, { attachEvent() {}, detachEvent() {} })
        input.dispatchEvent(new window.Event('focusin', { bubbles: true }))
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value
        )
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
        input.dispatchEvent(new window.Event('keyup', { bubbles: true }))
        await settle()
      })
    },
    async escape() {
      await act(async () => {
        const event = new globals.KeyboardEvent('keydown', { bubbles: true })
        Object.defineProperty(event, 'key', { value: 'Escape' })
        document.dispatchEvent(event)
        await settle()
      })
    },
    flush: () => act(settle)
  }
}
