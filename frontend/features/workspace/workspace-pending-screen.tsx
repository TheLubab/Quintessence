import type { ReactNode } from 'react'

import { WorkspaceSetupPanel } from './setup/workspace-setup-panel'
import { WorkspaceFrame, WorkspacePane } from './workspace-frame'

type WorkspacePendingScreenProps = {
  setupRequired?: boolean
  children: ReactNode
}

export function WorkspacePendingScreen({
  setupRequired = false,
  children
}: WorkspacePendingScreenProps) {
  return (
    <WorkspaceFrame
      workspace={
        <WorkspacePane>
          {setupRequired ? <WorkspaceSetupPanel>{children}</WorkspaceSetupPanel> : children}
        </WorkspacePane>
      }
    />
  )
}
