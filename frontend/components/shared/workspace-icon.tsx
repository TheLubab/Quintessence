import { createElement } from 'react'

import metaIcon from '@/frontend/assets/meta.svg'
import { resolveAppIcon } from '@/frontend/utils/app-icon-registry'
import { cn } from '@/frontend/utils/cn'
import { useWorkspaceThemeDark } from '@/frontend/platform/workspace-theme'
import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  deriveThemeColors,
  resolveThemeColorOverrides
} from '@/shared/themes'
import type { ThemeColors, ThemeColorScheme } from '@/shared/themes'
import type {
  WorkspaceIcon as WorkspaceIconValue,
  WorkspaceLayout,
  WorkspaceType
} from '@/shared/types'

export const workspaceProviderIcon: Record<WorkspaceType, string> = {
  meta: metaIcon
}

const FALLBACK_PRIMARIES = Object.values(COLOR_THEMES)
  .map(theme => theme.primary)
  .filter((primary): primary is string => Boolean(primary))

type NameFallback = {
  letter: string
  colors: ThemeColors
}

function nameInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

function nameHash(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return hash
}

function resolveNameFallback(
  name: string,
  workspaceTheme: WorkspaceLayout['theme'],
  scheme: ThemeColorScheme
): NameFallback {
  const themeColors = resolveThemeColorOverrides(workspaceTheme, 'workspace', scheme)
  const primary =
    themeColors?.primary ??
    FALLBACK_PRIMARIES[nameHash(name) % FALLBACK_PRIMARIES.length] ??
    DEFAULT_PRIMARY_COLOR
  return {
    letter: nameInitial(name),
    colors: themeColors ?? deriveThemeColors(primary)
  }
}

type WorkspaceIconProps = {
  className?: string
  icon?: WorkspaceIconValue
  name?: string
  workspaceType?: WorkspaceType | null
  workspaceTheme?: WorkspaceLayout['theme']
}

function renderIconContent(
  icon: WorkspaceIconValue | undefined,
  themed: boolean,
  providerIcon: string
) {
  switch (icon?.type) {
    case 'emoji':
      return (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-full translate-y-[2cqi] items-center justify-center font-[Apple_Color_Emoji,Segoe_UI_Emoji,Noto_Color_Emoji,sans-serif] leading-none',
            themed ? 'text-[60cqi]' : 'text-[85cqi]'
          )}
        >
          {icon.value}
        </span>
      )
    case 'upload':
      return <img src={icon.value} alt="" className="size-full" />
    case 'glyph': {
      const Glyph = resolveAppIcon(icon.value)
      if (Glyph) {
        return createElement(Glyph, {
          'aria-hidden': true,
          strokeWidth: 1.75,
          className: themed ? 'size-[70%]' : 'size-[95%] text-foreground'
        })
      }
      // Fall through to the provider icon when there is no workspace name.
    }
    default:
      return <img src={providerIcon} alt="" className="size-[95%]" />
  }
}

export function WorkspaceIcon({
  className,
  icon,
  name,
  workspaceType,
  workspaceTheme
}: WorkspaceIconProps) {
  const dark = useWorkspaceThemeDark(workspaceTheme)
  const scheme = dark ? 'dark' : 'light'
  const fallback =
    !icon && name?.trim() ? resolveNameFallback(name, workspaceTheme, scheme) : undefined
  const themed = icon?.type !== 'upload' && icon?.background === 'theme'
  const colors = themed
    ? (resolveThemeColorOverrides(workspaceTheme, 'workspace', scheme) ??
      deriveThemeColors(DEFAULT_PRIMARY_COLOR))
    : fallback?.colors
  const providerIcon = workspaceProviderIcon[workspaceType ?? 'meta']

  return (
    <span
      className={cn(
        '@container inline-flex shrink-0 items-center justify-center overflow-hidden',
        themed && 'shadow-[inset_0_0_1rem_rgba(255,255,255,0.3)]',
        className
      )}
      style={
        colors ? { backgroundColor: colors.primary, color: colors.primaryForeground } : undefined
      }
    >
      {fallback ? (
        <span
          aria-hidden="true"
          className="flex size-full items-center justify-center text-[58cqi] leading-none font-medium select-none"
        >
          {fallback.letter}
        </span>
      ) : (
        renderIconContent(icon, themed, providerIcon)
      )}
    </span>
  )
}
