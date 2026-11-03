import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import { buildApplets, scanSources } from '../applet-engine'
import { scanRelativeImports } from '../applet-engine/dependencies'
import { buildApplet } from '../applet-engine/build-applet'

// Entry-point and staleness rules for the applet build loop: `_`-prefixed
// files are shared modules (never entries), and a bundle goes stale when
// anything in its local import graph changes — not just the entry source.
// The dependency tests run real Bun.build compiles against a temp workspace.

const FIXTURES = join(import.meta.dir, '__fixtures__')

// Same first-Bun.build-under-`bun test` quirk as build-applet.test.ts — swallow
// one throwaway build so every real test starts from the working state.
beforeAll(async () => {
  await buildApplet(join(FIXTURES, 'hello.tsx')).catch(() => {})
})

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'quint-stale-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

function seed(rel: string, contents: string): string {
  const path = join(WS, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  return path
}

async function build() {
  const { results } = await buildApplets(WS, 'widget', false)
  return results
}

describe('underscore-prefixed shared modules', () => {
  test('scanSources skips _-prefixed files', async () => {
    seed('.quint/widgets/clock.tsx', 'export default function Clock() { return null }')
    seed('.quint/widgets/_utils.ts', 'export const x = 1')
    seed('.quint/widgets/_shared.tsx', 'export const y = 2')
    seed('.quint/widgets/clock.server.ts', 'export async function f() {}')
    expect(await scanSources(join(WS, '.quint', 'widgets'))).toEqual(['clock'])
  })

  test('a previously built _-named applet is pruned, not rebuilt', async () => {
    // Before the underscore convention, `_shared.tsx` would have compiled as
    // its own widget. Now it's a shared module: it is not an entry, and its
    // leftover build dir is swept as an orphan.
    seed('.quint/widgets/_shared.tsx', 'export default function S() { return null }')
    const orphan = join(WS, '.quint', '.build', 'widgets', '_shared')
    mkdirSync(orphan, { recursive: true })
    writeFileSync(join(orphan, 'index.js'), '//')

    const { names, results } = await buildApplets(WS, 'widget', false)
    expect(names).toEqual([])
    expect(results).toEqual([])
    expect(existsSync(orphan)).toBe(false)
  })
})

describe('scanRelativeImports', () => {
  test('catches static, re-export, side-effect, and dynamic relative imports', () => {
    const src = [
      `import { a } from './_utils'`,
      `export * from '../lib/shared'`,
      `export { b } from './re-export'`,
      `import './side-effect'`,
      `const lazy = await import('./panels/heavy')`
    ].join('\n')
    expect(scanRelativeImports(src)).toEqual([
      './_utils',
      '../lib/shared',
      './re-export',
      './side-effect',
      './panels/heavy'
    ])
  })

  test('reports every kind of relative import, skipping only bare specifiers', () => {
    // Assets, `.server` stubs, and JSON are dependencies like any other — the
    // staleness walk resolves each and treats non-modules as leaves, so they
    // need no scanner of their own.
    const src = [
      `import React from 'react'`,
      `import { getData } from './data.server'`,
      `import logo from './logo.png'`,
      `import rows from './rows.json'`,
      `import './styles.css'`,
      `import { helper } from './helper'`
    ].join('\n')
    expect(scanRelativeImports(src)).toEqual([
      './data.server',
      './logo.png',
      './rows.json',
      './styles.css',
      './helper'
    ])
  })

  test('lexes real syntax — comments, strings, and type-only imports never count', () => {
    const src = [
      `// import { ghost } from './commented-out'`,
      `const s = "import { x } from './in-a-string'"`,
      `import type { T } from './types-only'`,
      `import { real } from './real'`
    ].join('\n')
    expect(scanRelativeImports(src)).toEqual(['./real'])
  })

  test('a file that fails to lex reports unknown imports', () => {
    expect(scanRelativeImports(`import { from`)).toBeNull()
  })

  test('the ts loader handles angle-bracket casts tsx cannot', () => {
    const src = [`const v = <string>window.name`, `import { q } from './cast-file'`].join('\n')
    expect(scanRelativeImports(src, 'ts')).toEqual(['./cast-file'])
  })
})

describe('dependency staleness', () => {
  const WIDGET = [
    `import { label } from './_utils'`,
    `export default function Clock() { return <div>{label}</div> }`
  ].join('\n')
  const UTILS = [`import { deep } from '../lib/deep'`, `export const label = 'clock ' + deep`].join(
    '\n'
  )
  const DEEP = `export const deep = 'deep-value'`

  function seedGraph() {
    seed('.quint/widgets/clock.tsx', WIDGET)
    seed('.quint/widgets/_utils.ts', UTILS)
    seed('.quint/lib/deep.ts', DEEP)
  }

  test('editing a shared sibling module marks the applet stale', async () => {
    seedGraph()

    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'built' })
    // The shared module's code really lands in the bundle.
    const entry = join(WS, '.quint', '.build', 'widgets', 'clock', 'index.js')
    expect(await Bun.file(entry).text()).toContain('deep-value')
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    seed('.quint/widgets/_utils.ts', UTILS + '\n// edited')
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })
  })

  test('editing a transitive dependency outside the source dir marks the applet stale', async () => {
    seedGraph()

    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // `deep.ts` is only reachable through `_utils.ts`, and lives in `.quint/lib/`
    // rather than the widgets dir — the walk must still find it.
    seed('.quint/lib/deep.ts', DEEP + '\n// edited')
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })
  })

  test('a dependency deleted since the last build marks the applet stale', async () => {
    seedGraph()

    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // `clock.tsx` itself is untouched and still older than the built entry, so
    // the only signal that `./_utils` is gone is the unresolved import. Skipping
    // here would keep serving the last good bundle and hide the broken import.
    rmSync(join(WS, '.quint', 'widgets', '_utils.ts'))
    expect((await build())[0]).toMatchObject({ name: 'clock', status: 'failed' })
  })

  test('extensionless, directory, and non-TS dependencies resolve the way Bun resolves them', async () => {
    // Every import here misses a naive `.tsx`/`.ts`/`index.tsx` candidate list:
    // it takes Bun's own resolver to land on the file the build reads.
    seed(
      '.quint/widgets/chart.tsx',
      [
        `import data from './_data'`, // → _data.json
        `import { helper } from '../lib/helpers'`, // → helpers/index.js
        `import { scale } from '../lib/scale'`, // → scale.mjs → ratio.mjs
        `import { fmt } from './_fmt.js'`, // → _fmt.ts (TS .js rewrite)
        `import { tint } from '../lib/paint'`, // → paint/main.js via package.json
        `export default function Chart() { return <div>{fmt(data.n * scale + helper) + tint}</div> }`
      ].join('\n')
    )
    seed('.quint/widgets/_data.json', '{ "n": 2 }')
    seed('.quint/widgets/_fmt.ts', `export const fmt = (n: number) => String(n)`)
    seed('.quint/lib/helpers/index.js', `export const helper = 3`)
    // A non-TS module is walked like any other, so its own imports count too.
    seed(
      '.quint/lib/scale.mjs',
      [`import { ratio } from './ratio.mjs'`, `export const scale = ratio`].join('\n')
    )
    seed('.quint/lib/ratio.mjs', `export const ratio = 4`)
    seed('.quint/lib/paint/package.json', `{ "main": "main.js" }`)
    seed('.quint/lib/paint/main.js', `export const tint = 'red'`)

    expect((await build())[0]).toMatchObject({ name: 'chart', status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // Each one, edited on its own, must mark the applet stale.
    for (const [rel, contents] of [
      ['.quint/widgets/_data.json', '{ "n": 5 }'],
      ['.quint/lib/helpers/index.js', `export const helper = 6`],
      ['.quint/lib/ratio.mjs', `export const ratio = 7`],
      ['.quint/lib/paint/main.js', `export const tint = 'blue'`],
      ['.quint/widgets/_fmt.ts', `export const fmt = (n: number) => \`\${n}\``]
    ] as const) {
      seed(rel, contents)
      expect((await build())[0]).toMatchObject({ status: 'built' })
      expect((await build())[0]).toMatchObject({ status: 'skipped' })
    }
  })

  test('imported assets and .server modules ride the same walk', async () => {
    // Neither has a scanner of its own any more: both are just relative
    // imports that resolve to a file like everything else.
    seed(
      '.quint/widgets/photo.tsx',
      [
        `import logo from './logo.png'`,
        `import { rows } from './data.server'`,
        `export default function Photo() { return <img src={logo} alt={String(rows)} /> }`
      ].join('\n')
    )
    seed('.quint/widgets/logo.png', 'not-really-a-png-but-bytes-are-bytes')
    seed(
      '.quint/widgets/data.server.ts',
      [`import { table } from './_schema'`, `export async function rows() { return [table] }`].join(
        '\n'
      )
    )
    seed('.quint/widgets/_schema.ts', `export const table = 'rows'`)

    expect((await build())[0]).toMatchObject({ name: 'photo', status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    seed('.quint/widgets/logo.png', 'different-bytes')
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // The server module's own mtime counts — its export list is inlined.
    seed(
      '.quint/widgets/data.server.ts',
      [
        `import { table } from './_schema'`,
        `export async function rows() { return [table, 1] }`
      ].join('\n')
    )
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })

    // And so does what the server module imports — even though none of it
    // reaches the bundle. 'built' is the signal that recycles the functions
    // worker (see needsRebuild), and without it a live worker would keep
    // serving the old `_schema.ts` with nothing to dislodge it. The rebuilt
    // bytes are identical; the reload is the point.
    seed('.quint/widgets/_schema.ts', `export const table = 'renamed'`)
    expect((await build())[0]).toMatchObject({ status: 'built' })
    expect((await build())[0]).toMatchObject({ status: 'skipped' })
  })

  test('a graph larger than the file cap always rebuilds (fails toward stale)', async () => {
    // A chain longer than MAX_GRAPH_FILES: the walk aborts and reports stale,
    // so the applet rebuilds every bundle instead of risking a stale skip.
    // Degenerate by design — no sane applet wires this many local files.
    seed(
      '.quint/widgets/big.tsx',
      [
        `import { label } from './_head'`,
        `export default function Big() { return <div>{label}</div> }`
      ].join('\n')
    )
    seed('.quint/widgets/_head.ts', [`import '../lib/c0'`, `export const label = 'big'`].join('\n'))
    const LAST = 260
    for (let i = 0; i <= LAST; i++) {
      const next = i < LAST ? `import './c${i + 1}'\n` : ''
      seed(`.quint/lib/c${i}.ts`, `${next}export const v${i} = ${i}`)
    }

    expect((await build())[0]).toMatchObject({ name: 'big', status: 'built' })
    // Would be 'skipped' under the cap — the oversized graph forces a rebuild.
    expect((await build())[0]).toMatchObject({ status: 'built' })
  })
})
