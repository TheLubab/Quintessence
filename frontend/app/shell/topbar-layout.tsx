import { type ReactNode } from 'react'

import { AddIcon, UfoIcon } from '@solar-icons/react/linear'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'

import { useAppConfig } from '@/frontend/api/app-config'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import { useReorderWorkspaces, useWorkspaces } from '@/frontend/features/home/api'
import { BROWSER_TAB_ID } from '@/frontend/utils/browser-tab-id'
import {
  UpdateButton as UpdateButtonComponent,
  useUpdateControl
} from '@/frontend/features/update/update-control'
import { useWorkspaceEvent } from '@/frontend/platform/use-workspace-events'
import { CreateWorkspaceDialog } from '@/frontend/features/workspace/add/create-workspace-dialog'
import { useAccount } from '@/frontend/features/account/account-provider'
import { DemoDialog } from '@/frontend/features/demo/demo-dialog'
import { QuintWordmark } from '@/frontend/components/shared/quint-wordmark'
import { ReorderableList } from '@/frontend/components/shared/reorderable-list'
import type { ReorderableRenderState } from '@/frontend/components/shared/reorderable-list'
import { WorkspaceIcon } from '@/frontend/components/shared/workspace-icon'
import { Button } from '@/frontend/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/frontend/components/ui/tooltip'
import { workspaceDisplayName } from '@/frontend/features/workspace/workspace-presentation'
import { cn } from '@/frontend/utils/cn'
import type { WorkspaceEntry } from '@/shared/types'

type TopbarLayoutProps = {
  // Full panel content — the page supplies its own header (compose it with
  // <PanelHeader>) and body.
  children?: ReactNode
}

// App shell: a topbar with the Quint wordmark, workspace switcher, and update
// controls, above the page content.
export function TopbarLayout({ children }: TopbarLayoutProps) {
  const { data: workspaces } = useWorkspaces()

  // Identity, theme, and registry changes can all alter a workspace's topbar
  // presentation. Refetch the list so the switcher reflects them live. Exact:
  // `workspaceKeys.all` is the
  // prefix of every workspace query — a prefix invalidation would refetch
  // transcripts, widgets, and MCP probes in every connected client.
  const qc = useQueryClient()
  useWorkspaceEvent(e => {
    if (
      e.type === 'workspace:updated' ||
      e.type === 'theme:updated' ||
      e.type === 'workspaces-list:updated'
    ) {
      // Our own icon and order changes are already in the list cache. Own theme
      // saves still refetch: only the layout cache holds those optimistically.
      if (e.type !== 'theme:updated' && e.origin === BROWSER_TAB_ID) return
      qc.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    }
  })

  return (
    <div className="flex h-dvh flex-col gap-(--sheet-inset) bg-black p-(--sheet-inset) transition-colors duration-100 ease-out motion-reduce:transition-none">
      <Topbar workspaces={workspaces ?? []} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-background shadow-sheet transition-colors duration-100 ease-out squircle motion-reduce:transition-none">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

type TopbarProps = {
  workspaces: WorkspaceEntry[]
}

function Topbar({ workspaces }: TopbarProps) {
  const { environment } = useAppConfig()
  const { demo } = useAccount()
  const reorder = useReorderWorkspaces()

  return (
    <TooltipProvider delay={0}>
      {/* The topbar sits on the black outer shell, so scope dark tokens to keep its controls legible. */}
      <header className="dark flex shrink-0 items-center gap-3 px-1 py-1.5 [font-family:var(--default-sans)]">
        <Link
          href="/"
          aria-label="Home"
          className="flex shrink-0 items-center rounded-lg px-1 py-0.5 text-foreground transition-[border-radius,background-color] duration-100 ease-out outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
        >
          <QuintWordmark className="h-5" />
        </Link>

        <nav aria-label="Workspaces" className="flex min-w-0 flex-1 items-center justify-center">
          <div className="no-scrollbar flex max-w-full scroll-fade-x items-center gap-2 overflow-x-auto overscroll-x-contain px-1 py-1 [--scroll-fade-reveal:12px]">
            {workspaces.length > 0 && (
              <ReorderableList
                items={workspaces}
                getId={ws => ws.id}
                className="flex items-center gap-2"
                onReorder={ids => reorder.mutate(ids)}
                renderPlaceholder={() => (
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-accent" />
                )}
                renderOverlay={ws => <WorkspaceButton workspace={ws} dragOverlay />}
                renderItem={(ws, state) => <WorkspaceButton workspace={ws} dragState={state} />}
              />
            )}
            <Tooltip>
              <CreateWorkspaceDialog
                trigger={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label="Create new workspace"
                        className="rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <AddIcon strokeWidth={1.5} />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent side="bottom">Create new workspace</TooltipContent>
            </Tooltip>
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {environment === 'local' && <UpdateButton />}
          {demo && (
            <Tooltip>
              <DemoDialog
                trigger={
                  <TooltipTrigger
                    render={
                      <Button size="icon-lg" aria-label="Set up Quint">
                        <UfoIcon strokeWidth={1.5} />
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent side="bottom">Set up Quint</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>
    </TooltipProvider>
  )
}

function UpdateButton() {
  const updateControl = useUpdateControl()

  return updateControl.status === 'available' ? (
    <UpdateButtonComponent {...updateControl.button} />
  ) : null
}

type WorkspaceButtonProps = {
  workspace: WorkspaceEntry
  dragOverlay?: boolean
  dragState?: ReorderableRenderState
}

function WorkspaceButton({ workspace, dragOverlay = false, dragState }: WorkspaceButtonProps) {
  const [location] = useLocation()
  const href = `/workspace/${workspace.id}`
  const label = workspaceDisplayName(workspace)
  // A workspace URL carries a destination (`/workspace/:id/quintlets/orders`), so the
  // switcher matches the workspace segment, not the whole path. The trailing
  // slash keeps `/workspace/ws1` from lighting up a sibling `/workspace/ws1-other`.
  const active = location === href || location.startsWith(`${href}/`)
  const className = cn(
    'group flex h-7 items-center rounded-full outline-none transition-[background-color,color,border-radius] duration-100 ease-out focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
    active
      ? 'max-w-56 min-w-0 gap-0 bg-popover pr-0 pl-0 text-foreground sm:gap-1.5 sm:pr-2.5'
      : 'size-7 justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    dragOverlay && 'bg-popover text-foreground shadow-lg',
    dragState?.isDragging && 'invisible'
  )
  const content = (
    <>
      <WorkspaceIcon
        icon={workspace.icon}
        name={label}
        workspaceType={workspace.type}
        workspaceTheme={workspace.theme}
        className="size-7 shrink-0 rounded-full"
      />
      {active && (
        <span className="hidden min-w-0 truncate text-sm font-medium sm:block">{label}</span>
      )}
    </>
  )

  if (dragOverlay) return <div className={className}>{content}</div>

  const link = (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={event => {
        if (dragState?.isDragging) event.preventDefault()
      }}
      className={className}
      {...dragState?.dragHandleProps}
    >
      {content}
    </Link>
  )

  if (active) return link

  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
