---
title: Avatar
description: An image element with a fallback for representing the user.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/avatar
  api: https://base-ui.com/react/components/avatar#api-reference
---

Some examples also use `button`, `dropdown-menu`. Install the ones you need with `quint ui-components add button dropdown-menu --install`.

```tsx
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage
} from '../ui/avatar'

export function AvatarDemo() {
  return (
    <div className="flex flex-row flex-wrap items-center gap-6 md:gap-12">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" className="grayscale" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/evilrabbit.png" alt="@evilrabbit" />
        <AvatarFallback>ER</AvatarFallback>
        <AvatarBadge className="bg-green-600 dark:bg-green-800" />
      </Avatar>
      <AvatarGroup className="grayscale">
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarImage src="https://github.com/maxleiter.png" alt="@maxleiter" />
          <AvatarFallback>LR</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarImage src="https://github.com/evilrabbit.png" alt="@evilrabbit" />
          <AvatarFallback>ER</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    </div>
  )
}
```

## Installation

Use `quint ui-components add avatar --install`.

## Usage

```tsx showLineNumbers
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
```

```tsx showLineNumbers
<Avatar>
  <AvatarImage src="https://github.com/shadcn.png" />
  <AvatarFallback>CN</AvatarFallback>
</Avatar>
```

## Composition

Use the following composition to build an `Avatar`:

```text
Avatar
├── AvatarImage
├── AvatarFallback
└── AvatarBadge
```

Use the following composition to build an `AvatarGroup`:

```text
AvatarGroup
├── Avatar
│   ├── AvatarImage
│   ├── AvatarFallback
│   └── AvatarBadge
├── Avatar
│   ├── AvatarImage
│   ├── AvatarFallback
│   └── AvatarBadge
└── AvatarGroupCount
```

## Basic

A basic avatar component with an image and a fallback.

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

export function AvatarDemo() {
  return (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" className="grayscale" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  )
}
```

## Badge

Use the `AvatarBadge` component to add a badge to the avatar. The badge is positioned at the bottom right of the avatar.

```tsx
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '../ui/avatar'

export function AvatarWithBadge() {
  return (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
      <AvatarBadge className="bg-green-600 dark:bg-green-800" />
    </Avatar>
  )
}
```

Use the `className` prop to add custom styles to the badge such as custom colors, sizes, etc.

```tsx showLineNumbers
<Avatar>
  <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
  <AvatarFallback>CN</AvatarFallback>
  <AvatarBadge className="bg-green-600 dark:bg-green-800" />
</Avatar>
```

## Avatar Group

Use the `AvatarGroup` component to add a group of avatars.

```tsx
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '../ui/avatar'

export function AvatarGroupExample() {
  return (
    <AvatarGroup className="grayscale">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/maxleiter.png" alt="@maxleiter" />
        <AvatarFallback>LR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/evilrabbit.png" alt="@evilrabbit" />
        <AvatarFallback>ER</AvatarFallback>
      </Avatar>
    </AvatarGroup>
  )
}
```

## Avatar Group Count

Use `<AvatarGroupCount>` to add a count to the group.

```tsx
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '../ui/avatar'

export function AvatarGroupCountExample() {
  return (
    <AvatarGroup className="grayscale">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/maxleiter.png" alt="@maxleiter" />
        <AvatarFallback>LR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/evilrabbit.png" alt="@evilrabbit" />
        <AvatarFallback>ER</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  )
}
```

## Avatar Group with Icon

You can also use an icon inside `<AvatarGroupCount>`.

```tsx
import { AddIcon } from '@solar-icons/react/linear'

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from '../ui/avatar'

export function AvatarGroupCountIconExample() {
  return (
    <AvatarGroup className="grayscale">
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/maxleiter.png" alt="@maxleiter" />
        <AvatarFallback>LR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/evilrabbit.png" alt="@evilrabbit" />
        <AvatarFallback>ER</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>
        <AddIcon strokeWidth={1.75} />
      </AvatarGroupCount>
    </AvatarGroup>
  )
}
```

## Sizes

Use the `size` prop to change the size of the avatar and the group count.

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'

export function AvatarSizeExample() {
  return (
    <div className="flex flex-wrap items-center gap-2 grayscale">
      <Avatar size="sm">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    </div>
  )
}
```

## Dropdown

You can use the `Avatar` component as a trigger for a dropdown menu.

```tsx
'use client'

import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

export function AvatarDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" />}>
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-32">
        <DropdownMenuGroup>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Billing</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive">Log out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

## API Reference

### Avatar

The `Avatar` component is the root component that wraps the avatar image and fallback.

| Prop        | Type                                | Default     |
| ----------- | ----------------------------------- | ----------- |
| `size`      | `"default" \| "sm" \| "lg" \| "xs"` | `"default"` |
| `className` | `string`                            | -           |

### AvatarImage

The `AvatarImage` component displays the avatar image. It accepts all Base UI Avatar Image props.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `src`       | `string` | -       |
| `alt`       | `string` | -       |
| `className` | `string` | -       |

### AvatarFallback

The `AvatarFallback` component displays a fallback when the image fails to load. It accepts all Base UI Avatar Fallback props.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarBadge

The `AvatarBadge` component displays a badge indicator on the avatar, typically positioned at the bottom right.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarGroup

The `AvatarGroup` component displays a group of avatars with overlapping styling.

Use the same size for all avatars and the count in a group. Transparent cutouts separate overlapping avatars, so the gaps show the surrounding background.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AvatarGroupCount

The `AvatarGroupCount` component displays a count indicator in an avatar group, typically showing the number of additional avatars.

| Prop        | Type                                | Default     |
| ----------- | ----------------------------------- | ----------- |
| `className` | `string`                            | -           |
| `size`      | `"xs" \| "sm" \| "default" \| "lg"` | `"default"` |

For more information about Base UI Avatar props, see the [Base UI documentation](https://base-ui.com/react/components/avatar#api-reference).
