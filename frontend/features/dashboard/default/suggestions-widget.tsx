import { useState } from 'react'

import {
  AltArrowRightIcon,
  ChatRoundDotsIcon,
  ChecklistIcon,
  FolderWithFilesIcon,
  LightbulbIcon,
  NotesIcon,
  RoutingIcon
} from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { useWorkspaceThemeSetting } from '@/frontend/features/workspace/workspace-layout-context'
import { cn } from '@/frontend/utils/cn'

const DEFAULT_SUGGESTIONS = [
  {
    label: 'Ask the agent for ideas',
    icon: LightbulbIcon,
    prompt:
      'Help me find a useful way to use this workspace. Look at what is here, then suggest three specific ideas for widgets, Quintlets, or things we could do together. Explain each in one sentence, and let me choose before building anything. If you need more context, ask me one short question.'
  },
  {
    label: 'Keep track of my priorities',
    icon: ChecklistIcon,
    prompt:
      'Create a priorities widget for my dashboard. First ask what I am working toward and what I need to get done. Keep it simple: add tasks, mark them done, and keep the most important ones visible. Save my changes between visits.'
  },
  {
    label: 'Turn my files into a useful tool',
    icon: FolderWithFilesIcon,
    prompt:
      'Look through the files in this workspace for data or documents that would benefit from a simple browser, search tool, or dashboard. Propose one useful Quintlet based on what is actually here, and ask me before building it. Use real files, not sample data, and leave the originals unchanged.'
  },
  {
    label: 'Map out a plan on Canvas',
    icon: RoutingIcon,
    prompt:
      'Help me map out a plan on the Canvas. Ask what I am trying to do, then organize my answer into a simple visual plan with steps and connections. Preserve anything already on the canvas.'
  },
  {
    label: 'Find my next steps in this project',
    icon: ChatRoundDotsIcon,
    prompt:
      'Review this workspace and give me a concise project briefing: what it is, what appears to be in progress, and a few useful next steps. Point to the files behind your conclusions and flag anything uncertain. Do not change files.'
  },
  {
    label: 'Keep quick notes on my dashboard',
    icon: NotesIcon,
    prompt:
      'Build a simple notes widget for this dashboard. I want to jot down a few lines, edit them, and have them saved automatically between visits. Keep the interface minimal and show whether changes are saved.'
  }
] as const

type SuggestionsWidgetProps = {
  onStartPrompt: (prompt: string) => void
}

export function SuggestionsWidget({ onStartPrompt }: SuggestionsWidgetProps) {
  const [page, setPage] = useState(0)
  const theme = useWorkspaceThemeSetting()
  const neutral = !theme?.color || theme.color === 'default'
  const suggestions = DEFAULT_SUGGESTIONS.slice(page * 3, page * 3 + 3)

  return (
    <div className={cn('flex size-full flex-col gap-3 overflow-y-auto p-4', neutral ? 'bg-black/65 text-white' : 'bg-primary/20 text-foreground')}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Suggestions</h2>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={cn(neutral ? 'text-white hover:bg-white/10 hover:text-white' : 'text-muted-foreground')}
          onClick={() => setPage(current => (current + 1) % 2)}
        >
          More ideas
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {suggestions.map(idea => (
          <Button
            key={idea.label}
            type="button"
            variant="ghost"
            size="default"
            className="group/idea h-auto min-h-10 w-full flex-1 justify-start gap-3 rounded-lg bg-background px-3 text-left text-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground motion-reduce:transition-none"
            onClick={() => onStartPrompt(idea.prompt)}
          >
            <idea.icon strokeWidth={1.5} aria-hidden className="text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={idea.label}>
              {idea.label}
            </span>
            <AltArrowRightIcon
              strokeWidth={1.5}
              aria-hidden
              className="text-muted-foreground transition-transform duration-200 group-hover/idea:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/idea:translate-x-0"
            />
          </Button>
        ))}
      </div>
    </div>
  )
}
