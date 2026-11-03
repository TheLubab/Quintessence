import type { ReactNode, Ref } from 'react'
import { useImperativeHandle } from 'react'

import { Button } from '@/frontend/components/ui/button'
import { Spinner } from '@/frontend/components/ui/spinner'
import { DrawingLayer } from '@/frontend/features/drawings/drawing-layer'
import { DrawingToolbar } from '@/frontend/features/drawings/drawing-toolbar'
import {
  type DrawingControls,
  useDrawingHistoryState
} from '@/frontend/features/drawings/use-drawing-layer'
import {
  type QuintletSketchController,
  useQuintletSketch
} from '@/frontend/features/drawings/use-quintlet-sketch'
import { cn } from '@/frontend/utils/cn'
import type { PendingQuintlet } from '@/shared/types'
import { draftSessionId } from '@/shared/session-drafts'
import { quintletTabId } from '@/shared/workspace-tabs'
import { PenNewRoundIcon } from '@solar-icons/react/linear'

export type PendingQuintletHandle = {
  prepareSketchForSend: () => Promise<void>
  resetSketch: () => Promise<void>
}

type PendingQuintletScreenProps = {
  ref?: Ref<PendingQuintletHandle>
  active: boolean
  pendingQuintlet: PendingQuintlet
  running: boolean
  sketchSessionId?: string
  workspaceId: string
  onContinueInChat: () => void
  onOpenChat: () => void
  onDiscard: () => void
}

export function PendingQuintletScreen({
  ref,
  active,
  pendingQuintlet,
  running,
  sketchSessionId,
  workspaceId,
  onContinueInChat,
  onOpenChat,
  onDiscard
}: PendingQuintletScreenProps) {
  const displayStatus =
    pendingQuintlet.status === 'submitted'
      ? running
        ? 'building'
        : 'waiting'
      : pendingQuintlet.status
  const sketch = useQuintletSketch({
    active: active && pendingQuintlet.status === 'draft',
    quintletId: pendingQuintlet.id,
    sessionId:
      sketchSessionId ??
      pendingQuintlet.buildSessionId ??
      draftSessionId(quintletTabId(pendingQuintlet.id)),
    source: quintletTabId(pendingQuintlet.id),
    workspaceId,
    onContinueInChat
  })

  useImperativeHandle(
    ref,
    () => ({
      prepareSketchForSend: sketch.prepareForSend,
      resetSketch: sketch.resetDocument
    }),
    [sketch.prepareForSend, sketch.resetDocument]
  )

  return (
    <PendingQuintletScreenSketchSurface
      active={active}
      error={pendingQuintlet.error}
      sketch={sketch}
      displayStatus={displayStatus}
      onDiscard={onDiscard}
      onOpenChat={onOpenChat}
    />
  )
}

function PendingQuintletScreenStarting() {
  return (
    <PendingQuintletScreenStatusLayout>
      <div className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Starting quintlet chat…</p>
      </div>
    </PendingQuintletScreenStatusLayout>
  )
}

type PendingQuintletScreenFailedProps = {
  error?: string
  onOpenChat: () => void
  onDiscard: () => void
}

function PendingQuintletScreenFailed({
  error,
  onOpenChat,
  onDiscard
}: PendingQuintletScreenFailedProps) {
  return (
    <PendingQuintletScreenStatusLayout>
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4 bg-radial from-background from-50% to-transparent to-75% p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={onOpenChat}>Open chat</Button>
        <Button variant="secondary" onClick={onDiscard}>
          Discard quintlet
        </Button>
      </div>
    </PendingQuintletScreenStatusLayout>
  )
}

type PendingQuintletScreenSketchSurfaceProps = {
  active: boolean
  error?: string
  sketch: QuintletSketchController
  displayStatus: 'draft' | 'starting' | 'building' | 'waiting' | 'failed'
  onDiscard: () => void
  onOpenChat: () => void
}

