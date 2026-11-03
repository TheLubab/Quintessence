import { useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'

import { Button } from '@/frontend/components/ui/button'
import { BottomPanel } from '@/frontend/components/shared/bottom-panel'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import {
  getWorkspaceThemeColorStyle,
  getWorkspaceThemeFontStyle,
  usePreloadWorkspaceFonts,
  useWorkspaceThemeDark
} from '@/frontend/platform/workspace-theme'
import {
  COLOR_THEMES,
  DEFAULT_WORKSPACE_THEME,
  FEATURED_COLOR_THEMES,
  FONT_THEMES,
  RADIUS_THEMES,
  THEME_APPEARANCES,
  resolveWorkspaceTheme
} from '@/shared/themes'
import type {
  FontTheme,
  RadiusTheme,
  ResolvedWorkspaceTheme,
  ThemeAppearance,
  WorkspaceTheme
} from '@/shared/themes'

const FONT_OPTIONS: FontTheme[] = [
  'sans',
  'rounded',
  'serif',
  'mono',
  'geometric',
  'blobby',
  'awkward',
  'comic'
]
const RADIUS_OPTIONS: RadiusTheme[] = ['soft', 'squishy', 'square']
const APPEARANCE_OPTIONS: ThemeAppearance[] = ['system', 'light', 'dark']

type ThemeOptionGroupProps = {
  children: ReactNode
  label: string
}

function ThemeOptionGroup({ children, label }: ThemeOptionGroupProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <p className="shrink-0 text-sm text-muted-foreground sm:w-20 sm:pt-1">{label}</p>
      <div role="group" aria-label={label} className="flex min-w-0 flex-wrap gap-1">
        {children}
      </div>
    </div>
  )
}

type ThemeOptionProps = {
  active: boolean
  children?: ReactNode
  label: string
  onSelect: () => void
  style?: CSSProperties
}

function ThemeOption({ active, children, label, onSelect, style }: ThemeOptionProps) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={active}
      onClick={onSelect}
      style={style}
      className="gap-2 rounded-full font-sans"
    >
      {children}
      {label}
    </Button>
  )
}

type ThemePanelProps = {
  onClose: () => void
  ref?: Ref<HTMLDivElement>
}

export function ThemePanel({ onClose, ref }: ThemePanelProps) {
  usePreloadWorkspaceFonts()
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const theme = resolveWorkspaceTheme(layout.theme)
  const dark = useWorkspaceThemeDark(theme)
  const scheme = dark ? 'dark' : 'light'
  const [history, setHistory] = useState<ResolvedWorkspaceTheme[]>([])
  const colorOptions = FEATURED_COLOR_THEMES.includes(theme.color)
    ? FEATURED_COLOR_THEMES
    : [...FEATURED_COLOR_THEMES, theme.color]
  const radiusOptions = RADIUS_OPTIONS.includes(theme.radius)
    ? RADIUS_OPTIONS
    : [...RADIUS_OPTIONS, theme.radius]

  function setTheme(update: Partial<WorkspaceTheme>) {
    const next = resolveWorkspaceTheme({ ...theme, ...update })
    if (
      next.appearance === theme.appearance &&
      next.color === theme.color &&
      next.font === theme.font &&
      next.radius === theme.radius
    ) {
      return
    }
    setHistory(previous => [...previous, theme])
    setLayout({ theme: next })
  }

  function undo() {
    const previous = history[history.length - 1]
    if (!previous) return
    setHistory(items => items.slice(0, -1))
    setLayout({ theme: previous })
  }

  return (
    <BottomPanel
      ref={ref}
      title="Theme"
      onClose={onClose}
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={history.length === 0}
            onClick={undo}
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Reset theme to default"
            onClick={() => setTheme(DEFAULT_WORKSPACE_THEME)}
          >
            Reset
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ThemeOptionGroup label="Appearance">
          {APPEARANCE_OPTIONS.map(appearance => (
            <ThemeOption
              key={appearance}
              label={THEME_APPEARANCES[appearance]}
              active={theme.appearance === appearance}
              onSelect={() => setTheme({ appearance })}
            />
          ))}
        </ThemeOptionGroup>
        <ThemeOptionGroup label="Accent">
          {colorOptions.map(color => (
            <ThemeOption
              key={color}
              label={COLOR_THEMES[color].label}
              active={theme.color === color}
              onSelect={() => setTheme({ color })}
            >
              <span
                aria-hidden="true"
                style={getWorkspaceThemeColorStyle({ ...theme, color }, 'workspace', scheme)}
                className="size-3 shrink-0 rounded-full bg-primary"
              />
            </ThemeOption>
          ))}
        </ThemeOptionGroup>
        <ThemeOptionGroup label="Typography">
          {FONT_OPTIONS.map(font => (
            <ThemeOption
              key={font}
              label={FONT_THEMES[font].label}
              active={theme.font === font}
              onSelect={() => setTheme({ font })}
              style={getWorkspaceThemeFontStyle({ ...theme, font })}
            />
          ))}
        </ThemeOptionGroup>
        <ThemeOptionGroup label="Corners">
          {radiusOptions.map(radius => (
            <ThemeOption
              key={radius}
              label={RADIUS_THEMES[radius].label}
              active={theme.radius === radius}
              onSelect={() => setTheme({ radius })}
            />
          ))}
        </ThemeOptionGroup>
      </div>
    </BottomPanel>
  )
}
