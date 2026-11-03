---
title: Toggle Group
description: A set of two-state buttons that can be toggled on or off.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/toggle-group
  api: https://base-ui.com/react/components/toggle-group#api-reference
---

Some examples also use `field`. Install the ones you need with `quint ui-components add field --install`.


```tsx
import { TextBoldIcon, TextItalicIcon, TextUnderlineIcon } from '@solar-icons/react/linear'

import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupDemo() {
  return (
    <ToggleGroup variant="outline" multiple>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <TextBoldIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <TextItalicIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="strikethrough" aria-label="Toggle strikethrough">
        <TextUnderlineIcon strokeWidth={1.75} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

## Installation

Use `quint ui-components add toggle-group --install`.

## Usage

```tsx
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
```

```tsx
<ToggleGroup type="single">
  <ToggleGroupItem value="a">A</ToggleGroupItem>
  <ToggleGroupItem value="b">B</ToggleGroupItem>
  <ToggleGroupItem value="c">C</ToggleGroupItem>
</ToggleGroup>
```

## Composition

Use the following composition to build a `ToggleGroup`:

```text
ToggleGroup
├── ToggleGroupItem
└── ToggleGroupItem
```

## Outline

Use `variant="outline"` for an outline style.

```tsx
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupOutline() {
  return (
    <ToggleGroup variant="outline" defaultValue={['all']}>
      <ToggleGroupItem value="all" aria-label="Toggle all">
        All
      </ToggleGroupItem>
      <ToggleGroupItem value="missed" aria-label="Toggle missed">
        Missed
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

## Size

Use the `size` prop to change the size of the toggle group.

```tsx
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupSizes() {
  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup size="sm" defaultValue={['top']} variant="outline">
        <ToggleGroupItem value="top" aria-label="Toggle top">
          Top
        </ToggleGroupItem>
        <ToggleGroupItem value="bottom" aria-label="Toggle bottom">
          Bottom
        </ToggleGroupItem>
        <ToggleGroupItem value="left" aria-label="Toggle left">
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Toggle right">
          Right
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup defaultValue={['top']} variant="outline">
        <ToggleGroupItem value="top" aria-label="Toggle top">
          Top
        </ToggleGroupItem>
        <ToggleGroupItem value="bottom" aria-label="Toggle bottom">
          Bottom
        </ToggleGroupItem>
        <ToggleGroupItem value="left" aria-label="Toggle left">
          Left
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Toggle right">
          Right
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
```

## Spacing

Use `spacing` to add spacing between toggle group items.

```tsx
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupSpacing() {
  return (
    <ToggleGroup size="sm" defaultValue={['top']} variant="outline" spacing={2}>
      <ToggleGroupItem value="top" aria-label="Toggle top">
        Top
      </ToggleGroupItem>
      <ToggleGroupItem value="bottom" aria-label="Toggle bottom">
        Bottom
      </ToggleGroupItem>
      <ToggleGroupItem value="left" aria-label="Toggle left">
        Left
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Toggle right">
        Right
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

## Vertical

Use `orientation="vertical"` for vertical toggle groups.

```tsx
import { TextBoldIcon, TextItalicIcon, TextUnderlineIcon } from '@solar-icons/react/linear'

import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupVertical() {
  return (
    <ToggleGroup multiple orientation="vertical" spacing={1} defaultValue={['bold', 'italic']}>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <TextBoldIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <TextItalicIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <TextUnderlineIcon strokeWidth={1.75} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

## Disabled

```tsx
import { TextBoldIcon, TextItalicIcon, TextUnderlineIcon } from '@solar-icons/react/linear'

import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupDisabled() {
  return (
    <ToggleGroup disabled>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <TextBoldIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <TextItalicIcon strokeWidth={1.75} />
      </ToggleGroupItem>
      <ToggleGroupItem value="strikethrough" aria-label="Toggle strikethrough">
        <TextUnderlineIcon strokeWidth={1.75} />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
```

## Custom

A custom toggle group example.

```tsx
'use client'

import * as React from 'react'

import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

export function ToggleGroupFontWeightSelector() {
  const [fontWeight, setFontWeight] = React.useState('normal')
  return (
    <Field>
      <FieldLabel>Font Weight</FieldLabel>
      <ToggleGroup
        value={[fontWeight]}
        onValueChange={value => setFontWeight(value[0])}
        variant="outline"
        spacing={2}
        size="lg"
      >
        <ToggleGroupItem
          value="light"
          aria-label="Light"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-light">Aa</span>
          <span className="text-xs text-muted-foreground">Light</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="normal"
          aria-label="Normal"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-normal">Aa</span>
          <span className="text-xs text-muted-foreground">Normal</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="medium"
          aria-label="Medium"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-medium">Aa</span>
          <span className="text-xs text-muted-foreground">Medium</span>
        </ToggleGroupItem>
        <ToggleGroupItem
          value="bold"
          aria-label="Bold"
          className="flex size-16 flex-col items-center justify-center rounded-xl"
        >
          <span className="text-2xl leading-none font-bold">Aa</span>
          <span className="text-xs text-muted-foreground">Bold</span>
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>
        Use <code className="rounded-md bg-muted px-1 py-0.5 font-mono">font-{fontWeight}</code> to
        set the font weight.
      </FieldDescription>
    </Field>
  )
}
```

## API Reference

See the [Base UI Toggle Group](https://base-ui.com/react/components/toggle-group#api-reference) documentation.
