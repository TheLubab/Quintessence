import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { AnimatePresence } from 'motion/react'

import {
  PenNewSquareIcon,
  Widget2Icon,
  Widget5Icon,
  WindowFrameIcon
} from '@solar-icons/react/linear'

import { DrawingLayer } from '@/frontend/features/drawings/drawing-layer'
import { DrawingToolbar } from '@/frontend/features/drawings/drawing-toolbar'
import { useChatAnnotation } from '@/frontend/features/drawings/use-chat-annotation'
import { ChatPanel } from '@/frontend/features/chat/chat-panel'
import type { WelcomeDestination } from '@/frontend/features/chat/messages/chat-empty-state'
import { useChatUnread } from '@/frontend/features/chat/use-chat-unread'
import { ThemePanel } from '@/frontend/features/workspace/theme-panel'
import { Dashboard } from '@/frontend/features/dashboard/dashboard'
import { PanelHeader } from '@/frontend/components/shared/panel-header'
import { Button } from '@/frontend/components/ui/button'
import { toast } from '@/frontend/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import {
  useAppletChatMessage,
  useAppletChatAttachment
} from '@/frontend/features/chat/applet-chat-intents'
import { useChat } from '@/frontend/features/chat/use-chat'
import { useWorkspaceSessions } from '@/frontend/features/chat/sessions/api'
import { usePinnedSession } from '@/frontend/features/chat/sessions/use-selected-session'
import {
  PendingQuintletScreen,
  type PendingQuintletHandle
} from '@/frontend/features/quintlets/pending-quintlet-screen'
import { QuintletManager } from '@/frontend/features/quintlets/quintlet-manager'
import {
  getQuintletIcon,
  getQuintletLabel
} from '@/frontend/features/quintlets/quintlet-presentation'
import { useQuintletActions } from '@/frontend/features/quintlets/use-quintlet-actions'
import { useQuintletDrafts } from '@/frontend/features/quintlets/use-quintlet-drafts'
import { useWorkspaceComposerState } from '@/frontend/features/chat/composer/use-workspace-composer-state'
import {
  hasRunningWorkspaceActivity,
  isSessionRunning,
  useLive
} from '@/frontend/features/chat/chat-store'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import { WorkspaceActions } from '@/frontend/features/workspace/workspace-actions'
import { effectiveOpenTabs, tabAvailable } from '@/frontend/features/workspace/tab-resolution'
import { useWorkspaceNavigation } from '@/frontend/features/workspace/use-workspace-navigation'
import { useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'
import { useUiStore } from '@/frontend/store/ui'
import {
  type CreateWorkspaceTabItem,
  type WorkspaceTabItem,
  WorkspaceTabs
} from '@/frontend/features/workspace/workspace-tabs'
import { isDefaultWidget } from '@/shared/default-widgets'
import { composerDraftKey, draftSessionId } from '@/shared/session-drafts'
import type {
  CompiledQuintlet,
  PendingQuintlet,
  QuintletInfo,
  WidgetInfo,
  WorkspaceTabId
} from '@/shared/types'
import { quintletIdFromTab, quintletTabId } from '@/shared/workspace-tabs'

import { WorkspaceFrame, WorkspacePane } from './workspace-frame'
import { WorkspaceChatLayout } from './workspace-chat-layout'
import { UnavailablePage } from './unavailable-page'

const Canvas = lazy(() =>
  import('@/frontend/features/canvas/canvas').then(module => ({
    default: module.Canvas
  }))
)

type WorkspaceContentProps = {
  widgets: WidgetInfo[]
  quintlets: QuintletInfo[]
}

type WidgetMode = 'idle' | 'customizing' | 'theming'

function tabItemFor(
  tab: WorkspaceTabId,
  quintlets: QuintletInfo[],
  closable: boolean,
  quintletRunning: (sessionId: string) => boolean
): WorkspaceTabItem | null {
  if (tab === 'dashboard') {
    return {
      key: tab,
      Icon: Widget2Icon,
      label: 'Dashboard',
      closable: false,
      reorderable: false
    }
  }
  if (tab === 'canvas') {
    return {
      key: tab,
      Icon: PenNewSquareIcon,
      label: 'Canvas',
      closable
    }
  }
  const quintletId = quintletIdFromTab(tab)
  const quintlet = quintletId ? quintlets.find(v => v.id === quintletId) : null
  return quintlet
    ? {
        key: tab,
        Icon: getQuintletIcon(quintlet),
        label: getQuintletLabel(quintlet),
        closable: closable || quintlet.status !== 'compiled',
        loading:
          quintlet.status !== 'compiled' &&
          !!quintlet.buildSessionId &&
          quintletRunning(quintlet.buildSessionId)
      }
    : null
}

export function WorkspaceContent({ widgets, quintlets: allQuintlets }: WorkspaceContentProps) {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const quintletActions = useQuintletActions()
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const chatOpenPreference = useUiStore(state => state.workspaceChatOpen[workspaceId])
  const setWorkspaceChatOpen = useUiStore(state => state.setWorkspaceChatOpen)
  const chatOpen = chatOpenPreference ?? false
  const setChatOpen = useCallback(
    (open: boolean) => setWorkspaceChatOpen(workspaceId, open),
    [workspaceId, setWorkspaceChatOpen]
  )
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const pendingQuintletRefs = useRef(new Map<string, PendingQuintletHandle>())
  const sessionActivity = useLive(state => state.activity)
  const { data: sessions } = useWorkspaceSessions(workspaceId)
  const autoOpenedChatWorkspaces = useUiStore(state => state.autoOpenedChatWorkspaces)
  const markChatAutoOpened = useUiStore(state => state.markChatAutoOpened)
  const quintlets = allQuintlets.filter(
    (quintlet): quintlet is CompiledQuintlet => quintlet.status === 'compiled'
  )
  const pendingQuintlets = allQuintlets.filter(
    (quintlet): quintlet is PendingQuintlet => quintlet.status !== 'compiled'
  )
  const hasRunningSession = hasRunningWorkspaceActivity(sessionActivity, workspaceId)
  const needsAgentAttention = Object.entries(sessionActivity).some(
    ([key, activity]) => key.startsWith(`${workspaceId}:`) && activity === 'requires-action'
  )
  const quintletDrafts = useQuintletDrafts({
    workspaceId,
    pendingQuintlets,
    onSave: (quintletId, requirements) => quintletActions.save(quintletId, requirements)
  })

  const hasAppletWidgets = widgets.some(widget => !isDefaultWidget(widget.id))
  const hasWorkspaceApplets = hasAppletWidgets || quintlets.length > 0

  const revealChat = useCallback(() => {
    setChatOpen(true)
    setChatFocusRequest(request => request + 1)
  }, [setChatOpen])
  const handleChatOpenComplete = useCallback((open: boolean) => {
    if (open) setChatFocusRequest(request => request + 1)
  }, [])

  // The tab address: URL in, active tab + applet params out, plus the persisted
  // tab state it keeps in sync. See useWorkspaceNavigation for the invariants.
  const {
    tabsState,
    activeTab,
    appletParams,
    navigateToTab,
    setTabs,
    isUnavailable,
    onNavigationClick
  } = useWorkspaceNavigation({
    quintlets: allQuintlets,
    onOpenChat: revealChat
  })

  // Chat comes after navigation, and takes the address: every message carries
  // where the user is (active tab, and the params the quintlet is rendering with)
  // in its `<quint-context>` envelope.
  const {
    view,
    forkedFromSessionId,
    chatLoaded,
    previewTurn,
    sessionId,
    composerSessionId,
    processing,
    error,
    loadError,
    retryLoad,
    send,
    stop,
    selectSession,
    dismissError
  } = useChat({ activeTab, appletParams })
  const chatUnread = useChatUnread({ workspaceId, sessions, sessionId, open: chatOpen })
  const { pinnedSessionId } = usePinnedSession()
  const { composerBanner, quintletDraftComposerBanner, agentAvailability } =
    useWorkspaceComposerState(workspaceId, {
      chatError: error,
      onDismissChatError: dismissError,
      chatLoadError: loadError,
      onRetryChatLoad: retryLoad
    })

  const openTabIds = effectiveOpenTabs(tabsState, allQuintlets)
  const openSet = new Set(tabsState.open)

  const canCloseTabs = openTabIds.length > 1
  const tabItems = openTabIds
    .map(tab =>
      tabItemFor(tab, allQuintlets, canCloseTabs, sessionId =>
        isSessionRunning(sessionActivity, workspaceId, sessionId)
      )
    )
    .filter((tab): tab is WorkspaceTabItem => Boolean(tab))
  const activeQuintletId = quintletIdFromTab(activeTab)
  const activeQuintlet = activeQuintletId
    ? quintlets.find(v => v.id === activeQuintletId)
    : undefined
  const activePendingQuintlet = activeQuintletId
    ? pendingQuintlets.find(pendingQuintlet => pendingQuintlet.id === activeQuintletId)
    : undefined
  const activeDraftQuintlet =
    !pinnedSessionId &&
    sessionId === null &&
    activePendingQuintlet?.status === 'draft' &&
    (!activePendingQuintlet.buildSessionId ||
      !isSessionRunning(sessionActivity, workspaceId, activePendingQuintlet.buildSessionId))
      ? activePendingQuintlet
      : undefined
  const activeDraftQuintletId = activeDraftQuintlet?.id
  const startupPending = !pinnedSessionId && activePendingQuintlet?.status === 'starting'
  const visibleChatLoaded = chatLoaded && !startupPending
  const canAnnotate =
    widgetMode === 'idle' &&
    ((activeTab === 'dashboard' && hasAppletWidgets) || activeQuintlet !== undefined)
  const {
    controls: annotationControls,
    layerProps: annotationLayerProps,
    popup: popupAnnotation,
    targetRef: annotationTargetRef
  } = useChatAnnotation({
    workspaceId,
    sessionId: composerSessionId,
    activeTab,
    available: canAnnotate,
    closePopup: () => setChatOpen(false),
    openPopup: () => setChatOpen(true)
  })

  useEffect(() => {
    const open = tabsState.open.filter(tab => tabAvailable(tab, allQuintlets))
    if (open.length === tabsState.open.length) return
    const nextOpen = effectiveOpenTabs(tabsState, allQuintlets)
    setTabs({
      open: nextOpen,
      active: nextOpen.includes(tabsState.active) ? tabsState.active : nextOpen[0]
    })
  }, [allQuintlets, setTabs, tabsState])

  useEffect(() => {
    if (!activeDraftQuintletId) return
    setChatOpen(true)
    setChatFocusRequest(request => request + 1)
  }, [activeDraftQuintletId, setChatOpen])

  // A workspace whose agent has never been talked to starts with the chat
  // open once per browser. Explicit per-workspace choices take precedence.
  useEffect(() => {
    if (!sessions || sessions.length > 0) return
    if (chatOpenPreference !== undefined) return
    if (autoOpenedChatWorkspaces.includes(workspaceId)) return
    markChatAutoOpened(workspaceId)
    setChatOpen(true)
  }, [
    autoOpenedChatWorkspaces,
    markChatAutoOpened,
    sessions,
    workspaceId,
    chatOpenPreference,
    setChatOpen
  ])

  const openTab = navigateToTab

  const createQuintlet = () => {
    // A pending quintlet has no chat until its first submission.
    void quintletActions
      .create()
      .then(pendingQuintlet => openTab(quintletTabId(pendingQuintlet.id)))
  }

  const navigateFromWelcome = (destination: WelcomeDestination) => {
    if (destination === 'quintlets') {
      const firstQuintlet = quintlets[0]
      if (firstQuintlet) openTab(quintletTabId(firstQuintlet.id))
      else createQuintlet()
    } else {
      openTab(destination)
    }
    setChatOpen(false)
  }

  useWorkspaceEvent(event => {
    if (
      event.type === 'quintlet:deleted' &&
      event.workspaceId === workspaceId &&
      activeTab === quintletTabId(event.name)
    ) {
      openTab('dashboard')
    }
  })

  const deletePendingQuintlet = async (pendingQuintlet: PendingQuintlet) => {
    const sketch = pendingQuintletRefs.current.get(pendingQuintlet.id)
    try {
      await quintletActions.discard(pendingQuintlet.id)
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Couldn’t discard quintlet',
        type: 'error'
      })
      return false
    }
    await sketch?.resetSketch()
    quintletDrafts.clear(pendingQuintlet.id)
    return true
  }

  const closeTab = (tab: WorkspaceTabId) => {
    if (tab === 'dashboard') return
    const quintletId = quintletIdFromTab(tab)
    const pendingQuintlet = quintletId
      ? pendingQuintlets.find(candidate => candidate.id === quintletId)
      : undefined
    if ((!canCloseTabs && !pendingQuintlet) || !openSet.has(tab)) return
    let open = tabsState.open.filter(t => t !== tab)
    if (open.length === 0) open = ['dashboard']
    // The neighbor that takes over when the tab on screen closes.
    const visibleIndex = openTabIds.indexOf(tab)
    const nextTab =
      openTabIds[visibleIndex + 1] ??
      openTabIds[visibleIndex - 1] ??
      open.find(t => tabAvailable(t, allQuintlets)) ??
      'dashboard'
    const active =
      tabsState.active === tab || !open.includes(tabsState.active) ? nextTab : tabsState.active
    // Persist the open set BEFORE navigating so the sync effect (which reads
    // tabsStateRef) can't resurrect the closed tab.
    setTabs({ open, active })
    if (activeTab === tab) navigateToTab(nextTab)
    if (pendingQuintlet?.status === 'draft') void deletePendingQuintlet(pendingQuintlet)
  }

  const discardPendingQuintlet = async (pendingQuintlet: PendingQuintlet) => {
    if (!(await deletePendingQuintlet(pendingQuintlet))) return

    const tab = quintletTabId(pendingQuintlet.id)
    if (!openSet.has(tab)) return
    let open = tabsState.open.filter(item => item !== tab)
    if (open.length === 0) open = ['dashboard']
    const nextTab = open.find(item => tabAvailable(item, allQuintlets)) ?? 'dashboard'
    const active = tabsState.active === tab ? nextTab : tabsState.active
    setTabs({ open, active })
    if (activeTab === tab) navigateToTab(nextTab, { replace: true })
  }

  const reorderTabs = (open: WorkspaceTabId[]) => {
    setTabs({ open, active: tabsState.active })
  }

  const openChat = (intent?: string) => {
    if (intent !== undefined) {
      useUiStore
        .getState()
        .setComposerDraft(composerDraftKey(workspaceId, composerSessionId), intent)
    }
    setChatOpen(true)
    if (chatOpen) {
      setChatFocusRequest(request => request + 1)
    }
  }

  const startPrompt = (prompt: string) => {
    const draftKey = composerDraftKey(workspaceId, composerSessionId)
    const draft = useUiStore.getState().composerDrafts[draftKey] ?? ''
    if (!draft.trim()) {
      openChat(prompt)
      return
    }
    if (draft.trimEnd().endsWith(prompt)) {
      openChat()
      return
    }
    openChat(`${draft.trimEnd()}\n\n${prompt}`)
  }

  // Applet actions reveal the existing composer in either the dock or popup.
  useAppletChatMessage({ sessionId, send, revealChat: openChat, agentAvailability })
  useAppletChatAttachment(composerSessionId, openChat)

  const createItems: CreateWorkspaceTabItem[] = [
    ...(!openSet.has('canvas')
      ? ([
          {
            key: 'canvas',
            Icon: PenNewSquareIcon,
            label: 'Canvas',
            onClick: () => openTab('canvas')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...allQuintlets
      .map(quintlet => ({ quintlet, tab: quintletTabId(quintlet.id) }))
      .filter(({ tab }) => !openSet.has(tab))
      .map(
        ({ quintlet, tab }): CreateWorkspaceTabItem => ({
          key: tab,
          Icon: getQuintletIcon(quintlet),
          label: getQuintletLabel(quintlet),
          onClick: () => openTab(tab)
        })
      ),
    {
      key: 'create-quintlet',
      Icon: WindowFrameIcon,
      label: 'New quintlet',
      onClick: createQuintlet
    }
  ]

  const removeQuintletDrawing = useCallback(() => {
    if (activeDraftQuintlet) {
      void pendingQuintletRefs.current.get(activeDraftQuintlet.id)?.resetSketch()
    }
  }, [activeDraftQuintlet])
  const sendChat = async (text: string, options?: Parameters<typeof send>[1]) => {
    if (activePendingQuintlet?.status === 'draft') {
      await pendingQuintletRefs.current.get(activePendingQuintlet.id)?.prepareSketchForSend()
      await quintletActions.submit(activePendingQuintlet, text)
      // Submit clears the sent attachment. Keep the canvas until the built quintlet replaces it.
      quintletDrafts.clear(activePendingQuintlet.id)
    } else await send(text, options)
  }

  const quintletChatDraft = activeDraftQuintlet
    ? {
        sessionId: draftSessionId(quintletTabId(activeDraftQuintlet.id)),
        onRemoveDrawing: removeQuintletDrawing
      }
    : undefined

  const chatPanelProps = {
    focusRequest: chatFocusRequest,
    chatLoaded: visibleChatLoaded,
    hasWorkspaceApplets,
    view,
    forkedFromSessionId,
    previewTurn,
    sessionId,
    processing,
    composerBanner: activeDraftQuintlet ? quintletDraftComposerBanner : composerBanner,
    agentAvailability,
    send: sendChat,
    stop,
    onNavigateFromWelcome: navigateFromWelcome,
    quintletDraft: quintletChatDraft
  }

  const workspacePanel = (
    <WorkspacePane>
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={annotationTargetRef}
          inert={annotationControls.active || undefined}
          aria-hidden={annotationControls.active || undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card transition-colors duration-100 ease-out squircle motion-reduce:transition-none"
        >
          {isUnavailable ? (
            <UnavailablePage onOpenDashboard={() => openTab('dashboard')} />
          ) : activeTab === 'dashboard' ? (
            <Dashboard
              customizing={widgetMode === 'customizing'}
              onCustomizingChange={customizing =>
                setWidgetMode(customizing ? 'customizing' : 'idle')
              }
              widgets={widgets}
              quintlets={quintlets}
              onOpenQuintlet={quintletId => openTab(quintletTabId(quintletId))}
              onCreateQuintlet={createQuintlet}
              onStartPrompt={startPrompt}
              onCreateWidget={() => {
                selectSession(null)
                openChat('Create widget')
              }}
              onAskAgent={widgetName =>
                openChat(`The widget "${widgetName}" failed to load. Inspect it and fix it.`)
              }
            />
          ) : activeTab === 'canvas' ? (
            <Suspense fallback={null}>
              <Canvas />
            </Suspense>
          ) : null}

          {pendingQuintlets.map(pendingQuintlet => (
            <PendingQuintletScreen
              key={pendingQuintlet.id}
              ref={handle => {
                if (handle) pendingQuintletRefs.current.set(pendingQuintlet.id, handle)
                else pendingQuintletRefs.current.delete(pendingQuintlet.id)
              }}
              active={!isUnavailable && activePendingQuintlet?.id === pendingQuintlet.id}
              pendingQuintlet={pendingQuintlet}
              running={
                !!pendingQuintlet.buildSessionId &&
                isSessionRunning(sessionActivity, workspaceId, pendingQuintlet.buildSessionId)
              }
              sketchSessionId={
                pendingQuintlet.status === 'draft'
                  ? (pinnedSessionId ?? draftSessionId(quintletTabId(pendingQuintlet.id)))
                  : undefined
              }
              workspaceId={workspaceId}
              onContinueInChat={openChat}
              onOpenChat={() => openChat()}
              onDiscard={() => discardPendingQuintlet(pendingQuintlet)}
            />
          ))}

          {/* Quintlets are not part of the chain above: QuintletManager keeps them
                mounted across tab switches (and collapses to nothing while
                another tab is on screen), which is what makes a switch back
                instant. */}
          <QuintletManager
            quintlets={quintlets}
            activeQuintletId={isUnavailable ? null : (activeQuintlet?.id ?? null)}
            params={appletParams}
          />
        </div>

        <DrawingLayer {...annotationLayerProps}>
          <DrawingToolbar
            controls={annotationControls}
            title="Draw annotation"
            busy={annotationControls.finishing}
            onComplete={() => void annotationControls.finish()}
          />
        </DrawingLayer>
      </div>

      <AnimatePresence>
        {widgetMode === 'theming' && (
          <ThemePanel key={workspaceId} onClose={() => setWidgetMode('idle')} />
        )}
      </AnimatePresence>

      <PanelHeader>
        <div className="flex min-w-0 flex-1 items-center">
          <WorkspaceTabs
            tabs={tabItems}
            active={activeTab}
            createItems={createItems}
            onSelect={openTab}
            onClose={closeTab}
            onReorder={reorderTabs}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeTab === 'dashboard' && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant={widgetMode === 'customizing' ? 'default' : 'ghost'}
                    size="icon"
                    aria-label="Widgets"
                    aria-pressed={widgetMode === 'customizing'}
                    onClick={() =>
                      setWidgetMode(widgetMode === 'customizing' ? 'idle' : 'customizing')
                    }
                  >
                    <Widget5Icon strokeWidth={1.5} />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Widgets</TooltipContent>
            </Tooltip>
          )}
          <WorkspaceActions onOpenTheme={() => setWidgetMode('theming')} />
        </div>
      </PanelHeader>
    </WorkspacePane>
  )

  return (
    <WorkspaceFrame
      onClick={onNavigationClick}
      workspace={
        <WorkspaceChatLayout
          workspace={workspacePanel}
          loading={hasRunningSession}
          unread={chatUnread || needsAgentAttention}
          open={chatOpen}
          onOpenChange={setChatOpen}
          onOpenChangeComplete={handleChatOpenComplete}
        >
          {onClose => (
            <ChatPanel
              {...chatPanelProps}
              active={chatOpen}
              onClose={onClose}
              annotation={popupAnnotation}
            />
          )}
        </WorkspaceChatLayout>
      }
    />
  )
}
