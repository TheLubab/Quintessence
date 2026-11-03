import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useRouter } from 'wouter'

import { AltArrowDownIcon, CloseIcon, UndoLeftIcon } from '@solar-icons/react/linear'
import { draftSessionId } from '@/shared/session-drafts'
import { resolveUrl } from '@/shared/navigation'
import { useCurrentTabId } from './sessions/use-selected-session'

import { canSubmitComposerAction, focusComposer } from '@/frontend/components/shared/composer'
import { AgentFace } from '@/frontend/components/shared/agent-face'
import { useStickToBottom } from '@/frontend/features/chat/messages/use-stick-to-bottom'
import { appendPreviewTurn, groupTurns } from '@/frontend/features/chat/messages/group-turns'
import {
  chatNoticeLabel,
  interleaveNotices
} from '@/frontend/features/chat/messages/interleave-notices'
import { attachmentKey, useLive } from '@/frontend/features/chat/chat-store'
import type { ChatPromptBubble } from '@/frontend/features/chat/messages/chat-prompt-bubbles'
import type { ChatSendOptions } from '@/frontend/features/chat/chat-send'
import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'
import type { SystemNotice, Turn, ViewState } from '@/shared/types'

import type { ComposerBanner } from './composer/banners/composer-banner'
import { ChatComposer, type ComposerAnnotationControls } from './composer/chat-composer'
import {
  ChatEmptyState,
  type WelcomeDestination,
  resolveChatEmptyState
} from './messages/chat-empty-state'
import { MetaSessionPanel } from './messages/meta-session-panel'
import { ChatSelector } from './sessions/chat-selector'
import { useWorkspaceSessions } from './sessions/api'
import { TurnView } from './messages/turn-view'
import { Button } from '@/frontend/components/ui/button'
import { cn } from '@/frontend/utils/cn'
import type { AgentAvailability } from '@/frontend/utils/agent-availability'
import { useUiStore } from '@/frontend/store/ui'

export type QuintletChatDraft = {
  sessionId: string
  onRemoveDrawing: (localId: string) => void
}

type ChatPanelProps = {
  forkedFromSessionId?: string
  active?: boolean
  focusRequest?: number
  chatLoaded: boolean
  hasWorkspaceApplets: boolean
  view: ViewState
  // The live streaming preview as a synthetic assistant turn (or null). Merged
  // into the trailing assistant run so a thinking-only
  // preview folds into the current tool group. See frontend/utils/preview-turn.ts.
  previewTurn?: Turn | null
  sessionId?: string | null
  processing: boolean
  composerBanner?: ComposerBanner
  agentAvailability: AgentAvailability
  annotation?: ComposerAnnotationControls
  send: (text: string, options?: ChatSendOptions) => Promise<void>
  stop: () => void
  onNavigateFromWelcome: (destination: WelcomeDestination) => void
  onClose: () => void
  quintletDraft?: QuintletChatDraft
}

const EMPTY_TURNS: Turn[] = []
const EMPTY_NOTICES: SystemNotice[] = []

