import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'path'

import { readCanvasImage, readCanvasShapes, saveCanvasDoc, sweepAllWorkspaces } from './document'
import type { CanvasDoc } from './document'
import {
  assetSrcFileName,
  getCanvasAssetsDir,
  canvasAssetFile,
  storeCanvasAsset,
  sweepOrphanAssets
} from './assets'

// The file-backed asset store keeps image bytes OUT of `.quint/.canvas.json`:
// content-addressed files under `.quint/.canvas/`, `asset:` srcs on the
// records, and an orphan sweep.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'canvas-assets-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
function imageDoc(src: string): CanvasDoc {
  return {
    store: {
      'asset:a1': {
        id: 'asset:a1',
        typeName: 'asset',
        type: 'image',
        props: { name: 'x.png', src, w: 4, h: 4 }
      },
      'shape:pic': {
        id: 'shape:pic',
        typeName: 'shape',
        type: 'image',
        x: 0,
        y: 0,
        props: { assetId: 'asset:a1', w: 4, h: 4 }
      }
    }
  }
}

describe('storeCanvasAsset', () => {
  test('content-addresses the file and dedupes identical bytes', async () => {
    const a = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    const b = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    expect(a.src).toBe(b.src)
    expect(a.src).toMatch(/^asset:asset-[0-9a-f]{64}\.png$/)
    expect(await readdir(getCanvasAssetsDir(WS))).toHaveLength(1)
  })

  test('unknown mime types fall back to a .bin file served as octet-stream', async () => {
    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'application/x-weird')
    expect(src).toEndWith('.bin')
    const resolved = canvasAssetFile(WS, assetSrcFileName(src) ?? '')
    expect(resolved?.mimeType).toBe('application/octet-stream')
  })
})

describe('assetSrcFileName / canvasAssetFile', () => {
  test('accepts only our own asset-<sha256>.ext names — no traversal, no other schemes', () => {
    const hash = 'a'.repeat(64)
    expect(assetSrcFileName(`asset:asset-${hash}.png`)).toBe(`asset-${hash}.png`)
    expect(assetSrcFileName('asset:../../etc/passwd')).toBeNull()
    expect(assetSrcFileName(`asset:asset-${hash}`)).toBeNull()
    expect(assetSrcFileName(`asset:${hash}.png`)).toBeNull()
    expect(assetSrcFileName('data:image/png;base64,AAAA')).toBeNull()
    expect(assetSrcFileName('https://example.com/x.png')).toBeNull()
    expect(canvasAssetFile(WS, '../secret')).toBeNull()
    expect(canvasAssetFile(WS, `${hash}.png`)).toBeNull()
    expect(canvasAssetFile(WS, `asset-${hash}.png`)).not.toBeNull()
  })
})

describe('missing asset files (dangling references)', () => {
  test('read flags the shape, read-image errors clearly, intact shapes unflagged', async () => {
    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    await saveCanvasDoc(imageDoc(src), WS)
    const dir = getCanvasAssetsDir(WS)

    // Intact: no `missing` flag on the shape.
    let pic = (await readCanvasShapes(WS)).find(s => s.id === 'pic')
    expect(pic?.src).toMatch(/^asset:asset-/)
    expect(pic?.missing).toBeUndefined()

    // Lose the sidecar file (e.g. snapshot copied without `.quint/.canvas/`).
    for (const name of await readdir(dir)) rmSync(join(dir, name))

    pic = (await readCanvasShapes(WS)).find(s => s.id === 'pic')
    expect(pic?.missing).toBe(true)
    expect(await readCanvasImage(WS, 'pic')).toEqual({
      error: expect.stringMatching(/missing/)
    })
  })
})

// An asset record plus a shape actually using it — the shape matters: the sweep
// treats an asset no shape uses as unreferenced (see the browser-deletion test).
function docWithImage(src: string): CanvasDoc {
  return {
    store: {
      'asset:a1': { id: 'asset:a1', typeName: 'asset', type: 'image', props: { src } },
      'shape:pic': {
        id: 'shape:pic',
        typeName: 'shape',
        type: 'image',
        x: 0,
        y: 0,
        props: { assetId: 'asset:a1', w: 4, h: 4 }
      }
    }
  }
}

