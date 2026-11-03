import { useState } from 'react'

import {
  AddIcon,
  LoaderIcon,
  MenuDotsIcon,
  PenIcon,
  TrashBinMinimalisticIcon
} from '@solar-icons/react/linear'
import type { Icon as SolarIcon } from '@solar-icons/react/lib/types'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/frontend/components/ui/alert-dialog'
import { Button } from '@/frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/frontend/components/ui/dropdown-menu'
import { InlineInput } from '@/frontend/components/ui/inline-input'
import { toast } from '@/frontend/components/ui/toast'
import { useDeleteQuintlet, useRenameQuintlet } from '@/frontend/features/quintlets/api'
import { getQuintletIcon, getQuintletLabel } from '@/frontend/features/quintlets/quintlet-presentation'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'
import { cn } from '@/frontend/utils/cn'
import { normalizeQuickAccessLinks } from '@/shared/quick-access'
import type { CompiledQuintlet, QuickAccessLink } from '@/shared/types'

import { QuickAccessLinkEditor } from './quick-access-link-editor'
import { QuickAccessLinkItem } from './quick-access-link-item'

type ShortcutActionProps = {
  label: string
  ariaLabel: string
  onClick: () => void
}

function ShortcutAction({ label, ariaLabel, onClick }: ShortcutActionProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-16 w-36 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-background px-3 text-center text-sm font-medium text-foreground transition-colors duration-200 ease-out squircle hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AddIcon size={20} strokeWidth={1.5} />
      <span className="line-clamp-2 text-xs leading-snug">
        {label}
      </span>
    </button>
  )
}

type QuintletItemProps = {
  quintlet: CompiledQuintlet
  Icon: SolarIcon
  onOpen: () => void
}

function QuintletItem({ quintlet, Icon, onOpen }: QuintletItemProps) {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const renameQuintlet = useRenameQuintlet(workspaceId)
  const deleteQuintlet = useDeleteQuintlet(workspaceId)
  const label = getQuintletLabel(quintlet)
  const [editing, setEditing] = useState(false)

  function startRename() {
    setEditing(true)
  }

  function commitRename(value: string) {
    const title = value.trim()
    if (!title || title === label) return

    renameQuintlet.mutate(
      { quintletId: quintlet.id, title },
      {
        onError: error => {
          toast.add({
            title: 'Couldn’t rename quintlet',
            description: error.message,
            type: 'error'
          })
        }
      }
    )
  }

  return (
    <div className="group/item relative w-40 shrink-0">
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={onOpen}
        className="group flex h-16 w-full items-center gap-3 rounded-xl bg-background px-3 pr-7 text-left text-foreground ring-1 ring-border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <Icon size={20} strokeWidth={1.5} />
        </span>
        <span className="line-clamp-2 min-w-0 text-xs leading-snug font-medium">
          {editing ? '' : label}
        </span>
      </button>

      {editing && (
        <InlineInput
          autoFocus
          selectOnFocus
          aria-label={`Rename ${label}`}
          defaultValue={label}
          onBlur={() => setEditing(false)}
          onValueCommit={commitRename}
          className="absolute top-5 right-7 left-15 m-0 h-6 w-auto min-w-0 rounded-xs px-1 text-xs leading-snug font-medium"
        />
      )}

      <AlertDialog>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={`View actions for ${label}`}
                className="absolute top-1 right-1 border-0 shadow-none transition-opacity sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
              >
                <MenuDotsIcon strokeWidth={1.75} />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-32">
            <DropdownMenuItem onClick={startRename} disabled={renameQuintlet.isPending}>
              <PenIcon strokeWidth={1.75} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton
              render={<AlertDialogTrigger />}
              disabled={deleteQuintlet.isPending}
              onClick={() => deleteQuintlet.reset()}
              className="w-full"
            >
              <TrashBinMinimalisticIcon strokeWidth={1.75} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the quintlet and its source code. Related data and shared files stay in the
              workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteQuintlet.isError && (
            <p className="text-xs text-destructive">{deleteQuintlet.error.message}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuintlet.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={deleteQuintlet.isPending}
              onClick={() => deleteQuintlet.mutate(quintlet.id)}
            >
              {deleteQuintlet.isPending && (
                <LoaderIcon data-icon="inline-start" strokeWidth={1.75} className="animate-spin" />
              )}
              Delete quintlet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type QuickAccessWidgetProps = {
  quintlets: CompiledQuintlet[]
  onOpenQuintlet: (quintletId: string) => void
  onCreateQuintlet: () => void
  showOnboarding: boolean
}

type LinkEditorState = {
  workspaceId: string
  link?: QuickAccessLink
}

export function QuickAccessWidget({
  quintlets,
  onOpenQuintlet,
  onCreateQuintlet,
  showOnboarding
}: QuickAccessWidgetProps) {
  const { layout, setLayout, workspaceId } = useWorkspaceLayoutCtx()
  const neutral = !layout.theme?.color || layout.theme.color === 'default'
  const links = normalizeQuickAccessLinks(layout.quickAccessLinks)
  const [editor, setEditor] = useState<LinkEditorState>()
  const currentEditor = editor?.workspaceId === workspaceId ? editor : undefined
  const empty = quintlets.length === 0 && links.length === 0

  function saveLink(value: Omit<QuickAccessLink, 'id'>) {
    if (!currentEditor) return
    const existing = currentEditor.link
    const next = existing
      ? links.map(link => (link.id === existing.id ? { ...link, ...value } : link))
      : [...links, { id: crypto.randomUUID(), ...value }]
    setLayout({ quickAccessLinks: next })
    setEditor(undefined)
  }

  return (
    <div className={cn('relative flex size-full flex-col gap-3 overflow-hidden p-4', neutral ? 'bg-black/65 text-white' : 'bg-primary/20 text-foreground')}>
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="shrink-0 text-sm font-medium">Quick access</h2>
        {empty && showOnboarding && (
          <p className={cn('min-w-0 truncate text-xs', neutral ? 'text-white' : 'text-muted-foreground')}>
            Keep quintlets and useful websites close at hand
          </p>
        )}
      </div>
      <div className="relative no-scrollbar flex min-h-0 flex-1 scroll-fade-x items-start gap-2 overflow-x-auto p-1 [--scroll-fade-reveal:16px]">
        {quintlets.map(quintlet => (
          <QuintletItem
            key={quintlet.id}
            quintlet={quintlet}
            Icon={getQuintletIcon(quintlet)}
            onOpen={() => onOpenQuintlet(quintlet.id)}
          />
        ))}
        {links.map(link => (
          <QuickAccessLinkItem
            key={link.id}
            link={link}
            onEdit={() => setEditor({ workspaceId, link })}
            onRemove={() =>
              setLayout({ quickAccessLinks: links.filter(item => item.id !== link.id) })
            }
          />
        ))}
        <ShortcutAction
          label="Add link"
          ariaLabel="Add link"
          onClick={() => setEditor({ workspaceId })}
        />
        <ShortcutAction
          label="New quintlet"
          ariaLabel="Create new quintlet"
          onClick={onCreateQuintlet}
        />
      </div>
      {currentEditor && (
        <QuickAccessLinkEditor
          key={`${workspaceId}/${currentEditor.link?.id ?? 'new'}`}
          link={currentEditor.link}
          onSave={saveLink}
          onClose={() => setEditor(undefined)}
        />
      )}
    </div>
  )
}
