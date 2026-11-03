import {
  COLOR_THEMES,
  FONT_THEMES,
  RADIUS_THEMES,
  THEME_APPEARANCES,
  resolveWorkspaceTheme
} from '@/shared/themes'
import type { ThemeAppearance } from '@/shared/themes'
import type { ColorTheme, FontTheme, RadiusTheme, WorkspaceTheme } from '@/shared/types'

export type ThemeUpdate = {
  font?: string
  color?: string
  radius?: string
  appearance?: string
}
export type ThemeUpdateResult =
  | {
      ok: true
      theme: WorkspaceTheme
      applied: Partial<WorkspaceTheme>
    }
  | { ok: false; error: string }

export function applyThemeUpdate(
  current: WorkspaceTheme | undefined,
  update: ThemeUpdate
): ThemeUpdateResult {
  if (update.font && !Object.hasOwn(FONT_THEMES, update.font)) {
    return { ok: false, error: `Unknown font theme: ${update.font}` }
  }
  if (update.color && !Object.hasOwn(COLOR_THEMES, update.color)) {
    return { ok: false, error: `Unknown color theme: ${update.color}` }
  }
  if (update.radius && !Object.hasOwn(RADIUS_THEMES, update.radius)) {
    return { ok: false, error: `Unknown radius theme: ${update.radius}` }
  }
  if (update.appearance && !Object.hasOwn(THEME_APPEARANCES, update.appearance)) {
    return { ok: false, error: `Unknown appearance: ${update.appearance}` }
  }

  const font = update.font as FontTheme | undefined
  const color = update.color as ColorTheme | undefined
  const radius = update.radius as RadiusTheme | undefined
  const appearance = update.appearance as ThemeAppearance | undefined
  const theme = resolveWorkspaceTheme({
    ...resolveWorkspaceTheme(current),
    ...(font ? { font } : {}),
    ...(color ? { color } : {}),
    ...(radius ? { radius } : {}),
    ...(appearance ? { appearance } : {})
  })

  return {
    ok: true,
    theme,
    applied: {
      ...(font ? { font } : {}),
      ...(color ? { color } : {}),
      ...(radius ? { radius } : {}),
      ...(appearance ? { appearance } : {})
    }
  }
}
