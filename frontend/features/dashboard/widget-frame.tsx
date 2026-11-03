import type { ReactNode } from 'react'

import { AddIcon, MinusIcon, MoveIcon } from '@solar-icons/react/linear'

import { cn } from '@/frontend/utils/cn'

import { Button } from '@/frontend/components/ui/button'
import { useWorkspaceThemeSetting } from '@/frontend/features/workspace/workspace-layout-context'
import { getWorkspaceThemeStyle, useWorkspaceThemeDark } from '@/frontend/platform/workspace-theme'

type WidgetFrameProps = {
  customizing?: boolean
  movable?: boolean
  hidden?: boolean
  widgetId?: string
  onRemove?: () => void
  children?: ReactNode
}

export function WidgetFrame({
  customizing,
  movable = true,
  hidden,
  onRemove,
  children
}: WidgetFrameProps) {
  const theme = useWorkspaceThemeSetting()
  const dark = useWorkspaceThemeDark(theme)

  return (
    <div
      className={cn(
        'group/widget relative size-full',
        customizing && movable && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div
        // Stable hook for widget thumbnails: the capture clone overrides this
        // element's chrome (radius/shadow/stroke) so thumbnails come out square.
        data-widget-chrome
        style={getWorkspaceThemeStyle(theme, 'widget', dark ? 'dark' : 'light')}
        className={cn(
          'absolute inset-0 overflow-hidden rounded-2xl bg-background text-foreground ring-1 ring-border squircle',
          customizing && 'pointer-events-none'
        )}
      >
        {children}
      </div>

      {customizing && movable && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 left-2 flex size-6 items-center justify-center rounded-md bg-popover p-0 text-foreground shadow-xs"
        >
          <MoveIcon size={20} strokeWidth={1.5} />
        </div>
      )}

      {customizing && onRemove && (
        <div className="absolute -top-2 -right-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/widget:opacity-100">
          <Button
            size="icon-sm"
            variant="outline"
            className="rounded-full"
            aria-label={hidden ? 'Restore widget' : 'Hide widget'}
            onPointerDown={event => event.stopPropagation()}
            onClick={onRemove}
          >
            {hidden ? (
              <AddIcon strokeWidth={1.75} />
            ) : (
              <MinusIcon strokeWidth={1.75} className="text-destructive" />
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
