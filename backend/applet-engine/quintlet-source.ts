import { realpath, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { analyzeAppletDependencies, collectDependencies, MODULE_FILE_RE } from './dependencies'

type QuintletSource = {
  path: string
  source: string
}

export async function readQuintletSource(
  workspacePath: string,
  quintletId: string
): Promise<QuintletSource | null> {
  const directory = join(workspacePath, '.quint', 'quintlets')
  for (const extension of ['.tsx', '.ts']) {
    const path = join(directory, `${quintletId}${extension}`)
    const file = Bun.file(path)
    if (await file.exists()) return { path, source: await file.text() }
  }
  return null
}

export class QuintletSourceInUseError extends Error {}

function isCleanupSource(quintRoot: string, path: string): boolean {
  if (!path.startsWith(quintRoot + sep) || !MODULE_FILE_RE.test(path)) return false
  // Keep data, installed UI components, packages, and generated/hidden files.
  return !relative(quintRoot, path)
    .split(sep)
    .some(part => part.startsWith('.') || ['data', 'ui', 'node_modules'].includes(part))
}

export async function deleteQuintletSourceFiles(
  workspacePath: string,
  quintletId: string,
  beforeDelete?: () => Promise<void>
): Promise<void> {
  const workspaceRoot = await realpath(workspacePath)
  const quintRoot = join(workspaceRoot, '.quint')
  const directory = join(quintRoot, 'quintlets')
  const sources = ['tsx', 'ts'].map(extension => join(directory, `${quintletId}.${extension}`))
  const roots = new Set([...sources, join(directory, `${quintletId}.server.ts`)])
  const remove = new Set(sources)
  const graph = await analyzeAppletDependencies(workspaceRoot).catch(() => null)

  if (graph?.complete) {
    // A symlink can give one module several identities. Leave helpers behind
    // in that case rather than guessing ownership or doing a more costly scan.
    const canonical = await Promise.all(
      [...graph.modules.keys()].map(async path => (await realpath(path).catch(() => null)) === path)
    )
    if (canonical.every(Boolean)) {
      const candidates = collectDependencies(graph, roots)
      const retained = collectDependencies(graph, [
        ...[...graph.entrypoints].filter(path => !roots.has(path)),
        ...[...candidates].filter(path => !isCleanupSource(quintRoot, path))
      ])
      if (sources.some(path => retained.has(path))) {
        throw new QuintletSourceInUseError(
          'Another applet imports this quintlet. Remove that import before deleting it.'
        )
      }
      for (const path of candidates) {
        if (!retained.has(path) && isCleanupSource(quintRoot, path)) remove.add(path)
      }
    }
  }

  // Validate shared imports before archiving chats, and archive before removing files.
  await beforeDelete?.()
  await Promise.all([...remove].map(path => rm(path, { force: true })))
}
