---
title: Tooltip
description: A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/tooltip
  api: https://base-ui.com/react/components/tooltip#api-reference
---

Some examples also use `button`, `kbd`. Install the ones you need with `quint ui-components add button kbd --install`.


```tsx
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function TooltipDemo() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Hover</TooltipTrigger>
      <TooltipContent>
        <p>Add to library</p>
      </TooltipContent>
    </Tooltip>
  )
}
```

## Installation

Use `quint ui-components add tooltip --install`.

## Usage

```tsx showLineNumbers
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
```

```tsx showLineNumbers
<Tooltip>
  <TooltipTrigger>Hover</TooltipTrigger>
  <TooltipContent>
    <p>Add to library</p>
  </TooltipContent>
</Tooltip>
```

## Composition

Use the following composition to build a `Tooltip`:

```text
Tooltip
├── TooltipTrigger
└── TooltipContent
```

## Side

Use the `side` prop to change the position of the tooltip.

```tsx
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function TooltipSides() {
  return (
    <div className="flex flex-wrap gap-2">
      {(['left', 'top', 'bottom', 'right'] as const).map(side => (
        <Tooltip key={side}>
          <TooltipTrigger render={<Button variant="outline" className="w-fit capitalize" />}>
            {side}
          </TooltipTrigger>
          <TooltipContent side={side}>
            <p>Add to library</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
```

## With Keyboard Shortcut

```tsx
import { DisketteIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { Kbd } from '../ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function TooltipKeyboard() {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" size="icon-sm" />}>
        <DisketteIcon strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent>
        Save Changes <Kbd>S</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
```

## Disabled Button

Show a tooltip on a disabled button by wrapping it with a span.

```tsx
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function TooltipDisabled() {
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-block w-fit" />}>
          <Button variant="outline" disabled>
            Disabled
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>This feature is currently unavailable</p>
        </TooltipContent>
      </Tooltip>
    </>
  )
}
```

## API Reference

See the [Base UI Tooltip](https://base-ui.com/react/components/tooltip#api-reference) documentation.
