import type { ComponentProps } from 'react'

import { AgentFace } from '@/frontend/components/shared/agent-face'
import { cn } from '@/frontend/utils/cn'

type AgentLauncherProps = ComponentProps<'button'> & {
  loading: boolean
  unread?: boolean
}

export function AgentLauncher({ loading, unread = false, className, ...props }: AgentLauncherProps) {
  return (
    <button
      type="button"
      aria-label={unread ? 'Agent, new activity' : 'Agent'}
      className={cn(
        'group fixed right-4 bottom-4 block cursor-pointer rounded-full p-0 drop-shadow-[0_0_4px_var(--background)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:right-6 sm:bottom-6',
        className
      )}
      {...props}
    >
      <AgentFace
        color="primary"
        animated={loading}
        size={loading ? 80 : 64}
        expression={loading ? 'thinking' : undefined}
        className="drop-shadow-md drop-shadow-primary/25 transition-[width,height,filter] duration-300 ease-in-out group-hover:drop-shadow-lg group-hover:drop-shadow-primary/40 motion-reduce:transition-none"
      />
      {unread && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-2 rounded-full bg-success ring-2 ring-background"
        />
      )}
    </button>
  )
}
