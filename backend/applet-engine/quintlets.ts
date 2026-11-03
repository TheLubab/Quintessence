import { existsSync } from 'node:fs'

import { quintletTabId } from '@/shared/workspace-tabs'
import type { CompiledQuintlet, QuintletConfig, QuintletInfo, WorkspaceEntry } from '@/shared/types'

import { syncAppletLogAfterBuild } from './log'
import {
  buildApplets,
  getAppletPaths,
  getAppletRevision,
  listBuilt,
  scanSources,
  serveApplet
} from './'
import { serializeWorkspaceBundle } from './bundle-queue'
import { reloadModules } from './functions'
import { loadLayout, saveLayout } from '../workspaces/layout'
import { completeQuintletBuild, listPendingQuintlets } from '../sessions/pending-quintlets'
import { archiveQuintletSessions } from '../sessions/archive'
import type { WorkspaceRef } from '../workspace-storage'
import { setQuintletSourceTitle } from './config'
import {
  deleteQuintletSourceFiles,
  readQuintletSource,
  QuintletSourceInUseError
} from './quintlet-source'

// The quintlet applet kind. Sources in `.quint/quintlets/`, compiled output + manifest in
// `.quint/.build/quintlets/`; the shared mechanics live in `applets/index.ts`. Manifest
// shape: `{ config: { <name>: QuintletConfig }, order: [<name>, …] }`. `order` is the nav
// tab order — first-seen (creation) order, persisted so it's stable across
// rebuilds (the filesystem can't recover creation order).
type QuintletManifest = {
  config: Record<string, QuintletConfig>
  order: string[]
}

export class QuintletMutationError extends Error {
  constructor(
    message: string,
    public status: 404 | 409 | 422
  ) {
    super(message)
    this.name = 'QuintletMutationError'
  }
}

async function readManifest(workspacePath: string): Promise<QuintletManifest> {
  const { manifestPath } = getAppletPaths(workspacePath, 'quintlet')
  try {
    const data = JSON.parse(await Bun.file(manifestPath).text())
    return { config: data.config ?? {}, order: Array.isArray(data.order) ? data.order : [] }
  } catch {
    return { config: {}, order: [] }
  }
}

async function writeManifest(workspacePath: string, manifest: QuintletManifest): Promise<void> {
  const { manifestPath } = getAppletPaths(workspacePath, 'quintlet')
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2))
}

// Keep existing order, drop deleted names, append newly-seen names in scan
// order — so a quintlet holds its tab position once it first appears. Exported for
// testing.
export function reconcileOrder(prevOrder: string[], names: string[]): string[] {
  const present = new Set(names)
  const kept = prevOrder.filter(n => present.has(n))
  const keptSet = new Set(kept)
  const appended = names.filter(n => !keptSet.has(n))
  return [...kept, ...appended]
}

export type QuintletBuildResult = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
  config?: QuintletConfig | null
}

export async function buildAllQuintlets(
  workspacePath: string,
  force = false,
  target?: string
): Promise<QuintletBuildResult[]> {
  const { names, results, ms } = await buildApplets<QuintletConfig>(
    workspacePath,
    'quintlet',
    force,
    target
  )

  const manifest = await readManifest(workspacePath)
  for (const r of results) {
    if (r.status === 'built') manifest.config[r.name] = r.config ?? {}
  }
  for (const key of Object.keys(manifest.config)) {
    if (!names.includes(key)) delete manifest.config[key]
  }
  manifest.order = reconcileOrder(manifest.order, names)
  // Persist only when there's a build dir to hold the manifest — see the note in
  // `widgets.ts`. Keeps an applet-less workspace a no-op on disk.
  const { buildDir } = getAppletPaths(workspacePath, 'quintlet')
  if (existsSync(buildDir)) await writeManifest(workspacePath, manifest)

  const builtCount = results.filter(r => r.status === 'built').length
  const failed = results.filter(r => r.status === 'failed')
  console.log(
    `[bundle] ${builtCount}/${names.length} quintlets built in ${ms}ms` +
      (failed.length ? `, ${failed.length} failed` : '') +
      (force ? ' (forced)' : '')
  )
  for (const r of failed) {
    console.error(`[bundle] ${r.name}:\n${r.error}`)
  }

  return results
}

