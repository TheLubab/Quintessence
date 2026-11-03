import { useCallback, useRef, useState } from 'react'

import {
  type Editor,
  type TLAssetStore,
  type TLComponents,
  type TLEditorSnapshot,
  type TLGridProps,
  type TLUiOverrides,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultVerticalAlignStyle,
  Tldraw,
  getSnapshot,
  loadSnapshot,
  useEditor,
  useUniqueSafeId
} from 'tldraw'
import 'tldraw/tldraw.css'

import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'
import { setCanvasExecutor } from '@/frontend/features/canvas/canvas-executor'
import { persistCanvasSession } from '@/frontend/features/canvas/canvas-session'
import { BROWSER_TAB_ID } from '@/frontend/utils/browser-tab-id'
import { type WorkspaceEvent, useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'
import type { CanvasOp, CanvasOpResult } from '@/shared/types'
import {
  type CanvasFetch,
  CanvasSkewNotice,
  detectCanvasSkew,
  useCanvasSnapshot
} from './use-canvas-snapshot'
import { CanvasStyleBar, CanvasToolbar } from './canvas-controls'
import { CanvasGuide } from './canvas-guide'

const AUTOSAVE_MS = 500

// tldraw license key, inlined at build time from the PUBLIC_TLDRAW_LICENSE_KEY
// env var (Bun's prefix-based env inlining — see bunfig.toml `[serve.static] env`
// for dev and scripts/build-frontend.ts for prod). The key is public by design
// (domain-scoped, ships in the frontend bundle). Empty/unset → undefined →
// tldraw's default unlicensed watermark. See docs/quint-canvas.md.
// Inlining requires the var to be set when the server process starts — the CLI
// launcher defaults it (backend/cli.ts); a bare ref here throws in the browser.
const LICENSE_KEY = process.env.PUBLIC_TLDRAW_LICENSE_KEY || undefined

// Execute a relayed op in this tab. Only `view` is relayed now — rasterizing the
// canvas to a PNG needs the browser (`editor.toImageDataUrl`); every mutation runs
// server-side against the disk snapshot (see backend/canvas/executor.ts), so a
// non-view op arriving here is unexpected.
function makeExecutor(editor: Editor) {
  return async (op: CanvasOp): Promise<CanvasOpResult> => {
    if (op.kind !== 'view') {
      throw new Error(`Canvas op "${op.kind}" runs on the server, not the browser.`)
    }
    const ids = [...editor.getCurrentPageShapeIds()]
    if (ids.length === 0) throw new Error('Canvas is empty — nothing to view.')
    const { url } = await editor.toImageDataUrl(ids, {
      format: 'png',
      background: true,
      padding: 32
    })
    return { image: url }
  }
}

// File-backed assets: without this, tldraw inlines every pasted/dropped image as
// a base64 data URL inside the document — megabytes re-serialized into
// `.quint/.canvas.json` on every autosave and shipped over every GET/PUT.
// Instead `upload` POSTs the bytes once and stores a tiny `asset:<file>` src on
// the record; `resolve` maps it back to the serving URL at render time. See
// backend/canvas/assets.ts.
function makeAssetStore(workspaceId: string): TLAssetStore {
  const base = `/api/workspaces/${workspaceId}/canvas/assets`
  return {
    async upload(_asset, file) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      })
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
      const { src } = (await res.json()) as { src: string }
      return { src }
    },
    resolve(asset) {
      const src = asset.props.src
      if (src?.startsWith('asset:')) return `${base}/${src.slice('asset:'.length)}`
      return src
    }
  }
}

// --- Canvas UI shell --------------------------------------------------
// We replace tldraw's full UI with a curated subset (see docs/quint-canvas.md
// for the prioritization). Backbone v1: a custom vertical tool bar on the left,
// most menus dropped, pages disabled, export hard-removed, grid on. The default
// (contextual) style panel and zoom control are kept as-is for now; style
// trimming is a follow-up.

// Drop tldraw's built-in chrome we replace with custom overlays (tool bar, style
// bar). `null` removes a component entirely. NavigationPanel is kept — we like its
// native zoom control — but Minimap is nulled, which also strips its toggle button
// from the panel, leaving just the zoom menu. Kept on defaults: NavigationPanel
// (zoom), ContextMenu, KeyboardShortcutsDialog.
function CanvasBackground() {
  return <div className="absolute inset-0 bg-background" />
}

