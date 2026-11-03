import { useState } from 'react'

import type { ExpressionName } from '@bwnd/bbot'
import { Face } from '@bwnd/bbot/react'

import { cn } from '@/frontend/utils/cn'

type AgentFaceColor = 'primary' | 'secondary' | 'default'

export type AgentFaceExpression = ExpressionName

const AGENT_FACE_PALETTES: Record<AgentFaceColor, string> = {
  default: '[--face-skin:var(--foreground)] [--face-ink:var(--background)]',
  primary: '[--face-skin:var(--primary)] [--face-ink:var(--primary-foreground)]',
  secondary: '[--face-skin:var(--accent)] [--face-ink:var(--accent-foreground)]'
}

type AgentFaceProps = {
  size?: number
  animated?: boolean
  color?: AgentFaceColor
  expression?: AgentFaceExpression
  className?: string
}

const CAN_ANIMATE = typeof requestAnimationFrame === 'function'

function AgentFace({
  size = 56,
  animated = false,
  color = 'default',
  expression = 'idle',
  className
}: AgentFaceProps) {
  const [hovered, setHovered] = useState(false)
  const active = animated || hovered

  if (!CAN_ANIMATE) return null

  return (
    <Face
      size={size}
      expression={expression}
      track={active}
      blink={active}
      idle={active}
      className={cn('shrink-0', AGENT_FACE_PALETTES[color], className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    />
  )
}

export { AgentFace }
