---
title: Button Group
description: A container that groups related buttons together with consistent styling.
base: base
component: true
---

Some examples also use `button`, `dropdown-menu`, `field`, `input`, `input-group`, `label`, `popover`, `select`, `textarea`, `tooltip`. Install the ones you need with `quint ui-components add button dropdown-menu field input input-group label popover select textarea tooltip --install`.

```tsx
'use client'

import * as React from 'react'
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CalendarAddIcon,
  CheckReadIcon,
  ClockCircleIcon,
  FilterIcon,
  MenuDotsIcon,
  TagIcon,
  TrashBinMinimalisticIcon
} from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

export function ButtonGroupDemo() {
  const [label, setLabel] = React.useState('personal')

  return (
    <ButtonGroup>
      <ButtonGroup className="hidden sm:flex">
        <Button variant="outline" size="icon" aria-label="Go Back">
          <ArrowLeftIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">Archive</Button>
        <Button variant="outline">Report</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">Snooze</Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon" aria-label="More Options" />}
          >
            <MenuDotsIcon strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <CheckReadIcon strokeWidth={1.75} />
                Mark as Read
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ArchiveIcon strokeWidth={1.75} />
                Archive
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <ClockCircleIcon strokeWidth={1.75} />
                Snooze
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CalendarAddIcon strokeWidth={1.75} />
                Add to Calendar
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FilterIcon strokeWidth={1.75} />
                Add to List
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <TagIcon strokeWidth={1.75} />
                  Label As...
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={label} onValueChange={setLabel}>
                    <DropdownMenuRadioItem value="personal">Personal</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="work">Work</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="other">Other</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive">
                <TrashBinMinimalisticIcon strokeWidth={1.75} />
                Trash
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </ButtonGroup>
  )
}
```

## Installation

Use `quint ui-components add button-group --install`.

## Usage

```tsx
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '../ui/button-group'
```

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

## Composition

Use the following composition to build a `ButtonGroup`:

```text
ButtonGroup
├── Button or Input
├── ButtonGroupSeparator
└── ButtonGroupText
```

## Accessibility

- The `ButtonGroup` component has the `role` attribute set to `group`.
- Use <Kbd>Tab</Kbd> to navigate between the buttons in the group.
- Use `aria-label` or `aria-labelledby` to label the button group.

