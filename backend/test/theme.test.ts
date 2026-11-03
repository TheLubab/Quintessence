import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { interpolate, wcagContrast } from 'culori'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  deriveThemeColors,
  isDarkWorkspaceTheme,
  resolveWorkspaceTheme
} from '@/shared/themes'
import type { WorkspaceLayout, WorkspaceTheme } from '@/shared/types'

import { loadLayout, saveLayout } from '../workspaces/layout'
import { applyThemeUpdate } from '../workspaces/theme'

describe('color themes', () => {
  test('keeps the default primary source aligned with the root theme', async () => {
    const css = await Bun.file(join(import.meta.dir, '../../frontend/index.css')).text()

    expect(css).toContain(`--primary: ${DEFAULT_PRIMARY_COLOR};`)
  })

  // index.html carries a hardcoded first-paint background, because the
  // stylesheet that defines `--muted` is render-blocking and the browser would
  // otherwise paint its white canvas first. A literal cannot follow the token,
  // so pin them together here — drift shows up as a white flash on cold loads,
  // which nothing else would catch.
  test('keeps the shell first-paint background aligned with --muted', async () => {
    const html = await Bun.file(join(import.meta.dir, '../../frontend/index.html')).text()
    const indexCss = await Bun.file(join(import.meta.dir, '../../frontend/index.css')).text()

    const shellBackground = html.match(/html \{\s*background:\s*([^;]+);/)?.[1]?.trim()
    const root = indexCss.match(/:root \{([\s\S]*?)\n\}/)?.[1]
    const muted = root?.match(/--muted:\s*([^;]+);/)?.[1]?.trim()

    expect(shellBackground).toBeDefined()
    expect(muted).toBeDefined()
    expect(shellBackground).toBe(muted)
    expect(html).toContain('<meta name="color-scheme" content="light" />')
  })

  test('keeps the selected primary and chooses readable text for light and dark inputs', () => {
    expect(deriveThemeColors('oklch(1 0 0)')).toMatchObject({
      primary: 'oklch(1 0 0)',
      primaryForeground: 'oklch(0 0 0)'
    })
    expect(deriveThemeColors('oklch(0 0 0)')).toMatchObject({
      primary: 'oklch(0 0 0)',
      primaryForeground: 'oklch(1 0 0)'
    })
  })

  test('uses the selected primary without a circular reference', () => {
    const primary = 'oklch(0.7426 0.1817 56.01)'
    const colors = deriveThemeColors(primary, 'widget')

    expect(colors.primary).toBe(primary)
    expect(colors.primary).not.toContain('var(--primary)')
  })

  test('preset text meets the existing contrast floor on workspace and widget surfaces', () => {
    for (const preset of Object.values(COLOR_THEMES)) {
      const primary = preset.primary ?? DEFAULT_PRIMARY_COLOR
      const scheme = preset.scheme ?? 'light'
      const normal = deriveThemeColors(primary, 'workspace', scheme)
      const widget = deriveThemeColors(primary, 'widget', scheme)
      expect(wcagContrast(primary, normal.primaryForeground)).toBeGreaterThanOrEqual(3)
      for (const colors of [normal, widget]) {
        const match = colors.background.match(
          /^color-mix\(in oklch, var\(--primary\) ([\d.]+)%, (oklch\([^)]+\)) ([\d.]+)%\)$/
        )
        expect(match).not.toBeNull()
        const surface = interpolate([primary, match![2]!], 'oklch')(Number(match![3]) / 100)
        expect(wcagContrast(surface, colors.foreground)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  test('midnight uses the dark workspace surface derivation', () => {
    expect(COLOR_THEMES.midnight.scheme).toBe('dark')
    expect(isDarkWorkspaceTheme({ color: 'midnight' })).toBe(true)
    expect(isDarkWorkspaceTheme({ color: 'paper' })).toBe(false)

    const dark = deriveThemeColors(
      COLOR_THEMES.midnight.primary ?? DEFAULT_PRIMARY_COLOR,
      'workspace',
      'dark'
    )
    const light = deriveThemeColors(
      COLOR_THEMES.midnight.primary ?? DEFAULT_PRIMARY_COLOR,
      'workspace',
      'light'
    )

    expect(dark.background).not.toBe(light.background)
    expect(dark.foreground).not.toBe(light.foreground)

    const result = applyThemeUpdate(undefined, { color: 'midnight' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, color: 'midnight' })
  })
})

describe('applyThemeUpdate', () => {
  test('setting one option preserves the others', () => {
    const current = {
      font: 'sans' as const,
      color: 'paper' as const,
      radius: 'squishy' as const
    }
    const result = applyThemeUpdate(current, { font: 'serif' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      appearance: 'light',
      font: 'serif',
      color: 'paper',
      radius: 'squishy'
    })
    expect(result.applied).toEqual({ font: 'serif' })
  })

  test('setting color uses its preset key', () => {
    const current = {
      font: 'mono' as const,
      color: 'default' as const,
      radius: 'subtle' as const
    }
    const result = applyThemeUpdate(current, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      appearance: 'light',
      font: 'mono',
      color: 'paper',
      radius: 'subtle'
    })
    expect(result.applied).toEqual({ color: 'paper' })
  })

  test("'sans' remains an explicit font preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'paper' as const,
      radius: 'soft' as const
    }
    const result = applyThemeUpdate(current, { font: 'sans' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      appearance: 'light',
      font: 'sans',
      color: 'paper',
      radius: 'soft'
    })
  })

  test('combined font + color updates apply both', () => {
    const result = applyThemeUpdate(undefined, {
      font: 'serif',
      color: 'mint',
      radius: 'square'
    })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      appearance: 'system',
      font: 'serif',
      color: 'mint',
      radius: 'square'
    })
    expect(result.applied).toEqual({
      font: 'serif',
      color: 'mint',
      radius: 'square'
    })
  })

  test('fills missing options with the workspace defaults', () => {
    const result = applyThemeUpdate(undefined, { color: 'paper' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, color: 'paper' })
  })

  test('rejects unknown font key', () => {
    const result = applyThemeUpdate(undefined, { font: 'comic-sans' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('comic-sans')
  })

  test('rejects unknown color key', () => {
    const result = applyThemeUpdate(undefined, { color: 'neon' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('neon')
  })

  test("'soft' remains an explicit preset", () => {
    const current = {
      font: 'serif' as const,
      color: 'rose' as const,
      radius: 'squishy' as const
    }
    const result = applyThemeUpdate(current, { radius: 'soft' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({
      appearance: 'light',
      font: 'serif',
      color: 'rose',
      radius: 'soft'
    })
    expect(result.applied).toEqual({ radius: 'soft' })
  })

  test('rejects unknown radius key', () => {
    const result = applyThemeUpdate(undefined, { radius: 'pillowy' })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error).toContain('pillowy')
  })

  test('setting radius uses its preset key', () => {
    const result = applyThemeUpdate(undefined, { radius: 'soft' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.theme).toEqual({ ...DEFAULT_WORKSPACE_THEME, radius: 'soft' })
    expect(result.applied).toEqual({ radius: 'soft' })
  })
})

describe('resolveWorkspaceTheme', () => {
  test('returns one complete default theme', () => {
    expect(resolveWorkspaceTheme()).toEqual(DEFAULT_WORKSPACE_THEME)
  })

  test('fills missing preset keys', () => {
    expect(resolveWorkspaceTheme({ font: 'serif' })).toEqual({
      appearance: 'light',
      font: 'serif',
      color: 'default',
      radius: 'soft'
    })
  })

  test('falls back from unknown saved preset keys', () => {
    const unknownTheme = {
      font: 'legacy',
      color: 'legacy',
      radius: 'legacy'
    } as unknown as WorkspaceTheme

    expect(resolveWorkspaceTheme(unknownTheme)).toEqual({
      ...DEFAULT_WORKSPACE_THEME,
      appearance: 'light'
    })
  })
})

describe('loadLayout/saveLayout round-trip with theme', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'quint-theme-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('persists the selected preset keys', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      tabs: { open: ['canvas'], active: 'canvas' },
      theme: {
        font: 'serif',
        color: 'paper',
        radius: 'subtle'
      }
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(layout.theme)
  })

  test('persists the complete default theme', async () => {
    const layout: WorkspaceLayout = {
      version: 1,
      widgetGrid: [],
      tabs: { open: ['canvas'], active: 'canvas' },
      theme: DEFAULT_WORKSPACE_THEME
    }
    await saveLayout(layout, tmpDir)
    const loaded = await loadLayout(tmpDir)
    expect(loaded.theme).toEqual(DEFAULT_WORKSPACE_THEME)
  })
})
