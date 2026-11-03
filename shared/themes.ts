import { wcagLuminance } from 'culori'

export type FontTheme =
  | 'sans'
  | 'serif'
  | 'mono'
  | 'geometric'
  | 'rounded'
  | 'blobby'
  | 'awkward'
  | 'comic'

export type FontThemeConfig = {
  label: string
  sans: string
  mono: string
  googleFontsQuery?: string // passed as `family=` param to Google Fonts API
}

export const FONT_THEMES: Record<FontTheme, FontThemeConfig> = {
  sans: {
    label: 'System',
    sans: 'system-ui',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500'
  },
  serif: {
    label: 'Serif',
    sans: 'Literata',
    mono: 'Geist Mono',
    googleFontsQuery: 'Literata:wght@400;600;700&family=Geist+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    sans: 'Geist Mono',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500;600'
  },
  geometric: {
    label: 'Geometric',
    sans: 'Manrope',
    mono: 'Geist Mono',
    googleFontsQuery: 'Manrope:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  rounded: {
    label: 'Rounded',
    sans: 'SN Pro',
    mono: 'Geist Mono',
    googleFontsQuery: 'SN+Pro:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  blobby: {
    label: 'Blobby',
    sans: 'Sour Gummy',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Sour+Gummy:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  awkward: {
    label: 'Awkward',
    sans: 'Averia Sans Libre',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Averia+Sans+Libre:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  comic: {
    label: 'Comic',
    sans: 'Comic Sans MS, Comic Sans, cursive',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500'
  }
}

export type RadiusTheme = 'squishy' | 'soft' | 'subtle' | 'square'

export type RadiusThemeConfig = {
  label: string
  radius: string
}

export const RADIUS_THEMES: Record<RadiusTheme, RadiusThemeConfig> = {
  squishy: { label: 'Rounded', radius: '1.25rem' },
  soft: { label: 'Soft', radius: '0.875rem' },
  subtle: { label: 'Subtle', radius: '0.5rem' },
  square: { label: 'Square', radius: '0' }
}

export type ColorTheme =
  | 'default'
  | 'paper'
  | 'rose'
  | 'tangerine'
  | 'sand'
  | 'mint'
  | 'sky'
  | 'lavender'
  | 'midnight'

export type ThemeColorMode = 'workspace' | 'widget'
export type ThemeColorScheme = 'light' | 'dark'
export type ThemeAppearance = 'system' | ThemeColorScheme

export const THEME_APPEARANCES: Record<ThemeAppearance, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark'
}

// Keep the persisted keys stable while offering a smaller, calmer palette.
export const FEATURED_COLOR_THEMES: ColorTheme[] = ['default', 'mint', 'sky', 'tangerine', 'rose']

export const DEFAULT_PRIMARY_COLOR = 'oklch(0.205 0 0)'

function foregroundForPrimary(primary: string): string {
  const luminance = wcagLuminance(primary)
  const blackContrast = (luminance + 0.05) / 0.05
  const whiteContrast = 1.05 / (luminance + 0.05)
  return blackContrast > whiteContrast ? 'oklch(0 0 0)' : 'oklch(1 0 0)'
}

const WORKSPACE_COLOR_DERIVATIONS = {
  light: {
    primary: primary => primary,
    primaryForeground: primary => foregroundForPrimary(primary),
    background: () => 'color-mix(in oklch, var(--primary) 3%, oklch(0.975 0.003 80) 97%)',
    foreground: () => 'oklch(0.23 0.008 260)',
    card: () => 'color-mix(in oklch, var(--primary) 2%, oklch(0.995 0.002 80) 98%)',
    cardForeground: () => 'var(--foreground)',
    popover: () => 'color-mix(in oklch, var(--primary) 1%, oklch(0.995 0.002 80) 99%)',
    popoverForeground: () => 'var(--foreground)',
    muted: () => 'color-mix(in oklch, var(--background) 94%, var(--foreground) 6%)',
    mutedForeground: () => 'oklch(0.46 0.012 260)',
    accent: () => 'color-mix(in oklch, var(--primary) 9%, transparent)',
    accentForeground: () => 'var(--foreground)',
    border: () => 'color-mix(in oklch, var(--foreground) 12%, transparent)',
    input: () => 'color-mix(in oklch, var(--background) 90%, var(--foreground) 10%)',
    secondary: () => 'var(--muted)',
    secondaryForeground: () => 'var(--foreground)',
    ring: () => 'var(--primary)'
  },
  dark: {
    primary: primary => primary,
    primaryForeground: primary => foregroundForPrimary(primary),
    background: () => 'color-mix(in oklch, var(--primary) 2%, oklch(0.19 0.006 260) 98%)',
    foreground: () => 'oklch(0.95 0.004 260)',
    card: () => 'color-mix(in oklch, var(--primary) 3%, oklch(0.235 0.006 260) 97%)',
    cardForeground: () => 'var(--foreground)',
    popover: () => 'color-mix(in oklch, var(--primary) 3%, oklch(0.27 0.006 260) 97%)',
    popoverForeground: () => 'var(--foreground)',
    muted: () => 'color-mix(in oklch, var(--primary) 2%, oklch(0.165 0.006 260) 98%)',
    mutedForeground: () => 'oklch(0.73 0.012 260)',
    accent: () => 'color-mix(in oklch, var(--primary) 13%, transparent)',
    accentForeground: () => 'var(--foreground)',
    border: () => 'color-mix(in oklch, var(--foreground) 14%, transparent)',
    input: () => 'color-mix(in oklch, var(--primary) 3%, oklch(0.32 0.006 260) 97%)',
    secondary: () => 'var(--card)',
    secondaryForeground: () => 'var(--foreground)',
    ring: () => 'var(--primary)'
  }
} satisfies Record<ThemeColorScheme, Record<string, (primary: string) => string>>

const THEME_COLOR_DERIVATIONS = {
  light: {
    workspace: WORKSPACE_COLOR_DERIVATIONS.light,
    widget: {
      ...WORKSPACE_COLOR_DERIVATIONS.light,
      background: WORKSPACE_COLOR_DERIVATIONS.light.card
    }
  },
  dark: {
    workspace: WORKSPACE_COLOR_DERIVATIONS.dark,
    widget: {
      ...WORKSPACE_COLOR_DERIVATIONS.dark,
      background: WORKSPACE_COLOR_DERIVATIONS.dark.card
    }
  }
} satisfies Record<
  ThemeColorScheme,
  Record<ThemeColorMode, Record<string, (primary: string) => string>>
>

export type ThemeColorToken = keyof (typeof WORKSPACE_COLOR_DERIVATIONS)['light']
export type ThemeColors = Record<ThemeColorToken, string>

export type ColorThemeConfig = {
  label: string
  // Legacy keys remain readable for saved workspaces and the CLI.
  primary?: string
  darkPrimary?: string
  // Only used to migrate themes saved before appearance was a separate setting.
  scheme?: ThemeColorScheme
}

export const THEME_COLOR_TOKENS = Object.keys(
  WORKSPACE_COLOR_DERIVATIONS.light
) as ThemeColorToken[]

export function deriveThemeColors(
  primary: string,
  mode: ThemeColorMode = 'workspace',
  scheme: ThemeColorScheme = 'light'
): ThemeColors {
  const colors = {} as ThemeColors
  const derivations = THEME_COLOR_DERIVATIONS[scheme][mode]
  for (const token of THEME_COLOR_TOKENS) {
    colors[token] = derivations[token](primary)
  }
  return colors
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeConfig> = {
  default: {
    label: 'Neutral',
    primary: DEFAULT_PRIMARY_COLOR,
    darkPrimary: 'oklch(0.86 0.008 260)'
  },
  paper: {
    label: 'Paper',
    primary: 'oklch(0.46 0.035 70)',
    darkPrimary: 'oklch(0.8 0.045 70)'
  },
  rose: {
    label: 'Rose',
    primary: 'oklch(0.48 0.095 15)',
    darkPrimary: 'oklch(0.77 0.075 15)'
  },
  tangerine: {
    label: 'Clay',
    primary: 'oklch(0.48 0.085 45)',
    darkPrimary: 'oklch(0.79 0.075 45)'
  },
  sand: {
    label: 'Sand',
    primary: 'oklch(0.5 0.065 80)',
    darkPrimary: 'oklch(0.82 0.065 80)'
  },
  mint: {
    label: 'Sage',
    primary: 'oklch(0.46 0.065 155)',
    darkPrimary: 'oklch(0.77 0.065 155)'
  },
  sky: {
    label: 'Ocean',
    primary: 'oklch(0.46 0.085 245)',
    darkPrimary: 'oklch(0.77 0.075 245)'
  },
  lavender: {
    label: 'Lavender',
    primary: 'oklch(0.48 0.085 295)',
    darkPrimary: 'oklch(0.79 0.07 295)'
  },
  midnight: {
    label: 'Midnight',
    primary: 'oklch(0.72 0.12 255)',
    darkPrimary: 'oklch(0.77 0.075 245)',
    scheme: 'dark'
  }
}

export type WorkspaceTheme = {
  font: FontTheme
  color: ColorTheme
  radius: RadiusTheme
  appearance?: ThemeAppearance
}

export type ResolvedWorkspaceTheme = WorkspaceTheme & {
  appearance: ThemeAppearance
}

export const DEFAULT_WORKSPACE_THEME: ResolvedWorkspaceTheme = {
  font: 'sans',
  color: 'default',
  radius: 'soft',
  appearance: 'system'
}

function resolveThemePreset<T extends string>(
  value: unknown,
  presets: Record<T, unknown>,
  fallback: T
): T {
  return typeof value === 'string' && Object.hasOwn(presets, value) ? (value as T) : fallback
}

export function resolveWorkspaceTheme(theme?: Partial<WorkspaceTheme>): ResolvedWorkspaceTheme {
  const color = resolveThemePreset(theme?.color, COLOR_THEMES, DEFAULT_WORKSPACE_THEME.color)
  // Existing workspaces retain their light/dark intent. New workspaces follow
  // the device until the user explicitly chooses an appearance.
  const appearance = theme ? (COLOR_THEMES[color].scheme ?? 'light') : 'system'
  return {
    font: resolveThemePreset(theme?.font, FONT_THEMES, DEFAULT_WORKSPACE_THEME.font),
    color,
    radius: resolveThemePreset(theme?.radius, RADIUS_THEMES, DEFAULT_WORKSPACE_THEME.radius),
    appearance: resolveThemePreset(theme?.appearance, THEME_APPEARANCES, appearance)
  }
}

export function resolveThemeColorOverrides(
  theme?: Partial<WorkspaceTheme>,
  mode: ThemeColorMode = 'workspace',
  scheme?: ThemeColorScheme
): ThemeColors | undefined {
  const resolved = resolveWorkspaceTheme(theme)
  const color = COLOR_THEMES[resolved.color]
  const resolvedScheme = scheme ?? (isDarkWorkspaceTheme(resolved) ? 'dark' : 'light')
  const primary =
    resolvedScheme === 'dark'
      ? (color.darkPrimary ?? 'oklch(0.8 0.035 260)')
      : (color.primary ?? DEFAULT_PRIMARY_COLOR)
  return deriveThemeColors(primary, mode, resolvedScheme)
}

export function isDarkWorkspaceTheme(theme?: Partial<WorkspaceTheme>, systemDark = false): boolean {
  const { appearance } = resolveWorkspaceTheme(theme)
  return appearance === 'dark' || (appearance === 'system' && systemDark)
}