export function ChatPanel({
  forkedFromSessionId,
  active = true,
  focusRequest = 0,
  chatLoaded,
  hasWorkspaceApplets,
  view,
  previewTurn,
  sessionId,
  processing,
  composerBanner,
  agentAvailability,
  annotation,
  send,
  stop,
  onNavigateFromWelcome,
  onClose,
  quintletDraft
}: ChatPanelProps) {
  const workspaceId = useWorkspaceId()
  const { base } = useRouter()
  const { data: sessions } = useWorkspaceSessions(workspaceId)
  const sourceName = sessions?.find(session => session.sessionId === forkedFromSessionId)?.summary
  const tabId = useCurrentTabId()
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const effectiveSessionId = quintletDraft?.sessionId ?? sessionId ?? draftSessionId(tabId)
  const modelSessionId = quintletDraft ? null : (sessionId ?? null)
  const turns = quintletDraft ? EMPTY_TURNS : view.turns
  const hasSentMessageFromQuint = useUiStore(state => state.hasSentMessageFromQuint)
  const isWorkspacePendingAnalysis = useUiStore(state =>
    (state.workspaceIdsPendingAnalysis ?? []).includes(workspaceId)
  )
  const attachmentsUploading = useLive(state =>
    (state.attachments[attachmentKey(workspaceId, effectiveSessionId)] ?? []).some(
      attachment => attachment.kind !== 'text' && attachment.status === 'uploading'
    )
  )
  const chatReady = chatLoaded || !!quintletDraft
  const promptDisabled =
    !chatReady || !canSubmitComposerAction(true, attachmentsUploading, agentAvailability)
  const effectivePreviewTurn = quintletDraft ? null : previewTurn
  const notices = quintletDraft ? EMPTY_NOTICES : view.notices
  const savedGroups = useMemo(() => groupTurns(turns), [turns])
  const groupedTurns = useMemo(
    () => appendPreviewTurn(savedGroups, effectivePreviewTurn),
    [savedGroups, effectivePreviewTurn]
  )
  // Grouped turns plus the renderable notices (compaction, model changes)
  // woven in at the moment they happened. Interleaving runs AFTER grouping so
  // a notice never splits a tool-only run apart.
  const timeline = useMemo(() => interleaveNotices(groupedTurns, notices), [groupedTurns, notices])
  const lastTurnId = groupedTurns.length > 0 ? groupedTurns[groupedTurns.length - 1].id : null
  const effectiveProcessing = quintletDraft ? false : processing
  const showEmptyState =
    !!quintletDraft ||
    (!forkedFromSessionId && chatLoaded && timeline.length === 0 && !effectiveProcessing)
  const showTranscript = chatLoaded && !showEmptyState
  const emptyStateKind = resolveChatEmptyState({
    tabId,
    isQuintletDraft: !!quintletDraft,
    hasSentMessageFromQuint,
    isWorkspacePendingAnalysis
  })

  // Stick to the bottom while pinned; respect scroll-up; jump on session switch.
  const { atBottom, scrollToBottom, scrollToTop } = useStickToBottom(scrollRef, effectiveSessionId)

  useLayoutEffect(() => {
    if (showEmptyState && emptyStateKind !== 'dashboard-empty' && emptyStateKind !== 'tab-empty')
      scrollToTop()
  }, [showEmptyState, emptyStateKind, scrollToTop])

  // The active chat surface owns initial focus. A monotonically increasing
  // request also refocuses an already-visible composer after intent actions.
  useEffect(() => {
    if (active) focusComposer(composerRef.current)
  }, [active, focusRequest])

  // Sending always returns the user to the bottom, even if they'd scrolled up —
  // they expect to see their message and the reply.
  const handleSend = useCallback(
    async (text: string, options?: ChatSendOptions) => {
      await send(text, options)
      scrollToBottom()
    },
    [send, scrollToBottom]
  )

  const handlePromptSelect = useCallback(
    (prompt: ChatPromptBubble) => {
      if (promptDisabled) return
      handleSend(prompt.prompt, { directives: prompt.context })
    },
    [handleSend, promptDisabled]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-2 pb-3">
      <header className="flex w-full min-w-0 items-center justify-between pr-2 pb-2 pl-2">
        <div className="flex h-7 min-w-0 flex-1">
          <ChatSelector className="text-foreground" />
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close chat">
          <CloseIcon strokeWidth={1.75} />
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className="flex scrollbar-thin flex-1 scroll-fade flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-8 [--scroll-fade-reveal:8px]"
        >
          <div className="mx-auto flex w-full max-w-(--chat-max-container) flex-1 flex-col gap-6">
            {forkedFromSessionId && (
              <a
                href={resolveUrl(`quint:/chats/${encodeURIComponent(forkedFromSessionId)}`, {
                  workspaceId,
                  base
                })}
                className="block text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-center gap-3">
                  <UndoLeftIcon
                    size={20}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-muted-foreground">Started from another chat</span>
                    <span className="truncate font-medium" title={sourceName}>
                      {sourceName || 'Another chat'}
                    </span>
                  </div>
                </div>
              </a>
            )}
            {showEmptyState && (
              <ChatEmptyState
                kind={emptyStateKind}
                hasWorkspaceApplets={hasWorkspaceApplets}
                disabled={promptDisabled}
                onSelectPrompt={handlePromptSelect}
                onNavigate={onNavigateFromWelcome}
              />
            )}
            {showTranscript &&
              timeline.map(item =>
                item.kind === 'notice' ? (
                  <ChatNoticeRow key={`notice:${item.notice.id}`} notice={item.notice} />
                ) : (
                  <TurnView
                    key={item.turn.id}
                    turn={item.turn}
                    processing={effectiveProcessing && item.turn.id === lastTurnId}
                  />
                )
              )}
            {showTranscript && (
              <div className="mt-auto -ml-3 pt-2">
                <AgentFace
                  color="primary"
                  animated={effectiveProcessing}
                  expression={effectiveProcessing ? 'thinking' : undefined}
                />
              </div>
            )}
          </div>
        </div>

        {/* Jump to latest — shown only when scrolled up, so following the tail
            never yanks the user while they read history. */}
        {showTranscript && !atBottom && turns.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => scrollToBottom('smooth')}
            aria-label="Jump to latest"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-in rounded-full fade-in slide-in-from-bottom-1"
          >
            <AltArrowDownIcon strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[calc(var(--chat-max-container)+24px)] flex-col px-3">
        <div
          className={cn(
            '@container flex w-full flex-col transition-[padding]',
            composerBanner && 'gap-2 rounded-2xl p-2',
            composerBanner?.tone === 'default' && 'bg-accent',
            composerBanner?.tone === 'error' && 'bg-destructive/10'
          )}
        >
          {composerBanner?.content}
          {!quintletDraft && (
            <MetaSessionPanel workspaceId={workspaceId} sessionId={sessionId ?? null} />
          )}
          <ChatComposer
            composerRef={composerRef}
            onSend={handleSend}
            onStop={stop}
            processing={effectiveProcessing}
            sessionId={effectiveSessionId}
            modelSessionId={modelSessionId}
            availability={agentAvailability}
            chatReady={chatReady}
            annotation={quintletDraft ? undefined : annotation}
            onRemoveDrawing={quintletDraft?.onRemoveDrawing ?? annotation?.onRemove}
            allowFiles={!quintletDraft}
            placeholder={quintletDraft ? 'Drop in the details' : undefined}
          />
        </div>
      </div>
    </div>
  )
}

type ChatNoticeRowProps = { notice: SystemNotice }

// A quiet, centered one-liner marking a session event (context compacted,
// model changed) at its place in the transcript. Kinds without designed copy
// render nothing (see chatNoticeLabel).
// catalog.
export function ChatNoticeRow({ notice }: ChatNoticeRowProps) {
  const label = chatNoticeLabel(notice)
  if (!label) return null
  return (
    <div className="flex justify-center">
      <span className="max-w-full truncate text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
