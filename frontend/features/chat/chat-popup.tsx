import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

import { Resizable } from 'react-resizable'

import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/components/ui/popover'
import { useUiStore } from '@/frontend/store/ui'

import { AgentLauncher } from './agent-launcher'

type ChatPopupProps = {
  loading: boolean
  unread?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  children: (onClose: () => void) => ReactNode
}

export function ChatPopup({
  loading,
  unread,
  open,
  onOpenChange,
  onOpenChangeComplete,
  children
}: ChatPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const popupChatWidth = useUiStore(state => state.popupChatWidth)
  const setPopupChatWidth = useUiStore(state => state.setPopupChatWidth)
  const [size, setSize] = useState({ width: popupChatWidth, min: 0, max: popupChatWidth })

  const setPopupRef = useCallback((popup: HTMLDivElement | null) => {
    popupRef.current = popup
    if (!popup) return
    popup.style.setProperty('--chat-popup-width', `${useUiStore.getState().popupChatWidth}px`)
    let frame: number | undefined
    // Report the rendered width, including viewport clamping of the saved preference.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = undefined
        const { minWidth, maxWidth } = getComputedStyle(popup)
        const min = parseFloat(minWidth)
        const max = parseFloat(maxWidth)
        setSize(previous =>
          previous.width === width && previous.min === min && previous.max === max
            ? previous
            : { width, min, max }
        )
      })
    })
    observer.observe(popup)
    return () => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      popupRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    popupRef.current?.style.setProperty('--chat-popup-width', `${popupChatWidth}px`)
  }, [popupChatWidth])

  const resize = (width: number) => {
    if (!popupRef.current) return
    const { minWidth, maxWidth } = getComputedStyle(popupRef.current)
    setPopupChatWidth(
      Math.round(Math.min(parseFloat(maxWidth), Math.max(parseFloat(minWidth), width)))
    )
  }
  const onClose = () => onOpenChange(false)
  const handleOpenChange: NonNullable<ComponentProps<typeof Popover>['onOpenChange']> = (
    nextOpen,
    eventDetails
  ) => {
    // Applet actions move focus outside before their click handler runs.
    // Keep chat open so adding context only refocuses the existing composer.
    if (
      !nextOpen &&
      (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
    ) {
      eventDetails.cancel()
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      {/* Floating over a themed workspace — use the card pair so it stays
          legible regardless of the active theme background. */}
      <PopoverTrigger
        render={
          <AgentLauncher
            loading={loading}
            unread={unread}
            className={open ? 'invisible' : undefined}
          />
        }
      />
      <Resizable
        axis="x"
        width={size.width}
        height={0}
        resizeHandles={['w']}
        minConstraints={[size.min, 0]}
        maxConstraints={[size.max, 0]}
        onResize={(_event, { size }) => setPopupChatWidth(Math.round(size.width))}
        handle={
          <div
            role="separator"
            aria-label="Resize chat popup"
            aria-orientation="vertical"
            aria-valuemin={size.min}
            aria-valuemax={size.max}
            aria-valuenow={size.width}
            aria-valuetext={`${size.width} pixels wide`}
            tabIndex={0}
            className="absolute inset-y-6 -left-1 w-2 cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onKeyDown={event => {
              const width = popupRef.current?.offsetWidth ?? popupChatWidth
              const step = event.shiftKey ? 32 : 16
              if (event.key === 'ArrowLeft') resize(width + step)
              else if (event.key === 'ArrowRight') resize(width - step)
              else if (event.key === 'Home') resize(-Infinity)
              else if (event.key === 'End') resize(Infinity)
              else return
              event.preventDefault()
            }}
          />
        }
      >
        <PopoverContent
          ref={setPopupRef}
          side="top"
          sideOffset={({ anchor }) => -anchor.height}
          align="end"
          className="relative flex h-[calc(100vh-2rem)] w-(--chat-popup-width) max-w-[calc(100vw-1.5rem)] min-w-[min(440px,calc(100vw-1.5rem))] flex-col gap-0 rounded-3xl p-0 transition-[opacity,transform] sm:h-[calc(100vh-8rem)]"
          keepMounted
        >
          {children(onClose)}
        </PopoverContent>
      </Resizable>
    </Popover>
  )
}
