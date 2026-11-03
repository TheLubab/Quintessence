---
title: Progress
description: Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/progress
  api: https://base-ui.com/react/components/progress#api-reference
---

Some examples also use `slider`. Install the ones you need with `quint ui-components add slider --install`.

```tsx
'use client'

import * as React from 'react'

import { Progress } from '../ui/progress'

export function ProgressDemo() {
  const [progress, setProgress] = React.useState(13)

  React.useEffect(() => {
    const timer = setTimeout(() => setProgress(66), 500)
    return () => clearTimeout(timer)
  }, [])

  return <Progress value={progress} className="w-[60%]" />
}
```

## Installation

Use `quint ui-components add progress --install`.

## Usage

```tsx showLineNumbers
import { Progress } from '../ui/progress'
```

```tsx showLineNumbers
<Progress value={33} />
```

## Composition

### With label and value

Use `ProgressLabel` and `ProgressValue` to add a label and value display.

```tsx showLineNumbers
import { Progress, ProgressLabel, ProgressValue } from '../ui/progress'
;<Progress value={56} className="w-full max-w-sm">
  <ProgressLabel>Upload progress</ProgressLabel>
  <ProgressValue />
</Progress>
```

```text
Progress
├── ProgressLabel
├── ProgressValue
└── ProgressTrack
    └── ProgressIndicator
```

## Label

Use `ProgressLabel` and `ProgressValue` to add a label and value display.

```tsx
import { Progress, ProgressLabel, ProgressValue } from '../ui/progress'

export function ProgressWithLabel() {
  return (
    <Progress value={56} className="w-full max-w-sm">
      <ProgressLabel>Upload progress</ProgressLabel>
      <ProgressValue />
    </Progress>
  )
}
```

## Controlled

A progress bar that can be controlled by a slider.

```tsx
'use client'

import * as React from 'react'

import { Progress } from '../ui/progress'
import { Slider } from '../ui/slider'

export function ProgressControlled() {
  const [value, setValue] = React.useState(50)

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <Progress value={value} className="w-full" />
      <Slider
        value={value}
        onValueChange={value => setValue(value as number)}
        min={0}
        max={100}
        step={1}
      />
    </div>
  )
}
```

## API Reference

See the [Base UI Progress](https://base-ui.com/react/components/progress#api-reference) documentation.
