import { type MouseEvent as ReactMouseEvent, type ReactElement, useRef } from 'react'

import {
  ArrowRightIcon,
  ArrowRightUpIcon,
  ChatRoundDotsIcon,
  CloseIcon,
  WindowFrameIcon
} from '@solar-icons/react/linear'

import floppyDisk from '@/frontend/assets/floppy-disk.webp'
import { Button, buttonVariants } from '@/frontend/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/frontend/components/ui/dialog'
import { useAppConfig } from '@/frontend/api/app-config'

type DemoDialogProps = {
  // Trigger-owned (uncontrolled) or controlled via open/onOpenChange — the
  // create-workspace buttons use the former, programmatic opens the latter.
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// Shown in the cloud demo wherever a workspace would be created: the demo is
// limited to its built-in workspaces, with login opening the full app.
export function DemoDialog({ trigger, open, onOpenChange }: DemoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DemoDialogContent />
    </Dialog>
  )
}

type FloppyArtworkProps = {
  demoInstallUrl: string
}

const FLOPPY_POINTER_TRAVEL = 2

function FloppyArtwork({ demoInstallUrl }: FloppyArtworkProps) {
  const floppyRef = useRef<HTMLAnchorElement>(null)

  const moveFloppyOppositePointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!floppyRef.current) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    floppyRef.current.style.setProperty('--floppy-x', `${x * -2 * FLOPPY_POINTER_TRAVEL}px`)
    floppyRef.current.style.setProperty('--floppy-y', `${y * -2 * FLOPPY_POINTER_TRAVEL}px`)
  }

  const resetFloppyPosition = () => {
    floppyRef.current?.style.removeProperty('--floppy-x')
    floppyRef.current?.style.removeProperty('--floppy-y')
  }

  return (
    <div
      className="relative min-h-56 overflow-hidden md:min-h-full"
      onMouseMove={moveFloppyOppositePointer}
      onMouseLeave={resetFloppyPosition}
    >
      <a
        ref={floppyRef}
        href={demoInstallUrl}
        target="_blank"
        rel="noreferrer"
        className="group absolute top-1/2 left-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rotate-4 [transform:translate3d(var(--floppy-x,0px),var(--floppy-y,0px),0)] rounded-lg transition-transform duration-150 ease-out will-change-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none md:w-36"
      >
        <img src={floppyDisk} alt="" className="w-full drop-shadow-xl" />
        <div
          className={buttonVariants({
            variant: 'outline',
            className: 'absolute -right-3 -bottom-2 -rotate-8'
          })}
        >
          About Quint
          <ArrowRightUpIcon data-icon="inline-end" strokeWidth={1.5} />
        </div>
      </a>
    </div>
  )
}

function DemoDialogContent() {
  const { demoInstallUrl } = useAppConfig()

  return (
    <DialogContent
      data-vivid
      showCloseButton={false}
      className="block w-full max-w-md overflow-hidden rounded-2xl bg-primary texture-checker-16 p-2 text-primary-foreground sm:max-w-md md:max-w-2xl"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--background)_14%,transparent),color-mix(in_oklch,var(--background)_6%,transparent))]" />
      {/* Film grain keeps the illustration gradient from banding. */}
      <svg
        className="pointer-events-none absolute inset-0 size-full opacity-30 mix-blend-soft-light"
        aria-hidden="true"
      >
        <filter id="floppy-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#floppy-grain)" />
      </svg>

      <div className="relative grid max-h-[calc(100dvh-2rem)] overflow-y-auto md:grid-cols-[3fr_2fr] md:overflow-visible">
        <div className="rounded-xl bg-background p-6 text-foreground shadow-sm md:p-8">
          <div className="flex flex-col gap-0.5">
            <DialogTitle>Set up your personal Quint</DialogTitle>
            <DialogDescription className="mt-1">
              This is a demo workspace. Sign in and connect your Meta runtime to unlock all
              features.
            </DialogDescription>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <WindowFrameIcon
                strokeWidth={0.75}
                className="mt-0.5 size-8 shrink-0 text-muted-foreground"
              />
              <span className="text-sm text-foreground">
                Create as many workspaces, quintlets, and widgets as you want
              </span>
            </li>
            <li className="flex items-center gap-3">
              <ChatRoundDotsIcon
                strokeWidth={0.75}
                className="mt-0.5 size-8 shrink-0 text-muted-foreground"
              />
              <span className="text-sm text-foreground">
                Build with your <strong className="font-medium">Meta</strong> agent runtime and
                connect it to the tools you already use
              </span>
            </li>
          </ul>

          <Button render={<a href={demoInstallUrl} />} className="mt-6">
            Install Quint
            <ArrowRightIcon data-icon="inline-end" strokeWidth={1.5} />
          </Button>
        </div>

        <FloppyArtwork demoInstallUrl={demoInstallUrl} />
      </div>

      <DialogClose
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Close"
            className="absolute top-4 right-4"
          >
            <CloseIcon strokeWidth={1.5} />
          </Button>
        }
      />
    </DialogContent>
  )
}
