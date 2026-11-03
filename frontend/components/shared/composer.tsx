import type { ComponentProps, RefObject } from 'react'

import { ArrowUpIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import { cn } from '@/frontend/utils/cn'
import type { AgentAvailability } from '@/frontend/utils/agent-availability'
import { Spinner } from '../ui/spinner'

type ComposerProps = Omit<ComponentProps<'form'>, 'ref'> & {
  composerRef: RefObject<HTMLTextAreaElement | null>
}

type ComposerFocusTarget = Pick<HTMLTextAreaElement, 'focus' | 'setSelectionRange' | 'value'>

export function focusComposer(composer: ComposerFocusTarget | null) {
  if (!composer) return
  composer.focus()
  const end = composer.value.length
  composer.setSelectionRange(end, end)
}

export function Composer({
  composerRef,
  className,
  onMouseDown,
  children,
  ...props
}: ComposerProps) {
  return (
    <form
      {...props}
      onMouseDown={event => {
        onMouseDown?.(event)
        if (event.defaultPrevented) return
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')
        )
          return
        focusComposer(composerRef.current)
      }}
      className={cn(
        'group/composer flex w-full cursor-text flex-col gap-1 rounded-3xl bg-muted p-2.5 text-card-foreground shadow-xs transition-[color,box-shadow] outline-none squircle focus-within:shadow-sm',
        className
      )}
    >
      {children}
    </form>
  )
}

type ComposerTextareaProps = Omit<ComponentProps<'textarea'>, 'ref'> & {
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function ComposerTextarea({ textareaRef, className, ...props }: ComposerTextareaProps) {
  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={cn(
        'field-sizing-content max-h-40 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50',
        className
      )}
    />
  )
}

type ComposerFooterProps = ComponentProps<'div'>

export function ComposerFooter({ className, children, ...props }: ComposerFooterProps) {
  return (
    <div {...props} className={cn('flex items-center justify-end gap-3', className)}>
      {children}
    </div>
  )
}

export function composerAvailabilityTooltip(availability: AgentAvailability): string | undefined {
  if (availability.status === 'checking') return 'Checking agent status…'
  return undefined
}

export function canSubmitComposerAction(
  hasContent: boolean,
  busy: boolean,
  availability: AgentAvailability
): boolean {
  return hasContent && !busy && availability.status === 'available'
}

type ComposerSubmitButtonProps = {
  label: string
  hasContent: boolean
  busy?: boolean
  loading?: boolean
  availability: AgentAvailability
}

export function ComposerSubmitButton({
  label,
  hasContent,
  busy = false,
  loading = false,
  availability
}: ComposerSubmitButtonProps) {
  const canSubmit = canSubmitComposerAction(hasContent, busy || loading, availability)
  const availabilityTooltip = composerAvailabilityTooltip(availability)
  const button = (
    <Button
      type="submit"
      size="icon"
      className="rounded-full"
      disabled={!canSubmit}
      aria-label={label}
    >
      {loading ? <Spinner /> : <ArrowUpIcon strokeWidth={1.5} />}
    </Button>
  )

  if (loading || !availabilityTooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{button}</span>} />
      <TooltipContent className="max-w-64 text-center">{availabilityTooltip}</TooltipContent>
    </Tooltip>
  )
}
