import type { QuintletInfo, WidgetInfo } from '@/shared/types'

import { useWorkspaceLayoutCtx } from './workspace-layout-context'
import { WorkspaceContent } from './workspace-content'
import { useWorkspaceSetup } from './setup/workspace-setup'
import { WorkspacePendingScreen } from './workspace-pending-screen'

type WorkspaceScreenProps = {
  contentPending: boolean
  widgets: WidgetInfo[]
  quintlets: QuintletInfo[]
}

export function WorkspaceScreen({ contentPending, widgets, quintlets }: WorkspaceScreenProps) {
  const reducedMotion = useReducedMotion()
  const { layout, workspaceId, name, provider } = useWorkspaceLayoutCtx()
  const { content, ready, setupRequired } = useWorkspaceSetup(workspaceId, contentPending, {
    name: name ?? 'Workspace',
    icon: layout.icon,
    workspaceType: provider,
    workspaceTheme: layout.theme
  })

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={ready ? 'ready' : setupRequired ? 'setup' : 'pending'}
        className="flex h-full min-h-0 min-w-0 flex-1"
        initial={{ opacity: reducedMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: reducedMotion ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.25 }}
      >
        {ready ? (
          <WorkspaceContent widgets={widgets} quintlets={quintlets} />
        ) : (
          <WorkspacePendingScreen setupRequired={setupRequired}>{content}</WorkspacePendingScreen>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
