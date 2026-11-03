import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { DEFAULT_QUINTLETS_WIDGET, DEFAULT_SUGGESTIONS_WIDGET } from '@/shared/default-widgets'
import type { AppletKind, WorkspaceLayout } from '@/shared/types'

import {
  getLayoutPath,
  getWorkspacePreview,
  loadLayout,
  mergeLayoutForSave
} from '../workspaces/layout'
import { getThumbnailsDir } from '../applet-engine/thumbnails'

// The grid editor and `quint config` write the same `.workspace.json`. A layout
// PUT is authoritative for the editor fields but must NOT touch identity
// (name/icon) — otherwise the client's name-stripped body erases a configured
// name. mergeLayoutForSave enforces that.

const base: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  tabs: { open: ['dashboard', 'canvas'], active: 'dashboard' }
}

async function withWorkspaceFile<T>(
  body: Record<string, unknown>,
  fn: (dir: string) => Promise<T>
) {
  const dir = await mkdtemp(join(tmpdir(), 'quint-layout-'))
  try {
    const file = getLayoutPath(dir)
    await mkdir(dirname(file), { recursive: true })
    await Bun.write(file, JSON.stringify(body, null, 2))
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// Seed the `.quint/.cache/thumbnails` store the preview reads from. Writing the
// index directly keeps `viewedAt` controllable (saves stamp the server clock).
async function seedThumbnails(
  dir: string,
  records: { kind: AppletKind; id: string; viewedAt?: string }[]
) {
  const cacheDir = getThumbnailsDir(dir)
  await mkdir(cacheDir, { recursive: true })
  const index = []
  for (const record of records) {
    const file = `${record.kind}-${record.id}.webp`
    await Bun.write(join(cacheDir, file), 'bytes')
    index.push({
      kind: record.kind,
      id: record.id,
      revision: 'revision',
      capturedAt: '2026-01-01T00:00:00.000Z',
      viewedAt: record.viewedAt ?? '2026-01-01T00:00:00.000Z',
      file
    })
  }
  await Bun.write(join(cacheDir, 'index.json'), JSON.stringify(index))
}

// Deterministic URL shape for assertions; the real one is the API route.
const thumbnailUrl = (kind: AppletKind, id: string) => `${kind}:${id}`

describe('loadLayout', () => {
  test('opens a new workspace with the default tabs and grid', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quint-layout-'))
    try {
      const loaded = await loadLayout(dir)
      expect(loaded.widgetGrid).toEqual([
        { i: DEFAULT_QUINTLETS_WIDGET.id, x: 0, y: 0 },
        { i: DEFAULT_SUGGESTIONS_WIDGET.id, x: 0, y: 1 }
      ])
      expect(loaded.tabs).toEqual({
        open: ['dashboard', 'canvas'],
        active: 'dashboard'
      })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('drops a legacy saved layoutMode', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [] }, async dir => {
      const loaded = await loadLayout(dir)
      expect('layoutMode' in loaded).toBe(false)
      expect(loaded.tabs).toEqual({
        open: ['dashboard', 'canvas'],
        active: 'dashboard'
      })
    })
  })

  test('keeps an existing saved empty grid empty', async () => {
    await withWorkspaceFile({ ...base, widgetGrid: [] }, async dir => {
      expect((await loadLayout(dir)).widgetGrid).toEqual([])
    })
  })

  test('drops a legacy layoutMode from saved files', async () => {
    await withWorkspaceFile({ version: 1, widgetGrid: [], layoutMode: 'split' }, async dir => {
      const loaded = await loadLayout(dir)
      expect('layoutMode' in loaded).toBe(false)
    })
  })

  test('defaults invalid tabs to the standard set', async () => {
    await withWorkspaceFile(
      { version: 1, widgetGrid: [], tabs: { open: [], active: 'widgets' } },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({
          open: ['dashboard', 'canvas'],
          active: 'dashboard'
        })
      }
    )
  })

  test('pins Dashboard first and silently drops old and invalid tab ids', async () => {
    await withWorkspaceFile(
      {
        version: 1,
        widgetGrid: [],
        tabs: {
          open: [
            'widgets',
            'bad',
            'quintlet:old',
            'quintlet-builder:old-builder',
            'quintlets/dashboard',
            'quintlet-builders/builder-1',
            'widgets',
            'canvas'
          ],
          active: 'bad'
        }
      },
      async dir => {
        const loaded = await loadLayout(dir)
        expect(loaded.tabs).toEqual({
          open: ['dashboard', 'quintlets/dashboard', 'canvas'],
          active: 'dashboard'
        })
      }
    )
  })

  test('falls back to default tabs when only colon-style tabs were saved', async () => {
    await withWorkspaceFile(
      {
        version: 1,
        widgetGrid: [],
        tabs: { open: ['quintlet:dashboard', 'quintlet-builder:old'], active: 'quintlet:dashboard' }
      },
      async dir => {
        expect((await loadLayout(dir)).tabs).toEqual({
          open: ['dashboard', 'canvas'],
          active: 'dashboard'
        })
      }
    )
  })

  test('preserves saved tab order and a valid active tab after Dashboard', async () => {
    await withWorkspaceFile(
      {
        version: 1,
        widgetGrid: [],
        tabs: {
          open: ['quintlets/dashboard', 'dashboard', 'canvas'],
          active: 'quintlets/dashboard'
        }
      },
      async dir => {
        expect((await loadLayout(dir)).tabs).toEqual({
          open: ['dashboard', 'quintlets/dashboard', 'canvas'],
          active: 'quintlets/dashboard'
        })
      }
    )
  })

  test('drops legacy thumbnail caches without migrating them', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetThumbnails: { key: 'old', images: { widget: 'image' } },
        quintletThumbnails: [{ quintletId: 'quintlet', image: 'image' }],
        appletThumbnails: [{ kind: 'widget', id: 'w', revision: 'r', image: 'inline-image' }]
      },
      async dir => {
        const loaded = await loadLayout(dir)
        expect('widgetThumbnails' in loaded).toBe(false)
        expect('quintletThumbnails' in loaded).toBe(false)
        expect('appletThumbnails' in loaded).toBe(false)
      }
    )
  })

  test('normalizes legacy uploaded icons into an icon object', async () => {
    await withWorkspaceFile({ ...base, icon: 'data:image/webp;base64,legacy' }, async dir => {
      expect((await loadLayout(dir)).icon).toEqual({
        type: 'upload',
        value: 'data:image/webp;base64,legacy'
      })
    })
  })
})

