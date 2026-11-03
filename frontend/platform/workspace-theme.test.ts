import { describe, expect, test } from 'bun:test'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  FONT_THEMES,
  RADIUS_THEMES,
  deriveThemeColors,
  type FontTheme,
  type RadiusTheme
} from '@/shared/themes'

import {
  getWorkspaceThemeColorStyle,
  getWorkspaceThemeFontStyle,
  getWorkspaceThemeRadiusStyle,
  getWorkspaceThemeStyle
} from './workspace-theme'

describe('getWorkspaceThemeStyle', () => {
  test('uses default fonts and radius for the default workspace theme', () => {
    const style = getWorkspaceThemeStyle(undefined)

    expect(style['--sans']).toBe('var(--default-sans)')
    expect(style['--mono']).toBe('var(--default-mono)')
    expect(style['--radius']).toBe(RADIUS_THEMES.soft.radius)
  })

  test('uses default fonts for an invalid font preset', () => {
    expect(
      getWorkspaceThemeFontStyle({ ...DEFAULT_WORKSPACE_THEME, font: 'missing' as FontTheme })
    ).toEqual({ '--sans': 'var(--default-sans)', '--mono': 'var(--default-mono)' })
  })

  test('uses the default radius for an invalid radius preset', () => {
    expect(
      getWorkspaceThemeRadiusStyle({
        ...DEFAULT_WORKSPACE_THEME,
        radius: 'missing' as RadiusTheme
      })
    ).toEqual({ '--radius': RADIUS_THEMES.soft.radius })
  })

  test('combines selected font and color variables', () => {
    const primary = COLOR_THEMES.paper.primary
    if (!primary) throw new Error('expected paper primary')
    const colors = deriveThemeColors(primary)
    const style = getWorkspaceThemeStyle({
      font: 'blobby',
      color: 'paper',
      radius: 'squishy'
    })

    expect(style).toMatchObject({
      '--sans': FONT_THEMES.blobby.sans,
      '--mono': FONT_THEMES.blobby.mono,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground,
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--accent': colors.accent,
      '--accent-foreground': colors.accentForeground,
      '--border': colors.border,
      '--ring': colors.ring,
      '--radius': RADIUS_THEMES.squishy.radius
    })
  })

  test('builds font, color, and radius styles independently', () => {
    const theme = {
      font: 'blobby',
      color: 'paper',
      radius: 'squishy'
    } as const
    const primary = COLOR_THEMES.paper.primary
    if (!primary) throw new Error('expected paper primary')
    const colors = deriveThemeColors(primary)

    expect(getWorkspaceThemeFontStyle(theme)).toEqual({
      '--sans': FONT_THEMES.blobby.sans,
      '--mono': FONT_THEMES.blobby.mono
    })
    expect(getWorkspaceThemeColorStyle(theme)).toMatchObject({
      '--primary': colors.primary,
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--accent': colors.accent
    })
    expect(getWorkspaceThemeColorStyle(theme)['--radius']).toBeUndefined()
    expect(getWorkspaceThemeRadiusStyle(theme)).toEqual({
      '--radius': RADIUS_THEMES.squishy.radius
    })
  })

  test('applies the swapped color derivation to a widget block', () => {
    const primary = COLOR_THEMES.paper.primary
    if (!primary) throw new Error('expected paper primary')
    const colors = deriveThemeColors(primary, 'widget')

    expect(
      getWorkspaceThemeStyle({ font: 'sans', color: 'paper', radius: 'soft' }, 'widget')
    ).toMatchObject({
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground,
      '--muted': colors.muted,
      '--muted-foreground': colors.mutedForeground,
      '--accent': colors.accent,
      '--accent-foreground': colors.accentForeground,
      '--border': colors.border,
      '--ring': colors.ring
    })
  })

  test('uses the root primary source for the default widget theme', () => {
    const colors = deriveThemeColors(DEFAULT_PRIMARY_COLOR, 'widget')

    expect(getWorkspaceThemeStyle(undefined, 'widget')).toMatchObject({
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground
    })
  })

  test('applies the dark workspace derivation selected by a dark preset', () => {
    const primary = COLOR_THEMES.midnight.darkPrimary
    if (!primary) throw new Error('expected midnight primary')
    const colors = deriveThemeColors(primary, 'workspace', 'dark')

    expect(
      getWorkspaceThemeStyle({ font: 'sans', color: 'midnight', radius: 'soft' })
    ).toMatchObject({
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground
    })
  })
})
