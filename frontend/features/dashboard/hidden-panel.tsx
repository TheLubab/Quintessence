import type { Ref } from 'react'

import { AddIcon, Widget5Icon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { BottomPanel } from '@/frontend/components/shared/bottom-panel'
import { DEFAULT_SUGGESTIONS_WIDGET, isDefaultWidget } from '@/shared/default-widgets'

import type { GridItem } from './grid'

type HiddenPanelProps = {
  items: GridItem[]
  onCreateWidget: () => void
  onClose: () => void
  onRestore: (id: string) => void
  ref?: Ref<HTMLDivElement>
}

function hiddenWidgetLabel(id: string): string {
  if (id === DEFAULT_SUGGESTIONS_WIDGET.id) return 'Suggestions'
  return isDefaultWidget(id) ? 'Quick access' : id
}

export function HiddenPanel({ items, onCreateWidget, onClose, onRestore, ref }: HiddenPanelProps) {
  return (
    <BottomPanel
      ref={ref}
      title={items.length > 0 ? `Hidden widgets (${items.length})` : 'Hidden widgets'}
      actions={
        <Button type="button" variant="secondary" size="sm" onClick={onCreateWidget}>
          <AddIcon data-icon="inline-start" strokeWidth={1.75} />
          New widget
        </Button>
      }
      onClose={onClose}
      className="max-h-[40vh]"
    >
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                <Widget5Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {hiddenWidgetLabel(item.id)}
              </span>
              <Button type="button" variant="outline" size="xs" onClick={() => onRestore(item.id)}>
                Show
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No hidden widgets</p>
      )}
    </BottomPanel>
  )
}