describe('mergeLayoutForSave', () => {
  test('preserves a stored name when the body omits it (the reset bug)', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Trip Photos' }
    const body: WorkspaceLayout = { ...base, widgetGrid: [{ i: 'a', x: 0, y: 0 }] }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.name).toBe('Trip Photos')
    expect(merged.widgetGrid).toEqual([{ i: 'a', x: 0, y: 0 }])
  })

  test('ignores a name the body carries — identity comes only from existing', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Real Name' }
    // A stale client might round-trip the resolved/old name; it must not win.
    const body = { ...base, name: 'stale-folder-name' } as WorkspaceLayout
    expect(mergeLayoutForSave(existing, body).name).toBe('Real Name')
  })

  test('keeps the stored icon and ignores a stale icon in the body', () => {
    const existing: WorkspaceLayout = {
      ...base,
      icon: { type: 'glyph', value: 'rocket', background: 'theme' }
    }
    const body = {
      ...base,
      icon: { type: 'upload', value: 'data:image/webp;base64,OLD' }
    } as WorkspaceLayout
    expect(mergeLayoutForSave(existing, body)).toMatchObject({
      icon: { type: 'glyph', value: 'rocket', background: 'theme' }
    })
  })

  test('emits no name/icon keys when the workspace has neither (no undefined leak)', () => {
    const body = {
      ...base,
      name: 'x',
      icon: { type: 'emoji', value: '💡' }
    } as WorkspaceLayout
    const merged = mergeLayoutForSave(base, body)
    expect('name' in merged).toBe(false)
    expect('icon' in merged).toBe(false)
    // and it round-trips clean through JSON (the persisted shape)
    expect(JSON.parse(JSON.stringify(merged))).toEqual({
      version: 1,
      widgetGrid: [],
      tabs: { open: ['dashboard', 'canvas'], active: 'dashboard' }
    })
  })

  test('passes editor-owned fields through from the body', () => {
    const existing: WorkspaceLayout = { ...base, name: 'Keep' }
    const body: WorkspaceLayout = {
      version: 1,
      widgetGrid: [{ i: 'w', x: 1, y: 2 }],
      tabs: { open: ['canvas', 'dashboard'], active: 'canvas' },
      selectedModel: 'muse-spark-1.3',
      selectedFastMode: false,
      theme: { font: 'sans', color: 'rose', radius: 'square' }
    }
    const merged = mergeLayoutForSave(existing, body)
    expect(merged.tabs).toEqual({ open: ['dashboard', 'canvas'], active: 'canvas' })
    expect(merged.selectedModel).toBe('muse-spark-1.3')
    expect(merged.selectedFastMode).toBe(false)
    expect(merged.theme).toEqual({
      font: 'sans',
      color: 'rose',
      radius: 'square'
    })
    expect(merged.name).toBe('Keep')
  })

  test('a layout save omitting tabs preserves newer authored tabs', () => {
    const existing: WorkspaceLayout = {
      ...base,
      tabs: { open: ['dashboard', 'quintlets/board'], active: 'quintlets/board' }
    }
    // This client loaded base before another client changed the workspace tabs.
    const { tabs: _staleTabs, ...body } = base
    const merged = mergeLayoutForSave(existing, {
      ...body,
      widgetGrid: [{ i: 'w', x: 2, y: 3 }]
    })
    expect(merged.tabs).toEqual(existing.tabs)
    expect(merged.widgetGrid).toEqual([{ i: 'w', x: 2, y: 3 }])
  })

  test('explicit undefined tabs have the same effect as an omitted JSON field', () => {
    const { tabs: _tabs, ...body } = base
    expect(mergeLayoutForSave(base, { ...body, tabs: undefined }).tabs).toEqual(base.tabs)
  })

  test('an explicit tab update still changes authored defaults after an unrelated save', () => {
    const { tabs: _tabs, ...body } = base
    const saved = mergeLayoutForSave(base, { ...body, selectedModel: 'muse-spark-1.3' })
    const tabs: WorkspaceLayout['tabs'] = { open: ['dashboard', 'canvas'], active: 'canvas' }
    expect(mergeLayoutForSave(saved, { ...saved, tabs })).toEqual({
      ...saved,
      tabs
    })
  })

  test('drops the old Widgets tab id from stale client saves', () => {
    const body = {
      ...base,
      tabs: { open: ['widgets', 'canvas'], active: 'widgets' }
    } as unknown as WorkspaceLayout

    expect(mergeLayoutForSave(base, body).tabs).toEqual({
      open: ['dashboard', 'canvas'],
      active: 'dashboard'
    })
  })

  test('never lets a stale client write thumbnail records back into the layout', () => {
    const body = {
      ...base,
      appletThumbnails: [{ kind: 'widget', id: 'w', image: 'inline-image' }]
    } as unknown as WorkspaceLayout
    expect('appletThumbnails' in mergeLayoutForSave(base, body)).toBe(false)
  })
})

