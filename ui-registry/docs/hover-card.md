---
title: Hover Card
description: For sighted users to preview content available behind a link.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/hover-card
  api: https://base-ui.com/react/components/hover-card#api-reference
---

Some examples also use `avatar`, `button`. Install the ones you need with `quint ui-components add avatar button --install`.

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'

export function HoverCardDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger delay={10} closeDelay={100} render={<Button variant="ghost" />}>
        Hover Here
      </HoverCardTrigger>
      <HoverCardContent className="flex w-64 flex-col gap-0.5">
        <div className="font-semibold">@nextjs</div>
        <div>The React Framework – created and maintained by @vercel.</div>
        <div className="mt-1 text-xs text-muted-foreground">Joined December 2021</div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

## Installation

Use `quint ui-components add hover-card --install`.

## Usage

```tsx showLineNumbers
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
```

```tsx showLineNumbers
<HoverCard>
  <HoverCardTrigger>Hover</HoverCardTrigger>
  <HoverCardContent>The React Framework – created and maintained by @vercel.</HoverCardContent>
</HoverCard>
```

## Composition

Use the following composition to build a `HoverCard`:

```text
HoverCard
├── HoverCardTrigger
└── HoverCardContent
```

## Trigger Delays

Use `delay` and `closeDelay` on the trigger to control when the card opens and
closes.

```tsx showLineNumbers
<HoverCard>
  <HoverCardTrigger delay={100} closeDelay={200}>
    Hover
  </HoverCardTrigger>
  <HoverCardContent>Content</HoverCardContent>
</HoverCard>
```

## Positioning

Use the `side` and `align` props on `HoverCardContent` to control placement.

```tsx showLineNumbers
<HoverCard>
  <HoverCardTrigger>Hover</HoverCardTrigger>
  <HoverCardContent side="top" align="start">
    Content
  </HoverCardContent>
</HoverCard>
```

## Basic

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'

export function HoverCardDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger delay={10} closeDelay={100} render={<Button variant="ghost" />}>
        Hover Here
      </HoverCardTrigger>
      <HoverCardContent className="flex w-64 flex-col gap-0.5">
        <div className="font-semibold">@nextjs</div>
        <div>The React Framework – created and maintained by @vercel.</div>
        <div className="mt-1 text-xs text-muted-foreground">Joined December 2021</div>
      </HoverCardContent>
    </HoverCard>
  )
}
```

## Sides

```tsx
import { Button } from '../ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'

const HOVER_CARD_SIDES = ['left', 'top', 'bottom', 'right'] as const

export function HoverCardSides() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {HOVER_CARD_SIDES.map(side => (
        <HoverCard key={side}>
          <HoverCardTrigger
            delay={100}
            closeDelay={100}
            render={<Button variant="outline" className="capitalize" />}
          >
            {side}
          </HoverCardTrigger>
          <HoverCardContent side={side}>
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">Hover Card</h4>
              <p>This hover card appears on the {side} side of the trigger.</p>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}
```

## API Reference

See the [Base UI](https://base-ui.com/react/components/hover-card#api-reference) documentation for more information.
