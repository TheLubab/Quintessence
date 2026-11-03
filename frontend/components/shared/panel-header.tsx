import { cn } from '@/frontend/utils/cn'
import type { ReactNode } from 'react'

export function PanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header
      className={cn(
        '@container relative flex shrink-0 items-center gap-1 rounded-2xl bg-card py-2 pr-3 pl-4 squircle'
      )}
    >
      {children}
    </header>
  )
}
