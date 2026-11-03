// The workspace's quintlet surface: every quintlet the user has open lives here, and
// switching tabs picks one of them instead of tearing the old one down and
// building the new one up.
//
// Why no transition between quintlets: a quintlet is an agent-authored bundle with its
// own styles and its own state. Animating the swap means keeping the outgoing
// DOM alive past the moment React drops the applet's <style> tag, so the quintlet
// spends its exit unstyled. Keeping quintlets mounted removes the problem instead
// of timing around it — the switch is instant, and a quintlet only ever loads once.
//
// The one animation left is the rebuild dissolve: when the quintlet you are looking
// at is rebuilt, the new build fades in over the old one. That is safe here
// because both builds share the slot's style tag (see QuintletSlot), and it is
// worth the 200ms — it is the only signal that the thing under your cursor just
// changed underneath you.
import { Activity, type ComponentType, memo, useCallback, useEffect, useState } from 'react'

import { Spinner } from '@/frontend/components/ui/spinner'
import { appletId, appletStyleKey } from '@/frontend/features/applets/applet-cache'
import { useAppletStyle } from '@/frontend/features/applets/applet-styles'
import { useAppletThumbnails } from '@/frontend/features/applets/applet-thumbnail'
import {
  type AppletComponentProps,
  type AppletState,
  useQuintlet
} from '@/frontend/features/applets/use-applet'
import { WidgetErrorBoundary } from '@/frontend/features/applets/widget-error-boundary'
import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'
import { cn } from '@/frontend/utils/cn'
import { useLatestRef } from '@/frontend/utils/use-latest-ref'
import type { CompiledQuintlet } from '@/shared/types'

import {
  nextEvictionDelay,
  reconcileResidents,
  type ResidentQuintlet,
  sameResidents
} from './quintlet-residency'

type QuintletManagerProps = {
  quintlets: CompiledQuintlet[]
  // The quintlet the active tab names, or null when another tab is on screen. The
  // manager stays mounted either way — that is what makes coming back from the
  // Dashboard or Canvas tab instant too.
  activeQuintletId: string | null
  // The active quintlet's URL query params. Parked quintlets retain their last values.
  params: Record<string, string>
}

// Mequintzed against the workspace screen's own churn: the screen re-renders on
// every streaming delta of the selected chat (and on focus/popup state), and
// without the bail-out each of those re-renders the full applet tree of every
// resident quintlet — typing next to a streaming agent then janks on a big quintlet.
// All three props are identity-stable outside real changes: `quintlets` comes from
// the workspace query cache, `activeQuintletId` is a string, and `params` is
// memoized by the query string.
export const QuintletManager = memo(function QuintletManager({
  quintlets,
  activeQuintletId,
  params
}: QuintletManagerProps) {
  const residents = useResidentQuintlets(activeQuintletId, quintlets)
  // Render in workspace order, not residency order: the policy ranks quintlets by
  // recency, and reordering the children would make React move live DOM around
  // on every switch. The slots are stacked absolutely with one visible, so
  // their order on the page carries no meaning.
  const resident = new Set(residents.map(entry => entry.id))

  return (
    // Hidden rather than unmounted when no quintlet tab is on screen: the parked
    // quintlets keep their DOM, and `display: none` keeps this layer out of the
    // layout and out of the way of pointer events on the tab that IS on screen.
    <div className={cn('relative min-h-0 flex-1 overflow-hidden', !activeQuintletId && 'hidden')}>
      {quintlets
        .filter(quintlet => resident.has(quintlet.id))
        .map(quintlet => (
          <QuintletSlot
            key={quintlet.id}
            quintlet={quintlet}
            active={quintlet.id === activeQuintletId}
            params={params}
          />
        ))}
    </div>
  )
})

// The quintlets mounted right now: the active one, plus the recently-visited ones
// parked offscreen. The policy (and its timing) lives in quintlet-residency.ts.
function useResidentQuintlets(
  activeId: string | null,
  quintlets: CompiledQuintlet[]
): ResidentQuintlet[] {
  const [residents, setResidents] = useState<ResidentQuintlet[]>([])
  // A workspace refetch hands us a new array on every event; residency only
  // cares whether a quintlet appeared or disappeared. So the effect keys off the id
  // set, and the reconcile reads the current list through the ref.
  const quintletsRef = useLatestRef(quintlets)
  const availableIds = quintlets.map(quintlet => quintlet.id).join('\n')

  const reconcile = useCallback(() => {
    setResidents(current => {
      const next = reconcileResidents(current, {
        activeId,
        available: new Set(quintletsRef.current.map(quintlet => quintlet.id)),
        now: Date.now()
      })
      return sameResidents(current, next) ? current : next
    })
  }, [activeId, quintletsRef])

  // Promote the quintlet the user switched to, and release the one it replaced.
  useEffect(() => {
    reconcile()
  }, [availableIds, reconcile])

  // Then evict on the retention deadline — one timer, for the nearest one.
  useEffect(() => {
    const delay = nextEvictionDelay(residents, Date.now())
    if (delay === null) return
    const timer = setTimeout(reconcile, delay)
    return () => clearTimeout(timer)
  }, [reconcile, residents])

  return residents
}

type QuintletSlotProps = {
  quintlet: CompiledQuintlet
  active: boolean
  params: Record<string, string>
}