function PendingQuintletScreenSketchSurface({
  active,
  error,
  sketch,
  displayStatus,
  onDiscard,
  onOpenChat
}: PendingQuintletScreenSketchSurfaceProps) {
  const draft = displayStatus === 'draft'

  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden bg-background',
        active ? 'flex' : 'hidden'
      )}
    >
      <PendingQuintletScreenSketchBackground sketch={sketch} draft={draft} />
      <div
        inert={draft ? undefined : true}
        className={cn('absolute inset-0', !draft && 'pointer-events-none opacity-50')}
      >
        <DrawingLayer {...sketch.layerProps}>
          {draft && (
            <DrawingToolbar
              controls={sketch.controls}
              title="Sketch the quintlet"
              busy={sketch.continuing}
              onComplete={() => void sketch.continueInChat()}
            />
          )}
        </DrawingLayer>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 transition-shadow duration-500 ease-in-out',
          displayStatus === 'building' &&
            'animate-glow texture-inset-shadow-50% motion-reduce:animate-none'
        )}
      />
      {displayStatus === 'building' && (
        <PendingQuintletScreenBuildingState controls={sketch.controls} />
      )}
      {displayStatus === 'starting' && <PendingQuintletScreenStarting />}
      {displayStatus === 'waiting' && (
        <PendingQuintletScreenWaitingState
          error={error}
          onDiscard={onDiscard}
          onOpenChat={onOpenChat}
        />
      )}
      {displayStatus === 'failed' && (
        <PendingQuintletScreenFailed error={error} onOpenChat={onOpenChat} onDiscard={onDiscard} />
      )}
    </div>
  )
}

type PendingQuintletScreenSketchBackgroundProps = {
  sketch: QuintletSketchController
  draft: boolean
}

function PendingQuintletScreenSketchBackground({
  sketch,
  draft
}: PendingQuintletScreenSketchBackgroundProps) {
  const { controls, targetRef } = sketch
  const { hasStrokes } = useDrawingHistoryState(controls)

  return (
    <div
      ref={targetRef}
      className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:16px_16px]"
    >
      {draft && !controls.active && !hasStrokes && (
        <div className="flex flex-col items-center justify-center gap-2 bg-radial from-background from-10% to-transparent p-12 text-center text-sm text-muted-foreground">
          <PenNewRoundIcon size={56} strokeWidth={0.5} />
          <h2 className="max-w-xs font-medium text-foreground">
            A Quintlet is a mini app for your workspace
          </h2>
          <p className="max-w-xs">Describe what you need in chat, or sketch how it should look</p>
        </div>
      )}
    </div>
  )
}

type PendingQuintletScreenWaitingStateProps = {
  error?: string
  onDiscard: () => void
  onOpenChat: () => void
}

function PendingQuintletScreenWaitingState({
  error,
  onDiscard,
  onOpenChat
}: PendingQuintletScreenWaitingStateProps) {
  return (
    <PendingQuintletScreenStatusLayout>
      <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4 bg-radial from-background from-50% to-transparent to-75% p-12 text-center">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">The quintlet needs your attention</h1>
          <p className="text-sm text-muted-foreground">
            {error ?? 'Open the chat to answer or ask the agent to continue'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onOpenChat}>Open chat</Button>
          <Button variant="secondary" onClick={onDiscard}>
            Discard quintlet
          </Button>
        </div>
      </div>
    </PendingQuintletScreenStatusLayout>
  )
}

type PendingQuintletScreenBuildingStateProps = {
  controls: DrawingControls
}

function PendingQuintletScreenBuildingState({ controls }: PendingQuintletScreenBuildingStateProps) {
  const { hasStrokes } = useDrawingHistoryState(controls)

  return (
    <PendingQuintletScreenStatusLayout>
      {!hasStrokes && <Spinner className="size-6 text-muted-foreground" />}
    </PendingQuintletScreenStatusLayout>
  )
}

type PendingQuintletScreenStatusLayoutProps = {
  children: ReactNode
}

function PendingQuintletScreenStatusLayout({ children }: PendingQuintletScreenStatusLayoutProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {children}
    </div>
  )
}
