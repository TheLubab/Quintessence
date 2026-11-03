import { AltArrowRightIcon } from '@solar-icons/react/linear'
import type { Icon as SolarIcon } from '@solar-icons/react/lib/types'

import { Button } from '@/frontend/components/ui/button'
import { cn } from '@/frontend/utils/cn'

export type ChatPromptBubble = {
  label: string
  prompt: string
  context: readonly string[]
  icon: SolarIcon
}

type ChatPromptBubbleProps = {
  className?: string
  prompt: ChatPromptBubble
  disabled?: boolean
  onSelect: (prompt: ChatPromptBubble) => void
}

export function ChatPromptBubble({
  className,
  prompt,
  disabled = false,
  onSelect
}: ChatPromptBubbleProps) {
  const Icon = prompt.icon

  return (
    <Button
      type="button"
      size="default"
      variant="secondary"
      disabled={disabled}
      onClick={() => onSelect(prompt)}
      className={cn(
        'group/prompt h-auto w-fit max-w-full items-center justify-start gap-2.5 rounded-2xl px-3.5 py-3 text-left leading-snug font-medium whitespace-normal squircle',
        className
      )}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 text-left wrap-anywhere">{prompt.label}</span>
      <AltArrowRightIcon
        size={16}
        strokeWidth={1.5}
        aria-hidden
        className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-100 ease-out group-hover/prompt:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/prompt:translate-x-0"
      />
    </Button>
  )
}

type ChatPromptBubblesProps = {
  prompts: readonly ChatPromptBubble[]
  disabled?: boolean
  onSelect: (prompt: ChatPromptBubble) => void
}

export function ChatPromptBubbles({ prompts, disabled = false, onSelect }: ChatPromptBubblesProps) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {prompts.map(prompt => (
        <ChatPromptBubble
          key={prompt.prompt}
          prompt={prompt}
          disabled={disabled}
          onSelect={onSelect}
          className="w-full"
        />
      ))}
    </div>
  )
}
