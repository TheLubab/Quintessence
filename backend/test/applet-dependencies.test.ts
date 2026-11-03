import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { analyzeAppletDependencies, analyzeDependencies } from '../applet-engine/dependencies'
import { deleteQuintletSourceFiles } from '../applet-engine/quintlet-source'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'quint-dependencies-'))
})

afterEach(() => rm(workspace, { recursive: true, force: true }))

async function seed(path: string, source = 'export const value = 1'): Promise<string> {
  const absolute = join(workspace, '.quint', path)
  await Bun.write(absolute, source)
  return absolute
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(join(workspace, '.quint', path)).exists()
}

test('analyzes one module or all applets, including cycles, assets and companion server modules', async () => {
  const entry = await seed('quintlets/cards.tsx', "export * from '../shared/a'")
  const a = await seed('shared/a.ts', "export * from './b'; import './rows.json'")
  const b = await seed('shared/b.ts', "export * from './a'")
  const rows = await seed('shared/rows.json', '[]')
  const server = await seed('quintlets/cards.server.ts')
  const widget = await seed('widgets/clock.tsx', "export * from '../shared/a'")
  const orphan = await seed('quintlets/_orphan.ts')

  const single = await analyzeDependencies([entry])
  expect(single.complete).toBe(true)
  expect(new Set(single.modules.keys())).toEqual(new Set([entry, a, b, rows]))
  expect(single.modules.get(a)?.imports).toEqual([b, rows])

  const all = await analyzeAppletDependencies(workspace)
  expect(all.complete).toBe(true)
  expect(all.entrypoints).toEqual(new Set([entry, server, widget]))
  expect(all.modules.has(orphan)).toBe(false)
  expect(all.modules.size).toBe(6)
})

test('a changed entry stops the rebuild check before reading its dependencies', async () => {
  const entry = await seed('quintlets/cards.tsx', "export * from '../shared/a'")
  await seed('shared/a.ts')
  await utimes(entry, 10, 10)
  const graph = await analyzeDependencies([entry], 9_000)
  expect(graph.complete).toBe(false)
  expect(graph.modules.size).toBe(1)
})

test('deletes only the quintlet and its unused transitive code dependencies', async () => {
  await seed('quintlets/cards.tsx', "export * from './_utils'")
  await seed(
    'quintlets/_utils.ts',
    "export * from '../shared/fetch.server'; import '../data/rows.json'"
  )
  await seed('shared/fetch.server.ts', "export * from './db'")
  await seed('shared/db.ts')
  await seed('quintlets/cards.server.ts', "export * from './_server-utils'")
  await seed('quintlets/_server-utils.ts')
  await seed('quintlets/_unrelated.ts')
  await seed('data/rows.json', '[]')

  await deleteQuintletSourceFiles(workspace, 'cards')

  for (const path of [
    'quintlets/cards.tsx',
    'quintlets/_utils.ts',
    'shared/fetch.server.ts',
    'shared/db.ts',
    'quintlets/cards.server.ts',
    'quintlets/_server-utils.ts'
  ]) {
    expect(await exists(path)).toBe(false)
  }
  expect(await exists('quintlets/_unrelated.ts')).toBe(true)
  expect(await exists('data/rows.json')).toBe(true)
})

for (const kind of ['quintlets', 'widgets']) {
  test(`preserves server functions and their helpers shared with other ${kind}`, async () => {
    await seed('quintlets/cards.tsx', "export * from './_private'")
    await seed('quintlets/_private.ts', "export * from './cards.server'")
    await seed('quintlets/cards.server.ts', "export * from '../shared/utils'")
    await seed('shared/utils.ts')
    await seed(`${kind}/other.tsx`, "export * from '../shared/bridge'")
    await seed('shared/bridge.ts', "export * from '../quintlets/cards.server'")

    await deleteQuintletSourceFiles(workspace, 'cards')

    expect(await exists('quintlets/cards.tsx')).toBe(false)
    expect(await exists('quintlets/_private.ts')).toBe(false)
    expect(await exists('quintlets/cards.server.ts')).toBe(true)
    expect(await exists('shared/utils.ts')).toBe(true)
  })
}

test('preserves helpers used only by a remaining applet’s companion server module', async () => {
  await seed('quintlets/cards.tsx', "export * from './_utils'")
  await seed('quintlets/_utils.ts')
  await seed('quintlets/other.tsx')
  await seed('quintlets/other.server.ts', "export * from './_utils'")

  await deleteQuintletSourceFiles(workspace, 'cards')

  expect(await exists('quintlets/_utils.ts')).toBe(true)
})

for (const source of ["export * from './missing'", 'import { from']) {
  test(`leaves helpers behind when a remaining applet cannot be analyzed: ${source}`, async () => {
    await seed('quintlets/cards.tsx', "export * from './_utils'")
    await seed('quintlets/cards.server.ts')
    await seed('quintlets/_utils.ts')
    await seed('widgets/unfinished.tsx', source)

    expect((await analyzeAppletDependencies(workspace)).complete).toBe(false)
    await deleteQuintletSourceFiles(workspace, 'cards')

    expect(await exists('quintlets/cards.tsx')).toBe(false)
    expect(await exists('quintlets/cards.server.ts')).toBe(true)
    expect(await exists('quintlets/_utils.ts')).toBe(true)
  })
}

test('caps the scan and leaves helpers behind for oversized graphs', async () => {
  await seed('quintlets/cards.tsx', "export * from '../shared/helper0'")
  await Promise.all(
    Array.from({ length: 260 }, (_, i) =>
      seed(
        `shared/helper${i}.ts`,
        i < 259 ? `export * from './helper${i + 1}'` : 'export const value = 1'
      )
    )
  )

  const graph = await analyzeAppletDependencies(workspace)
  expect(graph.complete).toBe(false)
  await deleteQuintletSourceFiles(workspace, 'cards')

  expect(await exists('quintlets/cards.tsx')).toBe(false)
  expect(await exists('shared/helper0.ts')).toBe(true)
  expect(await exists('shared/helper259.ts')).toBe(true)
})

test('keeps installed UI components and code they import', async () => {
  await seed('quintlets/cards.tsx', "export * from '../ui/card'")
  await seed('ui/card.tsx', "export * from '../shared/style'")
  await seed('shared/style.ts')

  await deleteQuintletSourceFiles(workspace, 'cards')

  expect(await exists('ui/card.tsx')).toBe(true)
  expect(await exists('shared/style.ts')).toBe(true)
})

test('leaves helpers alone when a symlink obscures their ownership', async () => {
  await seed('quintlets/cards.tsx', "export * from './_utils'")
  const helper = await seed('quintlets/_utils.ts')
  await symlink(helper, join(workspace, '.quint', 'quintlets', '_alias.ts'))
  await seed('quintlets/other.tsx', "export * from './_alias'")

  await deleteQuintletSourceFiles(workspace, 'cards')

  expect(await exists('quintlets/cards.tsx')).toBe(false)
  expect(await exists('quintlets/_utils.ts')).toBe(true)
})
