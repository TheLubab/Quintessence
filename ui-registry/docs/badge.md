---
title: Badge
description: Displays a badge or a component that looks like a badge.
base: base
component: true
---

Some examples also use `spinner`. Install the ones you need with `quint ui-components add spinner --install`.

```tsx
import { Badge } from '../ui/badge'

export function BadgeDemo() {
  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      <Badge>Badge</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  )
}
```

## Installation

Use `quint ui-components add badge --install`.

## Usage

```tsx
import { Badge } from '../ui/badge'
```

```tsx
<Badge variant="default | outline | secondary | destructive">Badge</Badge>
```

## Variants

Use the `variant` prop to change the variant of the badge.

```tsx
import { Badge } from '../ui/badge'

export function BadgeVariants() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="ghost">Ghost</Badge>
    </div>
  )
}
```

## With Icon

You can render an icon inside the badge. Use `data-icon="inline-start"` to render the icon on the left and `data-icon="inline-end"` to render the icon on the right.

```tsx
import { BookmarkIcon, VerifiedCheckIcon } from '@solar-icons/react/linear'

import { Badge } from '../ui/badge'

export function BadgeWithIconLeft() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="secondary">
        <VerifiedCheckIcon strokeWidth={1.75} data-icon="inline-start" />
        Verified
      </Badge>
      <Badge variant="outline">
        Bookmark
        <BookmarkIcon strokeWidth={1.75} data-icon="inline-end" />
      </Badge>
    </div>
  )
}
```

## With Spinner

You can render a spinner inside the badge. Remember to add the `data-icon="inline-start"` or `data-icon="inline-end"` prop to the spinner.

```tsx
import { Badge } from '../ui/badge'
import { Spinner } from '../ui/spinner'

export function BadgeWithSpinner() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="destructive">
        <Spinner strokeWidth={1.75} data-icon="inline-start" />
        Deleting
      </Badge>
      <Badge variant="secondary">
        Generating
        <Spinner strokeWidth={1.75} data-icon="inline-end" />
      </Badge>
    </div>
  )
}
```

## Link

Use the `render` prop to render a link as a badge.

```tsx
import { ArrowRightUpIcon } from '@solar-icons/react/linear'

import { Badge } from '../ui/badge'

export function BadgeAsLink() {
  return (
    <Badge render={<a href="#link" />}>
      Open Link <ArrowRightUpIcon strokeWidth={1.5} data-icon="inline-end" />
    </Badge>
  )
}
```

## Custom Colors

You can customize the colors of a badge by adding custom classes such as `bg-green-50 dark:bg-green-800` to the `Badge` component.

```tsx
import { Badge } from '../ui/badge'

export function BadgeCustomColors() {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Blue</Badge>
      <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
        Green
      </Badge>
      <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">Sky</Badge>
      <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
        Purple
      </Badge>
      <Badge className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">Red</Badge>
    </div>
  )
}
```

## API Reference

### Badge

The `Badge` component displays a badge or a component that looks like a badge.

| Prop        | Type                                                                          | Default     |
| ----------- | ----------------------------------------------------------------------------- | ----------- |
| `variant`   | `"default" \| "secondary" \| "destructive" \| "outline" \| "ghost" \| "link"` | `"default"` |
| `className` | `string`                                                                      | -           |