describe('sweepOrphanAssets', () => {
  test('reclaims a file only after it has stayed unreferenced past the grace window', async () => {
    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    const referenced = assetSrcFileName(src)!
    const { src: orphanSrc } = await storeCanvasAsset(WS, new Uint8Array([1, 2, 3]), 'image/png')
    const orphan = assetSrcFileName(orphanSrc)!
    const dir = getCanvasAssetsDir(WS)
    const doc = docWithImage(src)

    const t0 = 1_000_000
    // First sweep only starts the orphan's clock; nothing is deleted yet.
    await sweepOrphanAssets(WS, doc, undefined, t0)
    expect(await readdir(dir)).toContain(orphan)

    // Still within the grace window — kept.
    await sweepOrphanAssets(WS, doc, undefined, t0 + 60_000)
    expect(await readdir(dir)).toContain(orphan)

    // Past the window, the still-unreferenced orphan is reclaimed; the referenced
    // file was never on the clock and survives.
    await sweepOrphanAssets(WS, doc, undefined, t0 + 6 * 60_000)
    const left = await readdir(dir)
    expect(left).toContain(referenced)
    expect(left).not.toContain(orphan)
  })

  test('a long-referenced file gets a fresh grace window when it becomes unreferenced', async () => {
    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    const name = assetSrcFileName(src)!
    const dir = getCanvasAssetsDir(WS)
    const withImg = docWithImage(src)
    const empty: CanvasDoc = { store: {} }

    const t0 = 5_000_000
    // Referenced across sweeps spanning an hour.
    await sweepOrphanAssets(WS, withImg, undefined, t0)
    await sweepOrphanAssets(WS, withImg, undefined, t0 + 60 * 60_000)

    // It becomes unreferenced (e.g. `clear`). Despite the file being an hour old,
    // the next sweep must NOT delete it — the clock starts here, not at write time.
    // This is the sweep-race data-loss regression the grace anchoring fixes.
    await sweepOrphanAssets(WS, empty, undefined, t0 + 60 * 60_000)
    expect(await readdir(dir)).toContain(name)

    // Only after the grace elapses from the un-reference moment is it reclaimed.
    await sweepOrphanAssets(WS, empty, undefined, t0 + 60 * 60_000 + 6 * 60_000)
    expect(await readdir(dir)).not.toContain(name)
  })

  test('keeps files the .bak backup still references', async () => {
    const { src: bakSrc } = await storeCanvasAsset(WS, new Uint8Array([7, 8, 9]), 'image/png')
    const bakKept = assetSrcFileName(bakSrc)!
    const { src: orphanSrc } = await storeCanvasAsset(WS, new Uint8Array([1, 2]), 'image/png')
    const orphan = assetSrcFileName(orphanSrc)!

    // A .bak referencing only bakKept — the downgrade escape hatch.
    const bakFile = join(WS, '.quint', '.canvas.json.bak')
    await Bun.write(
      bakFile,
      JSON.stringify({
        document: {
          store: { 'asset:old': { typeName: 'asset', type: 'image', props: { src: bakSrc } } }
        }
      })
    )

    const dir = getCanvasAssetsDir(WS)
    // Current document references neither file; run twice past the grace window.
    const t0 = 2_000_000
    await sweepOrphanAssets(WS, { store: {} }, bakFile, t0)
    await sweepOrphanAssets(WS, { store: {} }, bakFile, t0 + 6 * 60_000)

    const left = await readdir(dir)
    expect(left).toContain(bakKept) // pinned by the .bak, never on the clock
    expect(left).not.toContain(orphan)
  })

  test('is a no-op when the assets dir does not exist', async () => {
    await sweepOrphanAssets(WS, { store: {} })
  })

  test('an asset record no shape uses does not pin its file (browser image deletion)', async () => {
    // Deleting an image in the tldraw editor removes the SHAPE but leaves the
    // asset record in the document. Its file must still be reclaimable — this
    // was the original "orphaned assets are not deleted" repro.
    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    const name = assetSrcFileName(src)!
    const doc = docWithImage(src)
    const afterDelete: CanvasDoc = {
      // Shape removed, asset record left behind — what the browser autosaves.
      store: { 'asset:a1': (doc.store as Record<string, unknown>)['asset:a1'] }
    }
    const dir = getCanvasAssetsDir(WS)

    const t0 = 7_000_000
    // While the shape exists the file is referenced — never on the clock.
    await sweepOrphanAssets(WS, doc, undefined, t0)
    expect(await readdir(dir)).toContain(name)

    // Shape deleted in the browser: clock starts, grace applies (an undo that
    // restores the shape within the window would reset it)...
    await sweepOrphanAssets(WS, afterDelete, undefined, t0 + 1000)
    expect(await readdir(dir)).toContain(name)

    // ...and past the window the file is reclaimed despite the lingering record.
    await sweepOrphanAssets(WS, afterDelete, undefined, t0 + 7 * 60_000)
    expect(await readdir(dir)).not.toContain(name)
  })

  test('reclaims stale .tmp-* files left by a crashed write', async () => {
    await storeCanvasAsset(WS, PNG_BYTES, 'image/png') // ensures the dir exists
    const dir = getCanvasAssetsDir(WS)
    await Bun.write(join(dir, '.tmp-crashed'), 'partial bytes')
    const doc: CanvasDoc = { store: {} }

    // Too young to judge (could be a write in flight) — kept.
    await sweepOrphanAssets(WS, doc, undefined, Date.now())
    expect(await readdir(dir)).toContain('.tmp-crashed')

    // Older than the grace window — abandoned, reclaimed.
    await sweepOrphanAssets(WS, doc, undefined, Date.now() + 10 * 60_000)
    expect(await readdir(dir)).not.toContain('.tmp-crashed')
  })
})

describe('sweepAllWorkspaces', () => {
  test('the periodic pass reclaims expired orphans without any further save', async () => {
    const { setRegistryPath, registerWorkspace } = await import('../workspaces/registry')
    setRegistryPath(join(WS, 'workspaces.json'))
    await registerWorkspace(WS, { type: 'meta' })

    const { src } = await storeCanvasAsset(WS, PNG_BYTES, 'image/png')
    const kept = assetSrcFileName(src)!
    const { src: orphanSrc } = await storeCanvasAsset(WS, new Uint8Array([4, 5]), 'image/png')
    const orphan = assetSrcFileName(orphanSrc)!
    // The pass judges against the snapshot on disk — write it directly.
    await Bun.write(
      join(WS, '.quint', '.canvas.json'),
      JSON.stringify({ document: docWithImage(src) })
    )

    // Start the orphan's clock far in the past so the pass (running at the real
    // Date.now()) sees the grace window already elapsed.
    await sweepOrphanAssets(WS, docWithImage(src), undefined, 1_000_000)

    await sweepAllWorkspaces()

    const left = await readdir(getCanvasAssetsDir(WS))
    expect(left).toContain(kept)
    expect(left).not.toContain(orphan)
  })
})
