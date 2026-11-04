import { useState, type ReactNode } from 'react'

import abstractPaint from '@/frontend/assets/workspace-backgrounds/abstract-paint.webp'
import abstractTexture from '@/frontend/assets/workspace-backgrounds/abstract-texture.webp'
import colorAberration from '@/frontend/assets/workspace-backgrounds/color-aberration.webp'
import colorSwirls from '@/frontend/assets/workspace-backgrounds/color-swirls.webp'
import mistyForest from '@/frontend/assets/workspace-backgrounds/misty-forest.webp'
import moraineLake from '@/frontend/assets/workspace-backgrounds/moraine-lake.webp'
import mountainLake from '@/frontend/assets/workspace-backgrounds/mountain-lake.webp'
import swissLake from '@/frontend/assets/workspace-backgrounds/swiss-lake.webp'
import winterForest from '@/frontend/assets/workspace-backgrounds/winter-forest.webp'

const backgrounds = [
  abstractPaint,
  abstractTexture,
  colorAberration,
  colorSwirls,
  mistyForest,
  moraineLake,
  mountainLake,
  swissLake,
  winterForest
]

type WorkspaceSetupPanelProps = {
  children: ReactNode
}

export function WorkspaceSetupPanel({ children }: WorkspaceSetupPanelProps) {
  const [background] = useState(() => backgrounds[Math.floor(Math.random() * backgrounds.length)])

  return (
    <section
      aria-label="Workspace setup"
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-muted squircle"
    >
      <img
        alt=""
        aria-hidden="true"
        src={background}
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-sm"
      />
      <div className="relative flex min-h-0 flex-1 overflow-y-auto bg-background/10 p-6">
        <div className="m-auto flex min-h-96 w-full max-w-xl flex-col rounded-3xl bg-background/90 shadow-sm backdrop-blur-2xl backdrop-saturate-150">
          {children}
        </div>
      </div>
    </section>
  )
}
