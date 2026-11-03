import { readdir } from 'node:fs/promises'
import { join } from 'path'

import tldrawPkg from 'tldraw/package.json'

import type { CanvasWriter } from '@/shared/types'

import quintPkg from '../../package.json'
import {
  SWEEP_GRACE_MS,
  assetSrcFileName,
  getCanvasAssetsDir,
  canvasAssetFile,
  sweepOrphanAssets
} from './assets'

// The Canvas is a shared tldraw canvas per workspace, persisted as a tldraw
// *document* snapshot here (the per-tab `session` is intentionally dropped). Two
// writers: the browser autosaves on user edits, and the server writes on agent
// draws (see executor.ts). This module owns the on-disk shape: load,
// save, and the `quint canvas read` parser. Image bytes live beside the snapshot
// as files, not inside it (see assets.ts). See docs/quint-canvas.md.

// A tldraw document snapshot: `getSnapshot(store).document`. Opaque to us apart
// from `.store` (the record map) which `read` walks. `null` means empty canvas.
export type CanvasDoc = { store?: Record<string, unknown>; schema?: unknown }
export type CanvasSnapshot = { document: CanvasDoc | null; writer?: CanvasWriter }

// This process's identity as a snapshot writer. The tldraw version is what
// matters for compatibility (the snapshot embeds its schema); the quint version is
// what a user can actually act on ("update Quint"). Both resolve from this
// install's own package.json files, so they're correct in the repo-source and
// installed layouts alike.
export const CANVAS_WRITER: CanvasWriter = {
  quint: quintPkg.version,
  tldraw: tldrawPkg.version
}

// One shape as surfaced by `quint canvas read` — a compact, agent-friendly view.
export type CanvasShape = {
  id: string
  type: string
  x: number
  y: number
  w?: number
  h?: number
  text?: string
  // Image/asset src: an `asset:` file reference or an https URL, passed through
  // as-is. A legacy inline base64 blob is omitted (see omitBase64) — the agent
  // calls `quint canvas read-image`/`view` to actually see pixels.
  src?: string
  // True when the shape references an asset that can't be resolved to pixels: an
  // `asset:` file gone from .quint/.canvas (sidecar dir lost or pruned), or the
  // asset record absent entirely — `read-image` will error and the canvas shows a
  // broken image. Absent otherwise.
  missing?: true
}

// The snapshot is a hidden dotfile (like `.quint/.workspace.json`): it's quint-internal
// state, and the agent must read it only through `quint canvas read`, never by
// opening the file.
export function getCanvasPath(workspacePath: string): string {
  return join(workspacePath, '.quint', '.canvas.json')
}

// The writer stamp is trusted only off disk — we wrote it (saveCanvasDoc
// stamps every save); a client PUT body never carries one through.
function parseWriter(value: unknown): CanvasWriter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const w = value as { quint?: unknown; tldraw?: unknown }
  if (typeof w.quint !== 'string' || typeof w.tldraw !== 'string') return undefined
  return { quint: w.quint, tldraw: w.tldraw }
}

export async function loadCanvasDoc(workspacePath: string): Promise<CanvasSnapshot> {
  try {
    const text = await Bun.file(getCanvasPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.document) {
      return { document: parsed.document as CanvasDoc, writer: parseWriter(parsed.writer) }
    }
  } catch {}
  return { document: null }
}

export async function saveCanvasDoc(document: CanvasDoc, workspacePath: string): Promise<void> {
  const path = getCanvasPath(workspacePath)
  // The browser uploads image bytes separately and stores only asset references
  // in the document. Sweep files the saved document no longer references.
  await backupOnSchemaChange(path, document)
  await Bun.write(path, JSON.stringify({ document, writer: CANVAS_WRITER }, null, 2))
  // The `.bak` path keeps the sweep from orphaning the schema-change backup's
  // images — a restored .bak should still render.
  await sweepOrphanAssets(workspacePath, document, `${path}.bak`)
}

