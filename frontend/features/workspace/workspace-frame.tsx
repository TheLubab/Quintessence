import type { MouseEventHandler, ReactNode } from 'react'

type WorkspaceFrameProps = {
  workspace: ReactNode
  children?: ReactNode
  onClick?: MouseEventHandler<HTMLDivElement>
}

// Loading and ready content share the same pane geometry. Ready workspaces
// compose their responsive agent panel inside this frame.
export function WorkspaceFrame({ workspace, children, onClick }: WorkspaceFrameProps) {
  return (
    <div
      onClick={onClick}
      className="relative flex h-full min-h-0 flex-1 flex-col font-sans text-foreground"
    >
      <div className="flex min-h-0 min-w-0 flex-1">{workspace}</div>
      {children}
    </div>
  )
}

type WorkspacePaneProps = {
  children: ReactNode
}

export function WorkspacePane({ children }: WorkspacePaneProps) {
  return (
    <div
      data-slot="workspace-pane"
      className="relative m-2 flex min-h-0 min-w-0 flex-1 flex-col-reverse gap-1.5 overflow-hidden transition-[border-radius,background-color] duration-100 ease-out motion-reduce:transition-none"
    >
      {children}
    </div>
  )
}
