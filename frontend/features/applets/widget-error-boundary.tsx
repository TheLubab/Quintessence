import { Component, type ErrorInfo, type ReactNode } from 'react'

import { DangerTriangleIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { reportAppletError } from '@/frontend/features/applets/applet-log'
import type { AppletKind } from '@/shared/types'

type WidgetErrorBoundaryProps = {
  name: string
  // Applet attribution for the error journal (docs/applet-runtime.md). The
  // boundary wraps both widgets (WidgetShell) and quintlets (WorkspaceScreen).
  kind: AppletKind
  workspaceId: string
  resetKey: number
  onRetry?: () => void
  onAskAgent?: () => void
  children: ReactNode
}

type State = { error: Error | null }

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[widget:${this.props.name}]`, error, info.componentStack)
    // Journal the crash so `quint debug logs` can surface it to the agent — the
    // console line above dies in a console nobody reads.
    reportAppletError(this.props.workspaceId, {
      source: 'render',
      kind: this.props.kind,
      name: this.props.name,
      message: error.message || String(error),
      stack: [error.stack, info.componentStack].filter(Boolean).join('\n')
    })
  }

  componentDidUpdate(prev: WidgetErrorBoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-start justify-start gap-2 p-4 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <DangerTriangleIcon size={16} strokeWidth={1.75} />
            Widget crashed
          </div>
          <div className="font-mono break-words text-muted-foreground">
            {this.state.error.message}
          </div>
          {(this.props.onRetry || this.props.onAskAgent) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {this.props.onRetry && (
                <Button type="button" variant="outline" size="xs" onClick={this.props.onRetry}>
                  Retry
                </Button>
              )}
              {this.props.onAskAgent && (
                <Button type="button" variant="secondary" size="xs" onClick={this.props.onAskAgent}>
                  Ask agent
                </Button>
              )}
            </div>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