// The save-time sweep only STARTS an orphan's grace clock — deletion needs a
// later sweep after the window elapses, and on a quiet canvas (delete an
// image, walk away) no later save comes. Rather than scheduling per-workspace
// follow-ups, one dumb periodic pass re-sweeps every registered workspace:
// it also catches uploads whose tab died before the autosave and leftovers
// from before a restart (the grace clock is in-memory). Workspaces without
// asset files cost one readdir per tick.
export async function sweepAllWorkspaces(): Promise<void> {
  // Lazy: the registry pulls in the harness adapters, which this module's
  // other consumers (CLI reads, tests) shouldn't load just to parse a snapshot.
  const { listWorkspaces } = await import('../workspaces/registry')
  for (const ws of await listWorkspaces()) {
    try {
      const dir = getCanvasAssetsDir(ws.path)
      if ((await readdir(dir).catch(() => [])).length === 0) continue
      const { document } = await loadCanvasDoc(ws.path)
      await sweepOrphanAssets(ws.path, document ?? {}, `${getCanvasPath(ws.path)}.bak`)
    } catch {}
  }
}

export function startCanvasSweeper(): void {
  const timer = setInterval(sweepAllWorkspaces, SWEEP_GRACE_MS + 60_000)
  // A background sweeper must never hold the process open.
  timer.unref?.()
}

// When a save is about to overwrite a snapshot with a *different* schema (i.e.
// the first write after a tldraw upgrade), keep the old file as `.bak` — the
// manual escape hatch after a downgrade, since the new file won't open in the
// older tldraw. One .bak, replaced on each schema change. Best-effort: a backup
// failure must never block the save.
async function backupOnSchemaChange(path: string, document: CanvasDoc): Promise<void> {
  try {
    const existing = JSON.parse(await Bun.file(path).text()) as { document?: CanvasDoc }
    const oldSchema = existing?.document?.schema
    if (!oldSchema || JSON.stringify(oldSchema) === JSON.stringify(document.schema)) return
    await Bun.write(`${path}.bak`, Bun.file(path))
  } catch {}
}

// Asset records reference image bytes as `asset:` files (see
// assets.ts). Inline data URLs are omitted because those blobs are huge and
// useless for reasoning about structure, so we replace each one with a short
// marker — the agent calls `quint canvas read-image`/`view` when it actually
// needs the pixels. Every other src (`asset:`, https) passes through untouched.
const BASE64_DATA_URL_RE = /data:[\w.+-]*\/?[\w.+-]*;base64,[A-Za-z0-9+/=]+/g
function omitBase64(text: string): string {
  return text.replace(BASE64_DATA_URL_RE, 'base64:omitted')
}

// Pull readable text out of a shape's props. tldraw stores labels as `richText`
// (a ProseMirror-style doc) on most shapes; older/simple shapes may use a flat
// `text` string. Best-effort — never throw on an unexpected shape.
function extractText(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const p = props as { text?: unknown; richText?: unknown }
  if (typeof p.text === 'string' && p.text.length > 0) return p.text
  if (p.richText) {
    const out: string[] = []
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const n = node as { type?: string; text?: unknown; content?: unknown }
      if (n.type === 'text' && typeof n.text === 'string') out.push(n.text)
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(p.richText)
    const joined = out.join('').trim()
    if (joined.length > 0) return joined
  }
  return undefined
}

