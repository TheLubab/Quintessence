import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import type { CompiledQuintlet } from '@/shared/types'

import {
  buildAllQuintlets,
  collectQuintletRequiredEnv,
  hasQuintletId,
  listQuintlets,
  reconcileOrder,
  serveQuintlet
} from '../applet-engine/quintlets'
import { silenceConsole } from './quiet'

// These tests exercise the quintlet orchestration logic WITHOUT invoking Bun.build:
// they seed `.quint/.build/quintlets/` with stub `.js` files + a manifest and call the
// read paths. The actual compile path (kind='quintlet') is covered in
// build-applet.test.ts, and end-to-end via `quint bundle`.

// `buildAllQuintlets` prints its per-run bundle summary.
silenceConsole('log')

let WS: string

function buildDir(): string {
  return join(WS, '.quint', '.build', 'quintlets')
}

// Seed built bundles (stub dirs each holding an index.js) + a manifest for the
// orchestration read paths. Mirrors the real layout: `.build/quintlets/<name>/index.js`.
function seed(jsNames: string[], manifest: object) {
  const dir = buildDir()
  mkdirSync(dir, { recursive: true })
  for (const name of jsNames) {
    mkdirSync(join(dir, name), { recursive: true })
    writeFileSync(join(dir, name, 'index.js'), `// ${name}`)
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
}

async function quintlets(): Promise<CompiledQuintlet[]> {
  const res = await listQuintlets(WS)
  return (await res.json()).quintlets
}

beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'quint-vtest-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

describe('reconcileOrder', () => {
  test('appends newly-seen names in scan order', () => {
    expect(reconcileOrder([], ['a', 'b'])).toEqual(['a', 'b'])
    expect(reconcileOrder(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  test('keeps existing order and drops deleted names', () => {
    // `b` deleted; `a` and `c` keep their original relative order.
    expect(reconcileOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c'])
  })

  test('a pre-existing name keeps its slot ahead of a new one', () => {
    // `a` already had a slot; `b` is new and appends after it, regardless of
    // the (arbitrary) scan order it arrives in.
    expect(reconcileOrder(['a'], ['b', 'a'])).toEqual(['a', 'b'])
  })
})

describe('listQuintlets', () => {
  test('returns quintlets in manifest order, title falling back to the id', async () => {
    seed(['crm', 'tasks'], {
      config: { crm: { title: 'CRM' }, tasks: {} },
      order: ['tasks', 'crm']
    })
    expect(await quintlets()).toEqual([
      { id: 'tasks', status: 'compiled', revision: expect.any(String), title: 'tasks' },
      { id: 'crm', status: 'compiled', revision: expect.any(String), title: 'CRM' }
    ])
  })

  test('updates the bundle revision when the built entry changes', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    const before = (await quintlets())[0].revision
    writeFileSync(join(buildDir(), 'crm', 'index.js'), '// crm changed and longer')
    expect((await quintlets())[0].revision).not.toBe(before)
  })

  test('passes through requiredEnv', async () => {
    seed(['crm'], { config: { crm: { title: 'CRM', requiredEnv: ['K'] } }, order: ['crm'] })
    expect((await quintlets())[0]).toMatchObject({ title: 'CRM', requiredEnv: ['K'] })
  })

  test('passes through the app icon id', async () => {
    seed(['crm'], { config: { crm: { title: 'CRM', icon: 'briefcase' } }, order: ['crm'] })
    expect((await quintlets())[0]).toMatchObject({ title: 'CRM', icon: 'briefcase' })
  })

  test('appends a built quintlet missing from order', async () => {
    seed(['a', 'b'], { config: {}, order: ['b'] })
    expect((await quintlets()).map(v => v.id)).toEqual(['b', 'a'])
  })

  test('excludes an ordered quintlet that is not built', async () => {
    seed(['a'], { config: {}, order: ['a', 'ghost'] })
    expect((await quintlets()).map(v => v.id)).toEqual(['a'])
  })

  test('empty when nothing is built', async () => {
    expect(await quintlets()).toEqual([])
  })
})

describe('hasQuintletId', () => {
  test('finds source and built quintlet ids', async () => {
    const sourceDir = join(WS, '.quint', 'quintlets')
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(join(sourceDir, 'source-quintlet.tsx'), 'export default function Quintlet() {}')
    seed(['built-quintlet'], { config: {}, order: ['built-quintlet'] })

    expect(await hasQuintletId(WS, 'source-quintlet')).toBe(true)
    expect(await hasQuintletId(WS, 'built-quintlet')).toBe(true)
    expect(await hasQuintletId(WS, 'available-quintlet')).toBe(false)
  })
})

describe('collectQuintletRequiredEnv', () => {
  test('maps each env key to the quintlet ids that asked for it', async () => {
    seed(['crm', 'x'], {
      config: { crm: { requiredEnv: ['K1', 'K2'] }, x: { requiredEnv: ['K1'] } },
      order: ['crm', 'x']
    })
    expect(await collectQuintletRequiredEnv(WS)).toEqual({ K1: ['crm', 'x'], K2: ['crm'] })
  })

  test('empty object when there is no manifest', async () => {
    expect(await collectQuintletRequiredEnv(WS)).toEqual({})
  })
})

describe('serveQuintlet', () => {
  const BASE = '/api/workspaces/test'

  test('serves the entry as javascript', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    const res = await serveQuintlet('crm', 'index.js', WS, BASE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await res.text()).toBe('// crm')
  })

  test('404 for a quintlet that is not built', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    expect((await serveQuintlet('missing', 'index.js', WS, BASE)).status).toBe(404)
  })

  test('400 for an invalid name', async () => {
    expect((await serveQuintlet('../etc', 'index.js', WS, BASE)).status).toBe(400)
    expect((await serveQuintlet('a b', 'index.js', WS, BASE)).status).toBe(400)
  })

  test('400 for a file with traversal', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    expect((await serveQuintlet('crm', '../manifest.json', WS, BASE)).status).toBe(400)
  })
})

describe('buildAllQuintlets', () => {
  test('returns no results when there is no quintlets directory', async () => {
    expect(await buildAllQuintlets(WS)).toEqual([])
  })
})
