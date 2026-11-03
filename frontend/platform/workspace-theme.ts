import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'

import {
  DEFAULT_WORKSPACE_THEME,
  FONT_THEMES,
  RADIUS_THEMES,
  THEME_COLOR_TOKENS,
  isDarkWorkspaceTheme,
  resolveThemeColorOverrides,
  resolveWorkspaceTheme
} from '@/shared/themes'
import type { ThemeColorMode, ThemeColorScheme, ThemeColorToken } from '@/shared/themes'
import type { WorkspaceLayout } from '@/shared/types'

const FONT_LINK_ID = 'quint-fonts'
const FONT_PREVIEW_LINK_ID = 'quint-font-previews'
const ALL_FONTS_QUERY = Object.values(FONT_THEMES)
  .map(theme => theme.googleFontsQuery)
  .filter(Boolean)
  .join('&family=')
const WORKSPACE_FONT_PROPERTIES = [
  ['sans', '--sans'],
  ['mono', '--mono']
] as const
const WORKSPACE_COLOR_PROPERTIES = THEME_COLOR_TOKENS.map(
  token => [token, themeColorProperty(token)] as const
)
const WORKSPACE_RADIUS_PROPERTY = '--radius' as const
const WORKSPACE_THEME_PROPERTIES = [
  ...WORKSPACE_FONT_PROPERTIES.map(([, property]) => property),
  ...WORKSPACE_COLOR_PROPERTIES.map(([, property]) => property),
  WORKSPACE_RADIUS_PROPERTY
]

type WorkspaceThemeStyle = CSSProperties & {
  [property: `--${string}`]: string | undefined
}

function themeColorProperty(token: ThemeColorToken): `--${string}` {
  const name = token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return `--${name}`
}

export function getWorkspaceThemeFontStyle(theme: WorkspaceLayout['theme']): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolved = resolveWorkspaceTheme(theme)

  const font = FONT_THEMES[resolved.font]

  for (const [token, property] of WORKSPACE_FONT_PROPERTIES) {
    style[property] =
      resolved.font === 'sans'
        ? token === 'sans'
          ? 'var(--default-sans)'
          : 'var(--default-mono)'
        : font[token]
  }
  return style
}

export function getWorkspaceThemeColorStyle(
  theme: WorkspaceLayout['theme'],
  colorMode: ThemeColorMode = 'workspace',
  scheme?: ThemeColorScheme
): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolvedScheme = scheme ?? (isDarkWorkspaceTheme(theme) ? 'dark' : 'light')
  const colors = resolveThemeColorOverrides(theme, colorMode, resolvedScheme)
  style.colorScheme = resolvedScheme

  for (const [token, property] of WORKSPACE_COLOR_PROPERTIES) {
    style[property] = colors?.[token]
  }
  return style
}

export function getWorkspaceThemeRadiusStyle(theme: WorkspaceLayout['theme']): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolved = resolveWorkspaceTheme(theme)

  style[WORKSPACE_RADIUS_PROPERTY] = RADIUS_THEMES[resolved.radius].radius
  return style
}

export function getWorkspaceThemeStyle(
  theme: WorkspaceLayout['theme'],
  colorMode: ThemeColorMode = 'workspace',
  scheme?: ThemeColorScheme
): WorkspaceThemeStyle {
  return {
    ...getWorkspaceThemeFontStyle(theme),
    ...getWorkspaceThemeColorStyle(theme, colorMode, scheme),
    ...getWorkspaceThemeRadiusStyle(theme)
  }
}

export function usePreloadWorkspaceFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_PREVIEW_LINK_ID)) return

    const link = document.createElement('link')
    link.id = FONT_PREVIEW_LINK_ID
    link.rel = 'stylesheet'
    // CORS mode makes the sheet's cssRules readable, so thumbnail capture
    // (modern-screenshot) can inline the @font-face rules into its SVG —
    // an SVG rasterized in <img> can't use the page's webfonts otherwise.
    link.crossOrigin = 'anonymous'
    link.href = `https://fonts.googleapis.com/css2?family=${ALL_FONTS_QUERY}&display=swap`
    document.head.appendChild(link)

    return () => {
      link.remove()
    }
  }, [])
}

function subscribeSystemAppearance(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSystemDarkSnapshot() {
  return (
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
}

export function useWorkspaceThemeDark(theme: WorkspaceLayout['theme']) {
  const systemDark = useSyncExternalStore(
    subscribeSystemAppearance,
    getSystemDarkSnapshot,
    () => false
  )
  return isDarkWorkspaceTheme(theme, systemDark)
}

function useDocumentWorkspaceThemeStyle(theme: WorkspaceLayout['theme']) {
  const dark = useWorkspaceThemeDark(theme)
  useLayoutEffect(() => {
    const element = document.documentElement
    const style = getWorkspaceThemeStyle(theme, 'workspace', dark ? 'dark' : 'light')

    element.classList.toggle('dark', dark)
    element.style.colorScheme = dark ? 'dark' : 'light'

    for (const property of WORKSPACE_THEME_PROPERTIES) {
      const value = style[property]
      if (value) {
        element.style.setProperty(property, value)
      } else {
        element.style.removeProperty(property)
      }
    }

    return () => {
      element.classList.remove('dark')
      element.style.removeProperty('color-scheme')
      for (const property of WORKSPACE_THEME_PROPERTIES) {
        element.style.removeProperty(property)
      }
    }
  }, [theme, dark])
}

// Applies the active workspace theme to the document root so the workspace,
// topbar, and body-level portals all resolve the same tokens.
export function useWorkspaceTheme(theme: WorkspaceLayout['theme']) {
  const { font } = resolveWorkspaceTheme(theme)
  useDocumentWorkspaceThemeStyle(theme)

  useEffect(() => {
    const config = FONT_THEMES[font] ?? FONT_THEMES[DEFAULT_WORKSPACE_THEME.font]

    const existing = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null
    if (!config.googleFontsQuery) {
      existing?.remove()
    } else {
      const url = `https://fonts.googleapis.com/css2?family=${config.googleFontsQuery}&display=swap`
      if (existing) {
        existing.href = url
      } else {
        const link = document.createElement('link')
        link.id = FONT_LINK_ID
        link.rel = 'stylesheet'
        // Same CORS requirement as the preview link above: thumbnail capture
        // can only embed @font-face rules from origin-clean stylesheets.
        link.crossOrigin = 'anonymous'
        link.href = url
        document.head.appendChild(link)
      }
    }

    return () => {
      document.getElementById(FONT_LINK_ID)?.remove()
    }
  }, [font])
}