// Resolve a single image shape's source by id, straight off the disk snapshot —
// no browser. The shape references an `asset` record by `props.assetId`; that
// asset's `src` is an `asset:` file reference (read back off disk and returned
// as a `data:` URL so the CLI's decoding keeps working), an `https:` URL
// (returned as-is).
// `quint canvas read` never carries the pixels, so this is how the agent pulls
// them for one image. Ids match with or without the `shape:` prefix (read
// surfaces them stripped).
export async function readCanvasImage(
  workspacePath: string,
  id: string
): Promise<{ src: string } | { error: string }> {
  const { document } = await loadCanvasDoc(workspacePath)
  const store = document?.store
  if (!store || typeof store !== 'object') return { error: `No shape named "${id}"` }

  const target = id.replace(/^shape:/, '')
  let assetId: string | undefined
  let found = false
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as { typeName?: string; id?: string; props?: { assetId?: unknown } }
    if (r.typeName !== 'shape' || (r.id ?? '').replace(/^shape:/, '') !== target) continue
    found = true
    if (typeof r.props?.assetId === 'string') assetId = r.props.assetId
    break
  }
  if (!found) return { error: `No shape named "${id}"` }
  if (!assetId) return { error: `Shape "${id}" is not an image` }

  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const a = record as { typeName?: string; id?: string; props?: { src?: unknown } }
    if (a.typeName === 'asset' && a.id === assetId && typeof a.props?.src === 'string') {
      const fileName = assetSrcFileName(a.props.src)
      if (!fileName) {
        if (a.props.src.startsWith('data:'))
          return { error: `Image "${id}" uses an unsupported inline data URL` }
        return { src: a.props.src }
      }
      const resolved = canvasAssetFile(workspacePath, fileName)
      if (!resolved || !(await resolved.file.exists())) {
        return { error: `Image "${id}" file is missing from .quint/.canvas` }
      }
      const bytes = Buffer.from(await resolved.file.arrayBuffer())
      return { src: `data:${resolved.mimeType};base64,${bytes.toString('base64')}` }
    }
  }
  return { error: `Image "${id}" has no stored data` }
}

// no browser needed. Ids are reported without tldraw's `shape:` prefix so they
// round-trip with `createShapeId(name)` on the draw side.
export async function readCanvasShapes(workspacePath: string): Promise<CanvasShape[]> {
  const { document } = await loadCanvasDoc(workspacePath)
  const store = document?.store
  if (!store || typeof store !== 'object') return []

  // Images live as `asset` records (typeName 'asset'); a shape references one by
  // `props.assetId`. Index asset src first so we can surface it on the shape —
  // with base64 blobs omitted — without dumping the asset record itself. A
  // file-backed src whose file is gone is flagged so the agent learns it's
  // dangling from `read` instead of from a failing `read-image` later.
  const assetSrc = new Map<string, string>()
  const assetGone = new Set<string>()
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const a = record as { typeName?: string; id?: string; props?: { src?: unknown } }
    if (a.typeName !== 'asset' || typeof a.id !== 'string') continue
    if (typeof a.props?.src === 'string') {
      assetSrc.set(a.id, a.props.src)
      const fileName = assetSrcFileName(a.props.src)
      if (fileName) {
        const resolved = canvasAssetFile(workspacePath, fileName)
        if (!resolved || !(await resolved.file.exists())) assetGone.add(a.id)
      }
    }
  }

  const shapes: CanvasShape[] = []
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as {
      typeName?: string
      id?: string
      type?: string
      x?: number
      y?: number
      props?: { w?: unknown; h?: unknown; assetId?: unknown }
    }
    if (r.typeName !== 'shape') continue
    const w = typeof r.props?.w === 'number' ? r.props.w : undefined
    const h = typeof r.props?.h === 'number' ? r.props.h : undefined
    const assetId = typeof r.props?.assetId === 'string' ? r.props.assetId : undefined
    const rawSrc = assetId !== undefined ? assetSrc.get(assetId) : undefined
    // Flag `missing` when a shape references an asset we can't resolve to pixels:
    // its backing file is gone (assetGone), or the asset record is absent / has a
    // non-string src (rawSrc undefined). Either way `read-image` can't return
    // bytes, so warn from `read` rather than let it fail later.
    const missing = assetId !== undefined && (assetGone.has(assetId) || rawSrc === undefined)
    shapes.push({
      id: (r.id ?? '').replace(/^shape:/, ''),
      type: r.type ?? 'unknown',
      x: typeof r.x === 'number' ? r.x : 0,
      y: typeof r.y === 'number' ? r.y : 0,
      ...(w !== undefined ? { w } : {}),
      ...(h !== undefined ? { h } : {}),
      ...(() => {
        const text = extractText(r.props)
        return text !== undefined ? { text: omitBase64(text) } : {}
      })(),
      ...(rawSrc !== undefined ? { src: omitBase64(rawSrc) } : {}),
      ...(missing ? { missing: true as const } : {})
    })
  }
  return shapes
}
