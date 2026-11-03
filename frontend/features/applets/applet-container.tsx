import { type ReactNode } from 'react'

import { useWorkspaceId } from '@/frontend/features/workspace/workspace-context'

import { type AppletSegment, appletId, appletStyleKey } from './applet-cache'
import { useAppletStyle } from './applet-styles'

type AppletContainerProps = {
  segment: AppletSegment
  name: string
  version: number
  children: ReactNode
}

// The style scope for one mounted applet: puts the `data-applet` attribute the
// bundle's scoped CSS selectors key off (see backend/applet-engine/applet-css.ts) on a
// wrapper filling the parent box, and keeps the applet's <style> tag mounted
// exactly as long as the applet is — unmounting removes the styles from the
// page. This is the widget path. Quintlets don't use it: QuintletManager parks a quintlet's
// DOM offscreen instead of unmounting it, so it holds the styles itself, above
// the boundary that hides the quintlet.
export function AppletContainer({ segment, name, version, children }: AppletContainerProps) {
  const workspaceId = useWorkspaceId()
  const id = appletId(segment, name)
  useAppletStyle(appletStyleKey(segment, workspaceId, name), version)

  return (
    <div data-applet={id} className="size-full">
      {children}
    </div>
  )
}
