import {
  LinkIcon,
  MenuDotsIcon,
  PenIcon,
  TrashBinMinimalisticIcon
} from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/frontend/components/ui/dropdown-menu'
import type { QuickAccessLink } from '@/shared/types'

type QuickAccessLinkItemProps = {
  link: QuickAccessLink
  onEdit: () => void
  onRemove: () => void
}

export function QuickAccessLinkItem({ link, onEdit, onRemove }: QuickAccessLinkItemProps) {
  return (
    <div className="group/item relative w-40 shrink-0">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${link.title} (opens in a new tab)`}
        title={link.url}
        className="group flex h-16 w-full items-center gap-3 rounded-xl bg-background px-3 pr-7 text-left text-foreground ring-1 ring-border transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <LinkIcon size={20} strokeWidth={1.5} />
        </span>
        <span className="line-clamp-2 min-w-0 text-xs leading-snug font-medium">{link.title}</span>
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label={`Link actions for ${link.title}`}
              className="absolute top-1 right-1 border-0 shadow-none focus-visible:opacity-100 data-popup-open:opacity-100 sm:opacity-0 sm:group-focus-within/item:opacity-100 sm:group-hover/item:opacity-100"
            >
              <MenuDotsIcon strokeWidth={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-32">
          <DropdownMenuItem onClick={onEdit}>
            <PenIcon strokeWidth={1.75} />
            Edit link
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRemove}>
            <TrashBinMinimalisticIcon strokeWidth={1.75} />
            Remove link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
