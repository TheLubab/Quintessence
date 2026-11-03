import { CheckIcon, CloseIcon, UndoLeftIcon, UndoRightIcon } from '@solar-icons/react/linear'
import { AnimatePresence, motion } from 'motion/react'

import { Button } from '@/frontend/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import { cn } from '@/frontend/utils/cn'

import { type DrawingControls, useDrawingHistoryState } from './use-drawing-layer'

type DrawingToolbarProps = {
  controls: DrawingControls
  title: string
  busy: boolean
  onComplete: () => void
}

export function DrawingToolbar({ controls, title, busy, onComplete }: DrawingToolbarProps) {
  const { canUndo, canRedo, hasStrokes } = useDrawingHistoryState(controls)

  return (
    <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-popover p-1.5 shadow-md">
      <span className="mr-2 ml-2 text-sm font-medium">{title}</span>
      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={controls.undo}
                disabled={busy || !canUndo}
                aria-label="Undo"
              >
                <UndoLeftIcon strokeWidth={1.75} />
              </Button>
            }
          />
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={controls.redo}
                disabled={busy || !canRedo}
                aria-label="Redo"
              >
                <UndoRightIcon strokeWidth={1.75} />
              </Button>
            }
          />
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={controls.clear}
          disabled={busy || !hasStrokes}
        >
          Clear
        </Button>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={hasStrokes ? 'complete' : 'cancel'}
          variants={{
            from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
            to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
          }}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: 'spring', duration: 0.1, bounce: 0 }}
        >
          <Button
            type="button"
            variant={hasStrokes ? 'default' : 'ghost'}
            size="icon-sm"
            onClick={onComplete}
            disabled={busy}
            aria-label="Complete"
            className={cn(!hasStrokes && 'text-muted-foreground')}
          >
            {hasStrokes ? <CheckIcon strokeWidth={1.75} /> : <CloseIcon strokeWidth={1.75} />}
          </Button>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
