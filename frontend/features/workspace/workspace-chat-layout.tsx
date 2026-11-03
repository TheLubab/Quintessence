import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/frontend/components/ui/resizable'
import { AgentLauncher } from '@/frontend/features/chat/agent-launcher'
import { ChatPopup } from '@/frontend/features/chat/chat-popup'
import { cn } from '@/frontend/utils/cn'
import { useUiStore } from '@/frontend/store/ui'

// Both panes must remain usable; measure the host, never the shrinking left pane.
const MIN_DOCK_WIDTH = 1100
const DOCK_EXIT_WIDTH = 1060
const MIN_WORKSPACE_WIDTH = 680
const MIN_CHAT_WIDTH = 360

type WorkspaceChatLayoutProps = {
  workspace: ReactNode
  open: boolean
  loading: boolean
  unread: boolean
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete: (open: boolean) => void
  children: (onClose: () => void) => ReactNode
}

type ChatContentProps = {
  render: (onClose: () => void) => ReactNode
  onClose: () => void
}

function ChatContent({ render, onClose }: ChatContentProps) {
  return render(onClose)
}

export function WorkspaceChatLayout({
  workspace,
  open,
  loading,
  unread,
  onOpenChange,
  onOpenChangeComplete,
  children
}: WorkspaceChatLayoutProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<PanelImperativeHandle>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const collapseFrame = useRef<number | undefined>(undefined)
  const chatId = useId()
  const [docked, setDocked] = useState(false)
  const savedWidth = useUiStore(state => state.dockedChatWidth)
  const setSavedWidth = useUiStore(state => state.setDockedChatWidth)
  const closeDock = useCallback(() => {
    restoreFocus.current = true
    onOpenChange(false)
  }, [onOpenChange])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let frame: number | undefined
    // A small dead band prevents scrollbar changes from flipping modes back
    // and forth. Structural changes must happen outside the observer delivery.
    const measure = (width: number) =>
      setDocked(current => width >= (current ? DOCK_EXIT_WIDTH : MIN_DOCK_WIDTH))
    measure(host.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = entry.contentRect.width
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = undefined
        measure(width)
      })
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      if (collapseFrame.current !== undefined) cancelAnimationFrame(collapseFrame.current)
    }
  }, [])

  useLayoutEffect(() => {
    if (!docked) {
      restoreFocus.current = false
      return
    }
    if (open) {
      panelRef.current?.expand()
      panelRef.current?.resize(useUiStore.getState().dockedChatWidth)
    } else {
      panelRef.current?.collapse()
      if (restoreFocus.current) launcherRef.current?.focus()
      restoreFocus.current = false
    }
    onOpenChangeComplete(open)
  }, [docked, open, onOpenChangeComplete])

  // Persist once resizing finishes, not on every pointer event.
  const saveSize = useCallback<
    NonNullable<ComponentProps<typeof ResizablePanelGroup>['onLayoutChanged']>
  >(
    (_layout, meta) => {
      if (!meta.isUserInteraction) return
      const width = panelRef.current?.getSize().inPixels
      if (width && width >= MIN_CHAT_WIDTH) setSavedWidth(width)
    },
    [setSavedWidth]
  )

  return (
    <div ref={hostRef} className="relative flex h-full min-h-0 min-w-0 flex-1">
      <ResizablePanelGroup orientation="horizontal" onLayoutChanged={saveSize}>
        <ResizablePanel id="workspace" minSize={docked ? MIN_WORKSPACE_WIDTH : 0}>
          <div className="flex h-full min-h-0 min-w-0">{workspace}</div>
        </ResizablePanel>
        {docked && (
          <ResizableHandle
            aria-label="Resize agent panel"
            disabled={!open}
            className={cn('w-2 bg-transparent', !open && 'hidden')}
          >
            <span aria-hidden="true" className="h-12 w-0.5 rounded-full bg-border" />
          </ResizableHandle>
        )}
        {docked && (
          <ResizablePanel
            id="agent"
            panelRef={panelRef}
            defaultSize={open ? savedWidth : 0}
            minSize={MIN_CHAT_WIDTH}
            maxSize={640}
            collapsible
            collapsedSize={0}
            onResize={(size, _id, previous) => {
              if (collapseFrame.current !== undefined && size.inPixels > 0) {
                cancelAnimationFrame(collapseFrame.current)
                collapseFrame.current = undefined
              }
              if (
                previous &&
                previous.inPixels > 0 &&
                size.inPixels === 0 &&
                open &&
                collapseFrame.current === undefined
              ) {
                collapseFrame.current = requestAnimationFrame(() => {
                  collapseFrame.current = undefined
                  const width = hostRef.current?.getBoundingClientRect().width ?? 0
                  if (width >= DOCK_EXIT_WIDTH && panelRef.current?.isCollapsed()) closeDock()
                })
              }
            }}
          >
            <aside
              id={chatId}
              aria-label="Agent chat"
              aria-hidden={!open}
              inert={!open}
              className="m-2 ml-0 flex h-[calc(100%-1rem)] min-h-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground squircle"
            >
              <ChatContent render={children} onClose={closeDock} />
            </aside>
          </ResizablePanel>
        )}
      </ResizablePanelGroup>
      {docked ? (
        !open && (
          <AgentLauncher
            ref={launcherRef}
            loading={loading}
            unread={unread}
            aria-expanded={false}
            aria-controls={chatId}
            onClick={() => onOpenChange(true)}
          />
        )
      ) : (
        <ChatPopup
          loading={loading}
          unread={unread}
          open={open}
          onOpenChange={onOpenChange}
          onOpenChangeComplete={onOpenChangeComplete}
        >
          {children}
        </ChatPopup>
      )}
    </div>
  )
}