```tsx showLineNumbers
<ButtonGroup aria-label="Button group">
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

## ButtonGroup vs ToggleGroup

- Use the `ButtonGroup` component when you want to group buttons that perform an action.
- Use the `ToggleGroup` component when you want to group buttons that toggle a state.

## Orientation

Set the `orientation` prop to change the button group layout.

```tsx
import { AddIcon, MinusIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'

export function ButtonGroupOrientation() {
  return (
    <ButtonGroup orientation="vertical" aria-label="Media controls" className="h-fit">
      <Button variant="outline" size="icon">
        <AddIcon strokeWidth={1.5} />
      </Button>
      <Button variant="outline" size="icon">
        <MinusIcon strokeWidth={1.5} />
      </Button>
    </ButtonGroup>
  )
}
```

## Size

Control the size of buttons using the `size` prop on individual buttons.

```tsx
import { AddIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'

export function ButtonGroupSize() {
  return (
    <div className="flex flex-col items-start gap-8">
      <ButtonGroup>
        <Button variant="outline" size="sm">
          Small
        </Button>
        <Button variant="outline" size="sm">
          Button
        </Button>
        <Button variant="outline" size="sm">
          Group
        </Button>
        <Button variant="outline" size="icon-sm">
          <AddIcon strokeWidth={1.75} />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">Default</Button>
        <Button variant="outline">Button</Button>
        <Button variant="outline">Group</Button>
        <Button variant="outline" size="icon">
          <AddIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline" size="lg">
          Large
        </Button>
        <Button variant="outline" size="lg">
          Button
        </Button>
        <Button variant="outline" size="lg">
          Group
        </Button>
        <Button variant="outline" size="icon-lg">
          <AddIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
    </div>
  )
}
```

## Nested

Nest `<ButtonGroup>` components to create button groups with spacing.

```tsx
import { AddIcon, SoundwaveIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Input } from '../ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function ButtonGroupNested() {
  return (
    <ButtonGroup>
      <ButtonGroup>
        <Button variant="outline" size="icon">
          <AddIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <InputGroup>
          <InputGroupInput placeholder="Send a message..." />
          <Tooltip>
            <TooltipTrigger render={<InputGroupAddon align="inline-end" />}>
              <SoundwaveIcon strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>Voice Mode</TooltipContent>
          </Tooltip>
        </InputGroup>
      </ButtonGroup>
    </ButtonGroup>
  )
}
```

## Separator

The `ButtonGroupSeparator` component visually divides buttons within a group.

Buttons with variant `outline` do not need a separator since they have a border. For other variants, a separator is recommended to improve the visual hierarchy.

```tsx
import { Button } from '../ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '../ui/button-group'

export function ButtonGroupSeparatorDemo() {
  return (
    <ButtonGroup>
      <Button variant="secondary" size="sm">
        Copy
      </Button>
      <ButtonGroupSeparator />
      <Button variant="secondary" size="sm">
        Paste
      </Button>
    </ButtonGroup>
  )
}
```

## Split

Create a split button group by adding two buttons separated by a `ButtonGroupSeparator`.

```tsx
import { AddIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '../ui/button-group'

export function ButtonGroupSplit() {
  return (
    <ButtonGroup>
      <Button variant="secondary">Button</Button>
      <ButtonGroupSeparator />
      <Button size="icon" variant="secondary">
        <AddIcon strokeWidth={1.5} />
      </Button>
    </ButtonGroup>
  )
}
```

## Input

Wrap an `Input` component with buttons.

```tsx
import { MagnifierIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Input } from '../ui/input'

export function ButtonGroupInput() {
  return (
    <ButtonGroup>
      <Input placeholder="Search..." />
      <Button variant="outline" aria-label="Search">
        <MagnifierIcon strokeWidth={1.5} />
      </Button>
    </ButtonGroup>
  )
}
```

## Input Group

Wrap an `InputGroup` component to create complex input layouts.

```tsx
'use client'

import * as React from 'react'
import { AddIcon, SoundwaveIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '../ui/input-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export function ButtonGroupInputGroup() {
  const [voiceEnabled, setVoiceEnabled] = React.useState(false)

  return (
    <ButtonGroup className="[--radius:9999rem]">
      <ButtonGroup>
        <Button variant="outline" size="icon">
          <AddIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <InputGroup>
          <InputGroupInput
            placeholder={voiceEnabled ? 'Record and send audio...' : 'Send a message...'}
            disabled={voiceEnabled}
          />
          <InputGroupAddon align="inline-end">
            <Tooltip>
              <TooltipTrigger
                render={
                  <InputGroupButton
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    size="icon-xs"
                    data-active={voiceEnabled}
                    className="data-[active=true]:bg-orange-100 data-[active=true]:text-orange-700 dark:data-[active=true]:bg-orange-800 dark:data-[active=true]:text-orange-100"
                    aria-pressed={voiceEnabled}
                  />
                }
              >
                <SoundwaveIcon strokeWidth={1.5} />
              </TooltipTrigger>
              <TooltipContent>Voice Mode</TooltipContent>
            </Tooltip>
          </InputGroupAddon>
        </InputGroup>
      </ButtonGroup>
    </ButtonGroup>
  )
}
```

## Dropdown Menu

Create a split button group with a `DropdownMenu` component.

```tsx
'use client'

import {
  AltArrowDownIcon,
  CheckIcon,
  CopyIcon,
  DangerTriangleIcon,
  ShareIcon,
  TrashBinMinimalisticIcon,
  UserCrossIcon,
  VolumeCrossIcon
} from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'

export function ButtonGroupDropdown() {
  return (
    <ButtonGroup>
      <Button variant="outline">Follow</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="pl-2!" />}>
          <AltArrowDownIcon strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <VolumeCrossIcon strokeWidth={1.75} />
              Mute Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CheckIcon strokeWidth={1.75} />
              Mark as Read
            </DropdownMenuItem>
            <DropdownMenuItem>
              <DangerTriangleIcon strokeWidth={1.75} />
              Report Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <UserCrossIcon strokeWidth={1.75} />
              Block User
            </DropdownMenuItem>
            <DropdownMenuItem>
              <ShareIcon strokeWidth={1.75} />
              Share Conversation
            </DropdownMenuItem>
            <DropdownMenuItem>
              <CopyIcon strokeWidth={1.75} />
              Copy Conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">
              <TrashBinMinimalisticIcon strokeWidth={1.75} />
              Delete Conversation
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
```

## Select

Pair with a `Select` component.

```tsx
'use client'

import * as React from 'react'
import { ArrowRightIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '../ui/select'

const CURRENCIES = [
  { label: 'US Dollar', value: '$' },
  { label: 'Euro', value: '€' },
  { label: 'British Pound', value: '£' }
]

export function ButtonGroupSelect() {
  const [currency, setCurrency] = React.useState('$')

  return (
    <ButtonGroup>
      <ButtonGroup>
        <Select
          items={CURRENCIES}
          value={currency}
          onValueChange={value => setCurrency(value as string)}
        >
          <SelectTrigger className="font-mono">{currency}</SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            <SelectGroup>
              {CURRENCIES.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.value} <span className="text-muted-foreground">{item.label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input placeholder="10.00" pattern="[0-9]*" />
      </ButtonGroup>
      <ButtonGroup>
        <Button aria-label="Send" size="icon" variant="outline">
          <ArrowRightIcon strokeWidth={1.5} />
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  )
}
```

## Popover

Use with a `Popover` component.

```tsx
import { AltArrowDownIcon, BotIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '../ui/popover'
import { Textarea } from '../ui/textarea'

export function ButtonGroupPopover() {
  return (
    <ButtonGroup>
      <Button variant="outline">
        <BotIcon strokeWidth={1.5} /> Copilot
      </Button>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="icon" aria-label="Open Popover" />}>
          <AltArrowDownIcon strokeWidth={1.5} />
        </PopoverTrigger>
        <PopoverContent align="end" className="rounded-xl text-sm">
          <PopoverHeader>
            <PopoverTitle>Start a new task with Copilot</PopoverTitle>
            <PopoverDescription>Describe your task in natural language.</PopoverDescription>
          </PopoverHeader>
          <Field>
            <FieldLabel htmlFor="task" className="sr-only">
              Task Description
            </FieldLabel>
            <Textarea id="task" placeholder="I need to..." className="resize-none" />
            <FieldDescription>Copilot will open a pull request for review.</FieldDescription>
          </Field>
        </PopoverContent>
      </Popover>
    </ButtonGroup>
  )
}
```

## API Reference

### ButtonGroup

The `ButtonGroup` component is a container that groups related buttons together with consistent styling.

| Prop          | Type                         | Default        |
| ------------- | ---------------------------- | -------------- |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` |

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <Button>Button 2</Button>
</ButtonGroup>
```

Nest multiple button groups to create complex layouts with spacing. See the [nested](#nested) example for more details.

```tsx
<ButtonGroup>
  <ButtonGroup />
  <ButtonGroup />
</ButtonGroup>
```

### ButtonGroupSeparator

The `ButtonGroupSeparator` component visually divides buttons within a group.

| Prop          | Type                         | Default      |
| ------------- | ---------------------------- | ------------ |
| `orientation` | `"horizontal" \| "vertical"` | `"vertical"` |

```tsx
<ButtonGroup>
  <Button>Button 1</Button>
  <ButtonGroupSeparator />
  <Button>Button 2</Button>
</ButtonGroup>
```

### ButtonGroupText

Use this component to display text within a button group.

| Prop     | Type                 | Default |
| -------- | -------------------- | ------- |
| `render` | `React.ReactElement` |         |

```tsx
<ButtonGroup>
  <ButtonGroupText>Text</ButtonGroupText>
  <Button>Button</Button>
</ButtonGroup>
```

Use the `render` prop to render a custom component as the text, for example a label.

```tsx showLineNumbers
import { ButtonGroup, ButtonGroupText } from '../ui/button-group'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export function ButtonGroupTextDemo() {
  return (
    <ButtonGroup>
      <ButtonGroupText render={<Label htmlFor="name" />}>Text</ButtonGroupText>
      <Input placeholder="Type something here..." id="name" />
    </ButtonGroup>
  )
}
```