function UniformGrid({ x, y, z, size }: TLGridProps) {
  const id = useUniqueSafeId('canvas-grid')
  const editor = useEditor()
  let step = editor.options.gridSteps[0]?.step ?? 1

  for (const gridStep of editor.options.gridSteps) {
    if (z >= gridStep.min) step = gridStep.step
  }

  const spacing = step * size * z
  const offsetX = 0.5 + x * z
  const offsetY = 0.5 + y * z
  const dotX = offsetX > 0 ? offsetX % spacing : spacing + (offsetX % spacing)
  const dotY = offsetY > 0 ? offsetY % spacing : spacing + (offsetY % spacing)

  return (
    <svg className="tl-grid" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id={id} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle className="fill-accent" cx={dotX} cy={dotY} r={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}

const CANVAS_COMPONENTS: TLComponents = {
  Background: CanvasBackground,
  Grid: UniformGrid,
  Toolbar: null,
  StylePanel: null,
  Minimap: null,
  MainMenu: null,
  PageMenu: null,
  ActionsMenu: null,
  QuickActions: null,
  HelpMenu: null,
  DebugMenu: null,
  ZoomMenu: null
}

// Remove dropped tools (kills their shortcuts too) and hard-disable export/print.
// Deleting an unknown action id is a harmless no-op.
const CANVAS_OVERRIDES: TLUiOverrides = {
  tools(_editor, tools) {
    delete tools.frame
    delete tools.laser
    return tools
  },
  actions(_editor, actions) {
    for (const id of ['export-as-svg', 'export-as-png', 'copy-as-svg', 'copy-as-png', 'print']) {
      delete actions[id]
    }
    return actions
  }
}

// One page only — disables the page selector and all multi-page UI.
const CANVAS_OPTIONS = { maxPages: 1 }

// Browser drag/drop/paste limits (tldraw defaults: reject >10MB, no rescale). We
// accept larger drops and rescale big images to fit so a phone-sized photo lands
// as a lightweight asset instead of bloating the snapshot's sidecar files. The
// size check runs BEFORE the rescale, so a 32MB drop is admitted and then shrunk.
// (The agent's `quint canvas add image` path has its own presets — see the
// executor's IMAGE_PRESETS; this only governs what the browser accepts.)
const MAX_DROP_BYTES = 32 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2048

// The Canvas surface: a real tldraw editor, hydrated from and autosaved to
// `.quint/.canvas.json` via REST. One canvas shared by the user and the agent —
// the agent reaches it through `quint canvas` (relayed ops execute here). See
// docs/quint-canvas.md.
export function Canvas() {
  const workspaceId = useWorkspaceId()
  return <WorkspaceCanvas key={workspaceId} workspaceId={workspaceId} />
}

function WorkspaceCanvas({ workspaceId }: { workspaceId: string }) {
  const editorRef = useRef<Editor | null>(null)
  // The whole canvas region (canvas + tool bar + style bar). Focus is driven
  // off whether a pointerdown lands inside this, so clicking a tool keeps the
  // editor focused — see the pointerdown handler in onMount.
  const rootRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set before a remote `loadSnapshot`; the autosave listener consumes it on the
  // first (throttled) flush so the load doesn't echo back out as a save. (Store
  // listeners fire on the next frame, not synchronously, so a timer-based clear
  // would race — consuming it in the listener is timing-independent.)
  const applyingRemote = useRef(false)
  // Reactive handle to the mounted editor, used to render the custom tool bar.
  const [editor, setEditor] = useState<Editor | null>(null)
  const { loaded, snapshot, skew, flagSkew } = useCanvasSnapshot(workspaceId)
  // This keyed component gives each workspace one stable asset store. A fresh
  // identity makes <Tldraw> remount the editor and drop unsaved edits.
  const [assetStore] = useState<TLAssetStore>(() => makeAssetStore(workspaceId))

  const save = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    let document: TLEditorSnapshot['document']
    try {
      document = getSnapshot(editor.store).document
    } catch {
      return
    }
    void fetch(`/api/workspaces/${workspaceId}/canvas`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document, origin: BROWSER_TAB_ID })
    }).catch(() => {})
  }, [workspaceId])

  // A remote save (another tab, or an agent draw landing in another tab) — pull
  // the new snapshot and load it into the live store. Skip our own echo. The
  // fetched document is pre-flighted like the initial load: if the server was
  // swapped for a newer Quint mid-session, `loadSnapshot` here would throw — flip
  // the skew notice instead (unmounting the editor, which also stops the
  // autosave timer) so this stale tab can't save over the newer file.
  useWorkspaceEvent((e: WorkspaceEvent) => {
    if (e.type !== 'canvas:updated' || e.workspaceId !== workspaceId) return
    if (e.origin && e.origin === BROWSER_TAB_ID) return
    if (!editorRef.current) return
    fetch(`/api/workspaces/${workspaceId}/canvas`)
      .then(r => r.json())
      .then((d: CanvasFetch) => {
        const editor = editorRef.current
        if (!editor || !d?.document) return
        const found = detectCanvasSkew(d.document, d.writer)
        if (found) {
          if (saveTimer.current) clearTimeout(saveTimer.current)
          flagSkew(found)
          return
        }
        applyingRemote.current = true
        loadSnapshot(editor.store, { document: d.document })
      })
      .catch(() => {})
  })

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      setEditor(editor)
      // Grid on by default (no toggle in the UI).
      editor.updateInstanceState({ isGridMode: true })
      // Locked defaults that have no UI control: hand-drawn font, centered text.
      editor.run(() => {
        editor.setStyleForNextShapes(DefaultFontStyle, 'draw')
        editor.setStyleForNextShapes(DefaultHorizontalAlignStyle, 'middle')
        editor.setStyleForNextShapes(DefaultVerticalAlignStyle, 'middle')
        // Rectangles start solid-filled. Still user-adjustable via the style bar —
        // applyToolLocks deliberately never re-pins fill, so this is a default, not
        // a lock. ('fill' = the style bar's "Solid"; 'solid' there means "Semi".)
        editor.setStyleForNextShapes(DefaultFillStyle, 'fill')
      })
      // Restore this browser's camera/zoom for the workspace, then keep it saved.
      const stopSessionSave = persistCanvasSession(editor, workspaceId)
      const unlisten = editor.store.listen(
        () => {
          if (applyingRemote.current) {
            applyingRemote.current = false
            return
          }
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(save, AUTOSAVE_MS)
        },
        { source: 'user', scope: 'document' }
      )
      setCanvasExecutor(workspaceId, makeExecutor(editor))
      // Focus management: tldraw only fires keyboard shortcuts while the editor's
      // instance `isFocused` is set, but with `autoFocus={false}` it never flips
      // that on its own. We drive it from where the pointer lands — a pointerdown
      // inside the canvas (canvas, tool bar, or style bar, all under rootRef)
      // focuses the editor; one anywhere else (e.g. the chat) blurs it, so hotkeys
      // are live only when the canvas is the active surface. Guarded on the
      // current state so a click already inside (e.g. double-click to edit a
      // shape's text) doesn't re-focus the container and steal focus from the
      // text field. Capture phase so we see it regardless of downstream handlers.
      const onPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null
        const inside = !!target && !!rootRef.current?.contains(target)
        if (inside) {
          if (!editor.getIsFocused()) editor.focus()
        } else if (editor.getIsFocused()) {
          editor.blur()
        }
      }
      const doc = editor.getContainer().ownerDocument
      doc.addEventListener('pointerdown', onPointerDown, true)
      // First open: grab focus so the user can reach for the keyboard right away.
      // `focus()` both sets `isFocused` and DOM-focuses the canvas container, so it
      // becomes the active element — clearing tldraw's secondary guard that mutes
      // shortcuts while an input/textarea (e.g. the chat) holds focus.
      editor.focus()
      return () => {
        unlisten()
        stopSessionSave()
        doc.removeEventListener('pointerdown', onPointerDown, true)
        if (saveTimer.current) clearTimeout(saveTimer.current)
        setCanvasExecutor(workspaceId, null)
        setEditor(null)
        editorRef.current = null
      }
    },
    [workspaceId, save]
  )

  if (!loaded) return <div className="min-h-0 flex-1 bg-muted/40" />
  if (skew) return <CanvasSkewNotice skew={skew} />

  return (
    <div ref={rootRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0">
        <Tldraw
          snapshot={snapshot}
          assets={assetStore}
          licenseKey={LICENSE_KEY}
          onMount={onMount}
          components={CANVAS_COMPONENTS}
          overrides={CANVAS_OVERRIDES}
          options={CANVAS_OPTIONS}
          // Accept drops up to 32MB and rescale big images to fit (tldraw checks
          // the size before rescaling, so a large photo is admitted then shrunk).
          maxAssetSize={MAX_DROP_BYTES}
          maxImageDimension={MAX_IMAGE_DIMENSION}
          // Hand focus control entirely to us: tldraw's own `autoFocus` only seeds
          // the `isFocused` flag (hotkeys would fire window-wide, even from the
          // chat) without ever DOM-focusing the canvas. Instead onMount focuses
          // the editor on open and a pointerdown handler toggles it thereafter.
          autoFocus={false}
        />
      </div>
      {editor && <CanvasGuide editor={editor} />}
      {editor && <CanvasToolbar editor={editor} />}
      {editor && <CanvasStyleBar editor={editor} />}
    </div>
  )
}
