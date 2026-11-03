import { AnimatePresence, motion } from 'motion/react'

import { DangerTriangleIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { Skeleton } from '@/frontend/components/ui/skeleton'
import { AppletContainer } from '@/frontend/features/applets/applet-container'
import { useWidget } from '@/frontend/features/applets/use-applet'
import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'

import { WidgetErrorBoundary } from './widget-error-boundary'

type WidgetShellProps = {
  name: string
  onAskAgent?: () => void
}

export function WidgetShell({ name, onAskAgent }: WidgetShellProps) {
  const workspaceId = useWorkspaceId()
  const widget = useWidget(name)

  if (widget.status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="Loading widget"
        className="absolute inset-0 flex flex-col gap-3 p-4"
      >
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-auto h-16 w-full" />
      </div>
    )
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {widget.status === 'ready' && (
        <motion.div
          key={widget.version}
          className="absolute inset-0"
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          <WidgetErrorBoundary
            name={name}
            kind="widget"
            workspaceId={workspaceId}
            resetKey={widget.version}
            onRetry={widget.reload}
            onAskAgent={onAskAgent}
          >
            <AppletContainer segment="widgets" name={name} version={widget.version}>
              <widget.Component />
            </AppletContainer>
          </WidgetErrorBoundary>
        </motion.div>
      )}
      {widget.status === 'error' && (
        <motion.div
          key={`err-${widget.version}`}
          role="alert"
          className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <DangerTriangleIcon size={16} strokeWidth={1.75} />
            Widget failed to load
          </div>
          <p className="line-clamp-2 text-xs break-words text-muted-foreground">{widget.error}</p>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="xs" onClick={widget.reload}>
              Retry
            </Button>
            {onAskAgent && (
              <Button type="button" variant="secondary" size="xs" onClick={onAskAgent}>
                Ask agent
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
