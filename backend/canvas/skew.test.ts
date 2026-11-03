import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'path'

import type { CanvasWriter } from '@/shared/types'

import { executeCanvasOp } from './executor'
import {
  CANVAS_WRITER,
  getCanvasPath,
  loadCanvasDoc,
  readCanvasShapes
} from './document'

// Version-skew behavior: `.quint/.canvas.json` embeds the writer's tldraw
// schema and tldraw has no down-migrations, so a snapshot written by a newer
// tldraw must fail HERE with an actionable message (not tldraw's bare
// `migration-error`), while the raw-JSON read path keeps working. See
// docs/quint-canvas.md § Version skew.

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'canvas-skew-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

const run = (op: Parameters<typeof executeCanvasOp>[2]) => executeCanvasOp(WS, 'ws-test', op)

type FileShape = {
  document: { schema: { sequences: Record<string, number> }; store: Record<string, unknown> }
  writer?: CanvasWriter
}

async function readFile(): Promise<FileShape> {
  return JSON.parse(await Bun.file(getCanvasPath(WS)).text())
}

// A real current-schema snapshot with one sequence bumped past this runtime —
// exactly what a newer tldraw leaves behind.
async function writeSkewedFixture(writer?: CanvasWriter): Promise<string> {
  await run({ kind: 'add-note', name: 'n1', x: 0, y: 0, text: 'hello' })
  const file = await readFile()
  file.document.schema.sequences['com.tldraw.shape.note'] += 1
  if (writer) file.writer = writer
  else delete file.writer
  const text = JSON.stringify(file, null, 2)
  await Bun.write(getCanvasPath(WS), text)
  return text
}

describe('canvas version skew', () => {
  test('saves are stamped with the writing quint + tldraw, and load surfaces it', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    expect((await readFile()).writer).toEqual(CANVAS_WRITER)
    expect(CANVAS_WRITER.tldraw).toMatch(/^\d+\.\d+\.\d+/)
    expect((await loadCanvasDoc(WS)).writer).toEqual(CANVAS_WRITER)
  })

  test('an unstamped legacy file still loads (writer just absent)', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const file = await readFile()
    delete file.writer
    await Bun.write(getCanvasPath(WS), JSON.stringify(file))
    expect((await loadCanvasDoc(WS)).writer).toBeUndefined()
    await run({ kind: 'add-rect', name: 'box2', x: 20, y: 0, w: 10, h: 10 })
    expect(await readCanvasShapes(WS)).toHaveLength(2)
  })

  test('a newer-schema snapshot fails with the actionable message, naming the stamp', async () => {
    const before = await writeSkewedFixture({ quint: '9.9.9', tldraw: '99.0.0' })
    // tldraw prints its own `Error migrating store` on a failed migration. That
    // must not reach the caller: it lands before our message and reads like
    // corruption. Muted here too, so a regression fails instead of printing.
    const logged = spyOn(console, 'error').mockImplementation(() => {})

    const err = await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 }).then(
      () => null,
      (e: Error) => e
    )
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
    expect(err?.message).toContain('written by a newer Quint')
    expect(err?.message).toContain('Quint 9.9.9, tldraw 99.0.0')
    expect(err?.message).toContain(`this server has tldraw ${CANVAS_WRITER.tldraw}`)
    expect(err?.message).toContain('quint update')
    expect(err?.message).toContain('intact')
    expect(err?.message).not.toContain('migration-error')

    // The failed op must not have touched the file.
    expect(await Bun.file(getCanvasPath(WS)).text()).toBe(before)
  })

  test('an unstamped newer-schema snapshot names the sequences that are ahead', async () => {
    await writeSkewedFixture()
    const err = await run({ kind: 'clear' }).then(
      () => null,
      (e: Error) => e
    )
    expect(err?.message).toContain('written by a newer Quint')
    expect(err?.message).toContain('com.tldraw.shape.note')
  })

  test('quint canvas read still works under skew (raw JSON, no migration)', async () => {
    await writeSkewedFixture({ quint: '9.9.9', tldraw: '99.0.0' })
    const shapes = await readCanvasShapes(WS)
    expect(shapes).toEqual([expect.objectContaining({ id: 'n1', type: 'note', text: 'hello' })])
  })

  test('a corrupt (non-skew) snapshot fails differently, keeping the cause', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const file = await readFile()
    // Same schema, mangled record — genuine corruption, not version skew.
    file.document.store['shape:box'] = { typeName: 'shape', id: 'shape:box', type: 'geo' }
    await Bun.write(getCanvasPath(WS), JSON.stringify(file))
    const err = await run({ kind: 'clear' }).then(
      () => null,
      (e: Error) => e
    )
    expect(err?.message).toContain('not a version mismatch')
    expect(err?.message).not.toContain('written by a newer Quint')
  })

  test('the first save after a schema change backs up the old file as .bak', async () => {
    await run({ kind: 'add-rect', name: 'box', x: 0, y: 0, w: 10, h: 10 })
    const path = getCanvasPath(WS)

    // Same-schema saves: no backup. (Fresh Bun.file handles each time — a
    // handle that has observed a missing file keeps reporting it empty.)
    await run({ kind: 'add-rect', name: 'box2', x: 20, y: 0, w: 10, h: 10 })
    expect(await Bun.file(`${path}.bak`).exists()).toBe(false)

    // Simulate the on-disk file predating a schema bump, then save over it.
    const file = await readFile()
    const oldText = JSON.stringify({
      ...file,
      document: {
        ...file.document,
        schema: {
          ...file.document.schema,
          sequences: { ...file.document.schema.sequences, 'com.tldraw.shape.note': 0 }
        }
      }
    })
    await Bun.write(path, oldText)
    await run({ kind: 'add-rect', name: 'box3', x: 40, y: 0, w: 10, h: 10 })
    expect(await Bun.file(`${path}.bak`).text()).toBe(oldText)
  })
})
