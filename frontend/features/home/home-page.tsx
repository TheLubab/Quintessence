import { useState } from 'react'

import { AddIcon, HomeSmileIcon, LoaderIcon } from '@solar-icons/react/linear'
import { Link, useLocation } from 'wouter'

import {
  useDiscoveredWorkspaces,
  useWorkspacePreview,
  useWorkspacePreviews,
  useWorkspaces
} from './api'
import { CreateWorkspaceDialog } from '@/frontend/features/workspace/add/create-workspace-dialog'
import { ImportWorkspaceDialog } from '@/frontend/features/workspace/add/import-workspace-dialog'
import { DemoDialog } from '@/frontend/features/demo/demo-dialog'
import { useWorkspaceImport } from '@/frontend/features/workspace/add/use-workspace-import'
import { HomeLogo } from './home-logo'
import { useAppConfig } from '@/frontend/api/app-config'
import { AgentFace } from '@/frontend/components/shared/agent-face'
import { WorkspaceIcon } from '@/frontend/components/shared/workspace-icon'
import { Button } from '@/frontend/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import { hasRunningWorkspaceActivity, useLive } from '@/frontend/features/chat/chat-store'
import { cn } from '@/frontend/utils/cn'
import {
  getWorkspaceThemeFontStyle,
  getWorkspaceThemeStyle,
  usePreloadWorkspaceFonts,
  useWorkspaceThemeDark
} from '@/frontend/platform/workspace-theme'
import {
  WorkspaceAgentIcons,
  workspaceDisplayName
} from '@/frontend/features/workspace/workspace-presentation'
import type { DiscoveredWorkspace, WorkspaceEntry } from '@/shared/types'
import { resolveUrl } from '@/shared/navigation'

import { WorkspacePreview } from './workspace-preview'

export function HomePage() {
  usePreloadWorkspaceFonts()
  const [, navigate] = useLocation()
  const workspacesQuery = useWorkspaces()
  useWorkspacePreviews()
  const discoveredQuery = useDiscoveredWorkspaces()
  const importFlow = useWorkspaceImport({
    onSuccess: entry => navigate(`/workspace/${entry.id}`)
  })
  const appConfig = useAppConfig()
  const [promoDialogOpen, setPromoDialogOpen] = useState(false)

  if (workspacesQuery.isPending || discoveredQuery.isPending) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoaderIcon size={20} strokeWidth={1.5} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (workspacesQuery.isError || discoveredQuery.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Couldn’t load your workspaces.</p>
      </div>
    )
  }

  const workspaces = workspacesQuery.data
  const discovered = discoveredQuery.data
  const count = workspaces.length

  function handleAdd(suggestion: DiscoveredWorkspace) {
    // Cloud demo: adding workspaces is off — offer the promo dialog instead.
    if (appConfig.demo) {
      setPromoDialogOpen(true)
      return
    }
    importFlow.startImport(suggestion)
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 pt-12 pb-16 sm:px-8">
      {count > 0 ? (
        <section className="mb-14">
          <h1 className="sr-only">My workspaces</h1>

          <div className="grid grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
            <NewWorkspaceTile />
            {workspaces.map(workspace => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mb-12 flex flex-col items-center gap-5 rounded-[28px] border border-dashed border-border bg-muted/30 px-8 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-foreground/5">
            <HomeSmileIcon size={28} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold tracking-tight">Create your first workspace</h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              A workspace keeps the chats, widgets, and quintlets that share the same context in one
              place. Start fresh, or import a folder you’ve already worked in.
            </p>
          </div>
          <CreateWorkspaceDialog trigger={<Button>Create workspace</Button>} />
        </div>
      )}

      {discovered.length > 0 && (
        <section>
          <div className="mb-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Found on this computer
              </h2>
              <span className="rounded-full bg-muted px-2 py-1 text-xs leading-none font-medium text-muted-foreground tabular-nums">
                {discovered.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Folders you’ve worked in before. Add one to open it as a workspace.
            </p>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card/40">
            {discovered.map(item => (
              <SuggestedRow key={item.path} suggestion={item} onAdd={handleAdd} />
            ))}
          </ul>
        </section>
      )}

      {importFlow.choice && (
        <ImportWorkspaceDialog
          choice={importFlow.choice}
          isPending={importFlow.isPending}
          errorMessage={importFlow.error?.message}
          onTypeChange={importFlow.selectType}
          onSubmit={importFlow.submit}
          onReset={importFlow.reset}
        />
      )}

      <DemoDialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen} />

      <footer className="mt-auto flex justify-center pt-16">
        <HomeLogo className="text-muted-foreground" glyphClassName="h-6" />
      </footer>
    </div>
  )
}

type WorkspaceCardProps = {
  workspace: WorkspaceEntry
}

function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const name = workspaceDisplayName(workspace)
  const previewQuery = useWorkspacePreview(workspace.id)
  const theme = workspace.theme ?? previewQuery.data?.theme
  const dark = useWorkspaceThemeDark(theme)
  const scheme = dark ? 'dark' : 'light'
  const running = useLive(state => hasRunningWorkspaceActivity(state.activity, workspace.id))
  const updatedAt = previewQuery.data?.updatedAt ?? new Date(workspace.addedAt).getTime()
  const workspaceHref = `/workspace/${workspace.id}`

  return (
    <div className="group flex min-w-0 flex-col gap-3.5">
      <div className="relative">
        <WorkspacePreview workspaceId={workspace.id} theme={theme} />
        <Link
          href={workspaceHref}
          aria-label={`Open ${name}`}
          className="absolute inset-0 rounded-[28px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {previewQuery.data && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={resolveUrl('quint:/chat', { workspaceId: workspace.id })}
                  aria-label={`Chat in ${name}`}
                  style={getWorkspaceThemeStyle(theme, 'workspace', scheme)}
                  className="absolute right-3.5 bottom-3.5 rounded-lg transition-transform duration-200 outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                >
                  <AgentFace
                    color="primary"
                    animated={running}
                    expression={running ? 'thinking' : undefined}
                    size={48}
                    className="drop-shadow-sm drop-shadow-primary/20"
                  />
                </Link>
              }
            />
            <TooltipContent>Chat</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Link
        href={workspaceHref}
        className="flex min-w-0 flex-col gap-1 rounded-lg px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          className="flex min-w-0 items-center gap-2 font-sans"
          style={getWorkspaceThemeFontStyle(theme)}
        >
          <WorkspaceIcon
            icon={workspace.icon}
            name={name}
            workspaceType={workspace.type}
            workspaceTheme={theme}
            className="size-4 shrink-0 rounded-xs"
          />
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          {running && (
            <span
              aria-label="Working"
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none"
            />
          )}
        </div>
        <span className="pl-6 text-xs text-muted-foreground">{formatUpdatedAt(updatedAt)}</span>
      </Link>
    </div>
  )
}