function listBuiltQuintlets(workspacePath: string): Promise<string[]> {
  const { buildDir } = getAppletPaths(workspacePath, 'quintlet')
  return listBuilt(buildDir)
}

// Built quintlets in manifest order, with `title` resolved (falls back to the id).
export async function listCompiledQuintlets(workspacePath: string): Promise<CompiledQuintlet[]> {
  const [built, manifest] = await Promise.all([
    listBuiltQuintlets(workspacePath),
    readManifest(workspacePath)
  ])
  const builtSet = new Set(built)
  // Manifest order first (filtered to what's actually built), then any built
  // quintlet missing from order (shouldn't happen, but never drop a real bundle).
  const ordered = [
    ...manifest.order.filter(id => builtSet.has(id)),
    ...built.filter(id => !manifest.order.includes(id))
  ]
  return ordered.map(id => {
    const raw = manifest.config[id] ?? {}
    const icon = typeof raw.icon === 'string' && raw.icon ? raw.icon : undefined
    const requiredEnv = Array.isArray(raw.requiredEnv) ? raw.requiredEnv : undefined
    const revision = getAppletRevision(workspacePath, 'quintlet', id)
    return {
      id,
      status: 'compiled',
      ...(revision ? { revision } : {}),
      title: raw.title || id,
      ...(icon ? { icon } : {}),
      ...(requiredEnv ? { requiredEnv } : {})
    }
  })
}

export async function hasQuintletId(workspacePath: string, quintletId: string): Promise<boolean> {
  const { sourceDir } = getAppletPaths(workspacePath, 'quintlet')
  const [sources, built] = await Promise.all([
    scanSources(sourceDir),
    listBuiltQuintlets(workspacePath)
  ])
  return sources.includes(quintletId) || built.includes(quintletId)
}

// Env keys declared via quintlet `config.requiredEnv`, keyed to the quintlet ids that
// asked. Merged with the widget map in the env API's "required" quintlet.
export async function collectQuintletRequiredEnv(
  workspacePath: string
): Promise<Record<string, string[]>> {
  const { config } = await readManifest(workspacePath)
  const out: Record<string, string[]> = {}
  for (const [id, cfg] of Object.entries(config)) {
    if (!Array.isArray(cfg.requiredEnv)) continue
    for (const key of cfg.requiredEnv) {
      ;(out[key] ??= []).push(id)
    }
  }
  return out
}

export async function getWorkspaceQuintlets(ws: WorkspaceRef): Promise<QuintletInfo[]> {
  const compiled = await listCompiledQuintlets(ws.path)
  const ids = new Set(compiled.map(quintlet => quintlet.id))
  const pending = (await listPendingQuintlets(ws)).filter(quintlet => !ids.has(quintlet.id))
  return [...compiled, ...pending]
}

// The API lists compiled quintlets only; clients read pending quintlets from the
// workspace state, which `state:changed` keeps current.
export async function listQuintlets(workspacePath: string): Promise<Response> {
  return Response.json({ quintlets: await listCompiledQuintlets(workspacePath) })
}

export async function handleBundleQuintlets(
  publish: (msg: unknown) => void,
  workspaceId: string,
  workspacePath: string,
  force = false,
  target?: string
) {
  const before = await readManifest(workspacePath)
  const beforeBuilt = new Set(await listBuiltQuintlets(workspacePath))
  const results = await buildAllQuintlets(workspacePath, force, target)
  const after = await readManifest(workspacePath)
  const afterBuilt = new Set(await listBuiltQuintlets(workspacePath))

  // Keep the applet error journal honest: record build failures, clear entries
  // superseded by a successful rebuild (see docs/applet-runtime.md).
  syncAppletLogAfterBuild(workspacePath, 'quintlet', results)

  const identityChanged = results.some(
    r =>
      r.status === 'built' &&
      ((before.config[r.name]?.title ?? '') !== (r.config?.title ?? '') ||
        (before.config[r.name]?.icon ?? '') !== (r.config?.icon ?? ''))
  )
  const orderChanged = before.order.join('\0') !== after.order.join('\0')
  const membershipChanged =
    beforeBuilt.size !== afterBuilt.size ||
    [...beforeBuilt].some(n => !afterBuilt.has(n)) ||
    [...afterBuilt].some(n => !beforeBuilt.has(n))

  const changedServerModules = new Set<string>()
  for (const r of results) {
    if (r.status === 'built') {
      publish({ type: 'quintlet:updated', name: r.name, config: r.config ?? null })
      await completeQuintletBuild({ id: workspaceId, path: workspacePath }, r.name)
      for (const m of r.serverModules ?? []) changedServerModules.add(m)
    }
  }

  if (changedServerModules.size > 0) {
    reloadModules([...changedServerModules], workspacePath)
  }

  const quintlets = await listCompiledQuintlets(workspacePath)
  if (identityChanged || orderChanged || membershipChanged) {
    publish({ type: 'quintlet-layout:updated', quintlets })
  }

  return results
}

