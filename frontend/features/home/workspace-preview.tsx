import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/frontend/utils/cn'
import {
  getWorkspaceThemeStyle,
  useWorkspaceThemeDark
} from '@/frontend/platform/workspace-theme'
import type { WorkspaceLayout } from '@/shared/types'

import { useWorkspacePreview } from './api'

type WorkspacePreviewProps = {
  workspaceId: string
  theme?: WorkspaceLayout['theme']
}

const FOLDER = {
  width: 320,
  height: 180,
  radius: 28,
  topLeftRadius: 16,
  bodyTop: 24,
  tabEnd: 124,
  shoulder: {
    width: 40,
    roundness: 10
  }
} as const

function folderBackdropPath(horizontalRadiusScale: number): string {
  const {
    width,
    height,
    radius: radiusY,
    topLeftRadius: topLeftRadiusY,
    bodyTop,
    tabEnd,
    shoulder
  } = FOLDER
  const radiusX = Math.min(width / 2, radiusY * horizontalRadiusScale)
  const topLeftRadiusX = Math.min(width / 2, topLeftRadiusY * horizontalRadiusScale)
  const shoulderWidth = Math.max(0, shoulder.width)
  const bodyStart = tabEnd + shoulderWidth
  const roundness = Math.max(0, Math.min(shoulder.roundness, shoulderWidth / 2))

  return [
    `M ${topLeftRadiusX} 0`,
    `H ${tabEnd}`,
    `C ${tabEnd + roundness} 0 ${bodyStart - roundness} ${bodyTop} ${bodyStart} ${bodyTop}`,
    `H ${width - radiusX}`,
    `Q ${width} ${bodyTop} ${width} ${bodyTop + radiusY}`,
    `V ${height - radiusY}`,
    `Q ${width} ${height} ${width - radiusX} ${height}`,
    `H ${radiusX}`,
    `Q 0 ${height} 0 ${height - radiusY}`,
    `V ${topLeftRadiusY}`,
    `Q 0 0 ${topLeftRadiusX} 0`,
    'Z'
  ].join(' ')
}

function useFolderRadiusScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [horizontalRadiusScale, setHorizontalRadiusScale] = useState(1)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      const scaleX = width / FOLDER.width
      const scaleY = height / FOLDER.height
      const nextScale = scaleY / scaleX
      setHorizontalRadiusScale(current =>
        Math.abs(current - nextScale) < 0.001 ? current : nextScale
      )
    }

    const bounds = element.getBoundingClientRect()
    update(bounds.width, bounds.height)

    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, horizontalRadiusScale }
}

// Papers fan out of the folder and rise on hover. The last entry is the
// front-most sheet; earlier sheets sit behind it and fade back.
const THUMBNAIL_STYLES = [
  {
    frame: cn(
      '-translate-x-5 translate-y-4 -rotate-6',
      'group-focus-within:translate-y-1 group-hover:translate-y-1'
    ),
    img: 'opacity-40'
  },
  {
    frame: cn(
      'translate-x-6 translate-y-3 rotate-4',
      'group-focus-within:-translate-y-1 group-hover:-translate-y-1'
    ),
    img: 'opacity-60'
  },
  {
    frame: cn(
      '-translate-x-0.5 translate-y-2 -rotate-2',
      'group-focus-within:-translate-y-3 group-hover:-translate-y-3'
    ),
    img: 'opacity-100'
  }
] as const