function NewWorkspaceTile() {
  return (
    <CreateWorkspaceDialog
      trigger={
        <button
          type="button"
          className="group flex min-w-0 cursor-pointer flex-col gap-3.5 text-left outline-none"
        >
          <div
            className={cn(
              'flex h-45 w-full items-center justify-center rounded-[28px] border border-dashed border-border bg-muted/30',
              'transition-colors duration-200 group-hover:border-foreground/30 group-focus-visible:ring-3 group-focus-visible:ring-ring/50',
              'motion-reduce:transition-none'
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-background shadow-sm ring-1 ring-foreground/5 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none">
              <AddIcon size={22} strokeWidth={1.5} className="text-foreground" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-1 px-1">
            <span className="text-sm font-medium text-foreground">New workspace</span>
          </div>
        </button>
      }
    />
  )
}

type SuggestedRowProps = {
  suggestion: DiscoveredWorkspace
  onAdd: (suggestion: DiscoveredWorkspace) => void
}

function SuggestedRow({ suggestion, onAdd }: SuggestedRowProps) {
  const { path, types } = suggestion
  const name = workspaceDisplayName(suggestion)
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <WorkspaceAgentIcons types={types} />
      <span className="shrink-0 text-sm font-medium text-foreground">{name}</span>
      <span title={path} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {suggestion.displayPath ?? path}
      </span>
      <Button variant="outline" size="sm" onClick={() => onAdd(suggestion)}>
        <AddIcon strokeWidth={1.75} />
        Add
      </Button>
    </li>
  )
}

function formatUpdatedAt(timestamp: number): string {
  const ms = Date.now() - timestamp
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Updated ${days} day${days === 1 ? '' : 's'} ago`
  return `Updated ${new Date(timestamp).toLocaleDateString()}`
}