export async function updateQuintletTitle(
  publish: (msg: unknown) => void,
  workspaceId: string,
  workspacePath: string,
  quintletId: string,
  title: string
): Promise<CompiledQuintlet> {
  return serializeWorkspaceBundle(workspacePath, async () => {
    const current = (await listCompiledQuintlets(workspacePath)).find(
      quintlet => quintlet.id === quintletId
    )
    if (!current) throw new QuintletMutationError('Quintlet not found', 404)
    if (current.title === title) return current

    const source = await readQuintletSource(workspacePath, quintletId)
    if (!source) throw new QuintletMutationError('Quintlet source not found', 409)

    let updated: string
    try {
      updated = setQuintletSourceTitle(source.source, title)
    } catch (error) {
      throw new QuintletMutationError(
        error instanceof Error ? error.message : 'Could not update the quintlet title',
        409
      )
    }
    if (updated === source.source) return current

    await Bun.write(source.path, updated)
    try {
      // A rename changed this entry; rebuild only it and leave pending quintlets alone.
      const results = await handleBundleQuintlets(
        publish,
        workspaceId,
        workspacePath,
        true,
        quintletId
      )
      const result = results.find(candidate => candidate.name === quintletId)
      if (result?.status !== 'built') {
        throw new QuintletMutationError(
          result?.error ?? 'Could not rebuild the renamed quintlet',
          422
        )
      }

      const renamed = (await listCompiledQuintlets(workspacePath)).find(
        quintlet => quintlet.id === quintletId
      )
      if (!renamed) {
        throw new QuintletMutationError('Renamed quintlet was not found after rebuilding', 422)
      }
      return renamed
    } catch (error) {
      // An agent may have edited or removed the source while the build ran.
      if (
        (await Bun.file(source.path)
          .text()
          .catch(() => null)) === updated
      ) {
        await Bun.write(source.path, source.source)
      }
      throw error
    }
  })
}

export async function deleteQuintlet(
  publish: (msg: unknown) => void,
  ws: WorkspaceEntry,
  quintletId: string
): Promise<void> {
  const { id: workspaceId, path: workspacePath } = ws
  await serializeWorkspaceBundle(workspacePath, async () => {
    const current = (await listCompiledQuintlets(workspacePath)).some(
      quintlet => quintlet.id === quintletId
    )
    if (!current) throw new QuintletMutationError('Quintlet not found', 404)

    try {
      await deleteQuintletSourceFiles(workspacePath, quintletId, () =>
        archiveQuintletSessions(ws, quintletId)
      )
    } catch (error) {
      if (error instanceof QuintletSourceInUseError)
        throw new QuintletMutationError(error.message, 409)
      throw error
    }
    reloadModules([`quintlets/${quintletId}`], workspacePath)
    await completeQuintletBuild(ws, quintletId)
    const layout = await loadLayout(workspacePath)
    const tab = quintletTabId(quintletId)
    await saveLayout(
      {
        ...layout,
        tabs: {
          open: layout.tabs.open.filter(candidate => candidate !== tab),
          active: layout.tabs.active === tab ? 'dashboard' : layout.tabs.active
        }
      },
      workspacePath
    )

    publish({ type: 'quintlet:deleted', workspaceId, name: quintletId })
    publish({ type: 'workspace:updated' })
    await handleBundleQuintlets(publish, workspaceId, workspacePath, false, quintletId)
  })
}

export function serveQuintlet(
  name: string,
  file: string,
  workspacePath: string,
  apiBase: string,
  ifNoneMatch?: string | null
): Promise<Response> {
  return serveApplet('quintlet', name, file, workspacePath, apiBase, ifNoneMatch)
}