export function WorkspacePreview({ workspaceId, theme: workspaceTheme }: WorkspacePreviewProps) {
  const query = useWorkspacePreview(workspaceId)
  const thumbnails = query.data ? [...query.data.thumbnails].reverse() : []
  const slots = THUMBNAIL_STYLES.slice(THUMBNAIL_STYLES.length - thumbnails.length)
  const firstUserMessage = query.data?.firstUserMessage
  const theme = workspaceTheme ?? query.data?.theme
  const { ref, horizontalRadiusScale } = useFolderRadiusScale()
  const backdropPath = folderBackdropPath(horizontalRadiusScale)
  const noiseFilterId = `folder-noise-${workspaceId}`
  const dark = useWorkspaceThemeDark(theme)
  const scheme = dark ? 'dark' : 'light'
  const themeStyle = getWorkspaceThemeStyle(theme, 'workspace', scheme)

  return (
    <div
      ref={ref}
      style={themeStyle}
      className={cn('relative isolate h-45 w-full font-sans text-foreground', dark && 'dark')}
    >
      <svg
        viewBox={`0 0 ${FOLDER.width} ${FOLDER.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <filter
            id={noiseFilterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.5"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feColorMatrix in="noise" type="saturate" values="0" result="monochromeNoise" />
            <feComponentTransfer in="monochromeNoise" result="faintNoise">
              <feFuncA type="linear" slope="0.24" />
            </feComponentTransfer>
            <feComposite in="faintNoise" in2="SourceAlpha" operator="in" result="clippedNoise" />
            <feBlend in="SourceGraphic" in2="clippedNoise" mode="soft-light" />
          </filter>
        </defs>
        <path
          d={backdropPath}
          filter={`url(#${noiseFilterId})`}
          className="fill-[color-mix(in_oklch,var(--card)_80%,var(--primary)_20%)] stroke-border"
        />
      </svg>

      {thumbnails.map((src, index) => (
        <div
          key={src}
          className={cn(
            'absolute top-[10%] left-[14%] w-fit max-w-[72%] origin-bottom overflow-hidden',
            'rounded-[calc(var(--radius-2xl)*0.4)] bg-background shadow-sm ring-1 ring-foreground/5 squircle',
            'animate-in transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1.15)] fade-in',
            'motion-reduce:transition-none',
            slots[index].frame
          )}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            className={cn(
              'block h-auto max-h-32 w-auto max-w-full object-contain',
              slots[index].img
            )}
          />
        </div>
      ))}

      {thumbnails.length === 0 && firstUserMessage && (
        <div className="absolute inset-x-[12%] top-[20%] flex justify-end">
          <div
            aria-hidden="true"
            className={cn(
              'w-max max-w-40 origin-bottom rounded-lg bg-card px-3 py-2 font-sans shadow-sm ring-1 ring-foreground/5',
              'animate-in transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1.15)] fade-in',
              'motion-reduce:transition-none',
              '-translate-x-1 translate-y-2 -rotate-2',
              'group-focus-within:-translate-y-2 group-hover:-translate-y-2'
            )}
          >
            <p className="line-clamp-3 text-sm leading-normal whitespace-normal">
              {firstUserMessage}
            </p>
          </div>
        </div>
      )}

      {/* Frosted glass front: flush with the back panel, tips forward on hover */}
      <div
        className={cn(
          'absolute inset-x-0 top-[38%] bottom-0 origin-bottom rounded-[28px]',
          'border border-border bg-card/80 shadow-sm backdrop-blur-lg',
          'transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1.15)] motion-reduce:transition-none',
          'group-focus-within:scale-y-[0.95]',
          'group-hover:scale-y-[0.95]'
        )}
      >
        {/* "Quint" signature: looped Q, collapsed u-i-n scribble, rising t, trailing flourish */}
        <svg
          viewBox="0 0 120 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute bottom-3 left-5 h-auto w-16 -rotate-3 text-foreground/45"
        >
          <path d="M18 11C8 9 2 24 8 32C14 40 27 30 26 18C25 10 16 8 12 17C14 28 22 38 32 30C36 26 36 22 38 22C37 28 40 33 45 28C47 25 47 22 48 24C48 30 52 32 56 26C58 22 59 22 59 26C59 32 62 31 65 25C67 21 69 22 69 27C69 33 73 33 77 27C79 22 80 12 82 6C82 14 81 26 84 30C88 33 92 28 96 26C104 24 112 26 116 24" />
          <path d="M73 17C80 15 88 16 94 14" />
          <path d="M20 41C46 37 82 44 114 35" strokeWidth="1.1" />
        </svg>
      </div>
    </div>
  )
}
