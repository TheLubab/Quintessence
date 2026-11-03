---
title: Slider
description: An input where the user selects a value from within a given range.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/slider
  api: https://base-ui.com/react/components/slider#api-reference
---

Some examples also use `label`. Install the ones you need with `quint ui-components add label --install`.


```tsx
import { Slider } from '../ui/slider'

export function SliderDemo() {
  return <Slider defaultValue={[75]} max={100} step={1} className="mx-auto w-full max-w-xs" />
}
```

## Installation

Use `quint ui-components add slider --install`.

## Usage

```tsx
import { Slider } from '../ui/slider'
```

```tsx
<Slider defaultValue={[33]} max={100} step={1} />
```

Single values can also be numbers: `<Slider defaultValue={33} />`. Thumb count uses an array `value` first, then an array `defaultValue`, otherwise one thumb. A scalar `value` combined with an array `defaultValue` therefore renders multiple thumbs at the same value.

## Movement Animation and Custom Content

Movement animation is off by default. Set `animate` for discrete controls to animate the thumb and filled range for 100ms, including while dragging. The initial measurement is not animated. Leave it off for continuous controls so the thumb follows the pointer directly.

Children render inside the control, after the track and before the thumbs, so you can add marks:

```tsx
import { Slider } from '../ui/slider'

export function SliderWithMarks() {
  return (
    <div className="grid gap-2">
      <span id="effort-label">Reasoning effort</span>
      <Slider animate defaultValue={2} min={0} max={4} step={1} aria-labelledby="effort-label">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 flex justify-between"
        >
          {[0, 1, 2, 3, 4].map(mark => (
            <span key={mark} className="size-1 rounded-full bg-muted-foreground" />
          ))}
        </span>
      </Slider>
    </div>
  )
}
```

## Range

Use an array with two values for a range slider.

```tsx
import { Slider } from '../ui/slider'

export function SliderRange() {
  return <Slider defaultValue={[25, 50]} max={100} step={5} className="mx-auto w-full max-w-xs" />
}
```

## Multiple Thumbs

Use an array with multiple values for multiple thumbs.

```tsx
import { Slider } from '../ui/slider'

export function SliderMultiple() {
  return (
    <Slider defaultValue={[10, 20, 70]} max={100} step={10} className="mx-auto w-full max-w-xs" />
  )
}
```

## Vertical

Use `orientation="vertical"` for a vertical slider.

```tsx
import { Slider } from '../ui/slider'

export function SliderVertical() {
  return (
    <div className="mx-auto flex w-full max-w-xs items-center justify-center gap-6">
      <Slider defaultValue={[50]} max={100} step={1} orientation="vertical" className="h-40" />
      <Slider defaultValue={[25]} max={100} step={1} orientation="vertical" className="h-40" />
    </div>
  )
}
```

## Controlled

```tsx
'use client'

import * as React from 'react'

import { Label } from '../ui/label'
import { Slider } from '../ui/slider'

export function SliderControlled() {
  const [value, setValue] = React.useState([0.3, 0.7])

  return (
    <div className="mx-auto grid w-full max-w-xs gap-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="slider-demo-temperature">Temperature</Label>
        <span className="text-sm text-muted-foreground">{value.join(', ')}</span>
      </div>
      <Slider
        id="slider-demo-temperature"
        value={value}
        onValueChange={value => setValue(value as number[])}
        min={0}
        max={1}
        step={0.1}
      />
    </div>
  )
}
```

## Disabled

Use the `disabled` prop to disable the slider.

```tsx
import { Slider } from '../ui/slider'

export function SliderDisabled() {
  return (
    <Slider defaultValue={[50]} max={100} step={1} disabled className="mx-auto w-full max-w-xs" />
  )
}
```

## API Reference

See the [Base UI Slider](https://base-ui.com/react/components/slider#api-reference) documentation.