describe('getWorkspacePreview', () => {
  test('includes the persisted workspace theme', async () => {
    const theme = {
      font: 'sans' as const,
      color: 'rose' as const,
      radius: 'squishy' as const
    }
    await withWorkspaceFile(
      {
        ...base,
        theme
      },
      async dir => {
        expect(await getWorkspacePreview(dir, { thumbnailUrl })).toEqual({
          thumbnails: [],
          theme
        })
      }
    )
  })

  test('sorts thumbnails top-to-bottom and left-to-right, then caps the stack', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [
          { i: 'bottom', x: 0, y: 2 },
          { i: 'fourth', x: 0, y: 3 },
          { i: 'right', x: 2, y: 0 },
          { i: 'left', x: 0, y: 0 }
        ]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'stale' },
          { kind: 'widget', id: 'right' },
          { kind: 'widget', id: 'bottom' },
          { kind: 'widget', id: 'fourth' },
          { kind: 'widget', id: 'left' }
        ])
        expect(await getWorkspacePreview(dir, { thumbnailUrl })).toEqual({
          thumbnails: ['widget:left', 'widget:right', 'widget:bottom']
        })
      }
    )
  })

  test('puts widgets first and fills remaining slots with recent quintlets', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'widget', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'widget' },
          { kind: 'quintlet', id: 'deleted', viewedAt: '2026-01-04T00:00:00.000Z' },
          { kind: 'quintlet', id: 'recent', viewedAt: '2026-01-03T00:00:00.000Z' },
          { kind: 'quintlet', id: 'older', viewedAt: '2026-01-02T00:00:00.000Z' }
        ])
        expect(
          await getWorkspacePreview(dir, { quintletIds: ['older', 'recent'], thumbnailUrl })
        ).toEqual({
          thumbnails: ['widget:widget', 'quintlet:recent', 'quintlet:older']
        })
      }
    )
  })

  test('uses widgets when stored quintlet thumbnails belong to deleted quintlets', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'widget', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [
          { kind: 'widget', id: 'widget' },
          { kind: 'quintlet', id: 'deleted' }
        ])
        expect(await getWorkspacePreview(dir, { quintletIds: [], thumbnailUrl })).toEqual({
          thumbnails: ['widget:widget']
        })
      }
    )
  })

  test('loads and normalizes the first user message when the grid is empty', async () => {
    await withWorkspaceFile(base, async dir => {
      const message = `  ${'A'.repeat(260)}\nsecond line  `
      const preview = await getWorkspacePreview(dir, {
        getProviderPreview: async includeFirstUserMessage => ({
          firstUserMessage: includeFirstUserMessage ? message : undefined,
          updatedAt: 900
        }),
        thumbnailUrl
      })

      expect(preview.thumbnails).toEqual([])
      expect(preview.updatedAt).toBe(900)
      expect(preview.firstUserMessage?.length).toBe(240)
      expect(preview.firstUserMessage?.endsWith('…')).toBe(true)
      expect(preview.firstUserMessage).not.toContain('\n')
    })
  })

  test('loads the message fallback when widgets exist without thumbnails', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'waiting-for-thumbnail', x: 0, y: 0 }]
      },
      async dir => {
        const preview = await getWorkspacePreview(dir, {
          getProviderPreview: async includeFirstUserMessage => {
            expect(includeFirstUserMessage).toBe(true)
            return {
              firstUserMessage: 'Shown until a capture lands',
              updatedAt: 900
            }
          },
          thumbnailUrl
        })

        expect(preview).toEqual({
          thumbnails: [],
          firstUserMessage: 'Shown until a capture lands',
          updatedAt: 900
        })
      }
    )
  })

  test('does not load the message fallback when thumbnails exist', async () => {
    await withWorkspaceFile(
      {
        ...base,
        widgetGrid: [{ i: 'captured', x: 0, y: 0 }]
      },
      async dir => {
        await seedThumbnails(dir, [{ kind: 'widget', id: 'captured' }])
        const preview = await getWorkspacePreview(dir, {
          getProviderPreview: async includeFirstUserMessage => {
            expect(includeFirstUserMessage).toBe(false)
            return {
              firstUserMessage: 'Should stay hidden',
              updatedAt: 900
            }
          },
          thumbnailUrl
        })

        expect(preview).toEqual({ thumbnails: ['widget:captured'], updatedAt: 900 })
      }
    )
  })

  test('keeps an empty folder when the fallback is empty or unreadable', async () => {
    await withWorkspaceFile(base, async dir => {
      expect(
        await getWorkspacePreview(dir, {
          getProviderPreview: async () => ({ firstUserMessage: ' \n ' }),
          thumbnailUrl
        })
      ).toEqual({
        thumbnails: []
      })
      expect(
        await getWorkspacePreview(dir, {
          getProviderPreview: async () => {
            throw new Error('unreadable session')
          },
          thumbnailUrl
        })
      ).toEqual({ thumbnails: [] })
    })
  })
})