// One resident quintlet. The bundle it holds is loaded and kept fresh for as long
// as the slot lives — a quintlet rebuilt while parked picks the new build up in
// place, so it is current the moment the user comes back to it.
function QuintletSlot({ quintlet, active, params }: QuintletSlotProps) {
  const workspaceId = useWorkspaceId()
  const bundle = useQuintlet(quintlet.id)
  const { current, outgoing } = useLoadedBundle(bundle, active)
  // A parked quintlet keeps rendering with the params it was last shown with: the
  // active quintlet's URL state is not its to render.
  const [shownParams, setShownParams] = useState(params)
  if (active && shownParams !== params) setShownParams(params)

  // The applet's <style> is acquired HERE, outside the Activity below. Hiding
  // an Activity unmounts its children's effects, which would strip the styles
  // off the page while the DOM they style is still parked — the exact flash
  // this component exists to remove. The tag drops when the slot is evicted.
  // Holding it here is also what lets the dissolve below overlap two builds:
  // the styles belong to the slot, not to either frame. The active quintlet's sheet
  // is raised to the end of <head> so the global at-rule names it shares with
  // the parked quintlets resolve to the one on screen.
  useAppletStyle(
    appletStyleKey('quintlets', workspaceId, quintlet.id),
    current?.version ?? bundle.version,
    active
  )

  const failed = bundle.status === 'error'
  useAppletThumbnails({
    kind: 'quintlet',
    enabled: active && Boolean(current) && !failed,
    targets: [
      {
        id: quintlet.id,
        revision: quintlet.revision
      }
    ]
  })

  return (
    <>
      {active && failed && (
        <p className="absolute inset-0 p-4 text-xs text-destructive">{bundle.error}</p>
      )}
      {active && !failed && !current && <QuintletSplash />}
      {current &&
        !failed && (
          // React hides these nodes with `display: none` while the Activity is
          // hidden, so a parked quintlet neither paints nor swallows clicks.
          <Activity mode={active ? 'visible' : 'hidden'}>
            {outgoing && (
              <QuintletFrame
                key={outgoing.version}
                quintlet={quintlet}
                build={outgoing}
                params={shownParams}
              />
            )}
            <QuintletFrame
              key={current.version}
              quintlet={quintlet}
              build={current}
              params={shownParams}
              entering={outgoing !== null}
              current
            />
          </Activity>
        )}
    </>
  )
}

type QuintletFrameProps = {
  quintlet: CompiledQuintlet
  build: LoadedQuintletVersion
  params: Record<string, string>
  // Play the rebuild dissolve. Set on the incoming build only, and only while
  // the build it replaced is still rendered underneath it.
  entering?: boolean
  // The current build owns thumbnails and presence during a rebuild.
  current?: boolean
}

// One build of one quintlet, in its style scope. Frames stack absolutely, so during
// a rebuild the incoming one dissolves in over the outgoing one still on screen.
//
// The frame itself never scrolls; a child does. Applet-scoped overlays portal
// into this root and position against it.
function QuintletFrame({ quintlet, build, params, entering, current = false }: QuintletFrameProps) {
  const workspaceId = useWorkspaceId()
  const id = appletId('quintlets', quintlet.id)

  return (
    <div
      data-applet-thumbnail={current ? id : undefined}
      data-applet={id}
      className={cn(
        // Keep applet z-indexes inside the quintlet. Host overlays render after this
        // frame and should always stack above the quintlet as a single unit.
        'absolute inset-0 isolate',
        entering && 'animate-in duration-200 ease-out blur-in-4 fade-in'
      )}
    >
      <div className="size-full overflow-auto">
        <WidgetErrorBoundary
          name={quintlet.id}
          kind="quintlet"
          workspaceId={workspaceId}
          resetKey={build.version}
        >
          <build.Component params={params} />
        </WidgetErrorBoundary>
      </div>
    </div>
  )
}

type LoadedQuintletVersion = {
  Component: ComponentType<AppletComponentProps>
  version: number
}

type LoadedBundle = {
  // The build to render, held across reloads. A rebuild flips the bundle back
  // to `loading` for as long as the fetch takes, and swapping a live quintlet for a
  // spinner every time the agent edits it is worse than showing the previous
  // build for that moment. The splash is for a quintlet with nothing to show yet —
  // the first time it is opened.
  current: LoadedQuintletVersion | null
  // The build `current` just replaced, kept underneath for the length of the
  // dissolve so the new one fades in over the quintlet instead of over an empty
  // panel. Null except during a rebuild swap on screen.
  outgoing: LoadedQuintletVersion | null
}

// How long the outgoing build stays underneath. Matches the `duration-200` the
// incoming frame animates with.
const DISSOLVE_MS = 200

function useLoadedBundle(bundle: AppletState, dissolve: boolean): LoadedBundle {
  const [loaded, setLoaded] = useState<LoadedBundle>({ current: null, outgoing: null })

  if (bundle.status === 'ready' && loaded.current?.version !== bundle.version) {
    const build = { Component: bundle.Component, version: bundle.version }
    // The first build of a quintlet has nothing to dissolve from, and a parked quintlet
    // has nobody watching — both swap straight in.
    setLoaded(previous => ({ current: build, outgoing: dissolve ? previous.current : null }))
  }

  useEffect(() => {
    if (!loaded.outgoing) return
    const timer = setTimeout(
      () => setLoaded(previous => ({ ...previous, outgoing: null })),
      DISSOLVE_MS
    )
    return () => clearTimeout(timer)
  }, [loaded.outgoing])

  return loaded
}

// A quintlet's one loading moment: the first open, while its bundle is fetched. The
// delay keeps it off screen entirely for a fast load — the common case, since
// the module cache outlives eviction and only the network trip is new.
function QuintletSplash() {
  return (
    <div className="absolute inset-0 flex animate-in items-center justify-center delay-150 duration-200 fill-mode-both fade-in">
      <Spinner className="text-muted-foreground" />
    </div>
  )
}
