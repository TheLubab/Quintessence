---
title: Collapsible
description: An interactive component which expands/collapses a panel.
base: base
component: true
featured: true
links:
  doc: https://base-ui.com/react/components/collapsible
  api: https://base-ui.com/react/components/collapsible#api-reference
---

Some examples also use `button`, `card`, `field`, `input`, `tabs`. Install the ones you need with `quint ui-components add button card field input tabs --install`.


```tsx
'use client'

import * as React from 'react'
import { AltArrowDownIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

export function CollapsibleDemo() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex w-[350px] flex-col gap-2">
      <div className="flex items-center justify-between gap-4 px-4">
        <h4 className="text-sm font-semibold">Order #4189</h4>
        <CollapsibleTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
          <AltArrowDownIcon strokeWidth={1.5} />
          <span className="sr-only">Toggle details</span>
        </CollapsibleTrigger>
      </div>
      <div className="flex items-center justify-between rounded-md border px-4 py-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <span className="font-medium">Shipped</span>
      </div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-4 py-2 text-sm">
          <p className="font-medium">Shipping address</p>
          <p className="text-muted-foreground">100 Market St, San Francisco</p>
        </div>
        <div className="rounded-md border px-4 py-2 text-sm">
          <p className="font-medium">Items</p>
          <p className="text-muted-foreground">2x Studio Headphones</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
```

## Installation

Use `quint ui-components add collapsible --install`.

## Usage

```tsx showLineNumbers
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
```

```tsx showLineNumbers
<Collapsible>
  <CollapsibleTrigger>Can I use this in my project?</CollapsibleTrigger>
  <CollapsibleContent>
    Yes. Free to use for personal and commercial projects. No attribution required.
  </CollapsibleContent>
</Collapsible>
```

## Composition

Use the following composition to build a `Collapsible`:

```text
Collapsible
├── CollapsibleTrigger
└── CollapsibleContent
```

## Controlled State

Use the `open` and `onOpenChange` props to control the state.

```tsx showLineNumbers
import * as React from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

export function Example() {
  const [open, setOpen] = React.useState(false)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent>Content</CollapsibleContent>
    </Collapsible>
  )
}
```

## Basic

```tsx
import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'

export function CollapsibleBasic() {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardContent>
        <Collapsible className="rounded-md data-open:bg-muted">
          <CollapsibleTrigger render={<Button variant="ghost" className="w-full" />}>
            Product details
            <AltArrowDownIcon
              strokeWidth={1.5}
              className="ml-auto group-data-panel-open/button:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col items-start gap-2 p-2.5 pt-0 text-sm">
            <div>This panel can be expanded or collapsed to reveal additional content.</div>
            <Button size="xs">Learn More</Button>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
```

## Settings Panel

Use a trigger button to reveal additional settings.

```tsx
'use client'

import * as React from 'react'
import { MaximizeIcon, MinimizeIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Field, FieldGroup, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function CollapsibleSettings() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Card className="mx-auto w-full max-w-xs" size="sm">
      <CardHeader>
        <CardTitle>Radius</CardTitle>
        <CardDescription>Set the corner radius of the element.</CardDescription>
      </CardHeader>
      <CardContent>
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex items-start gap-2">
          <FieldGroup className="grid w-full grid-cols-2 gap-2">
            <Field>
              <FieldLabel htmlFor="radius-x" className="sr-only">
                Radius X
              </FieldLabel>
              <Input id="radius" placeholder="0" defaultValue={0} />
            </Field>
            <Field>
              <FieldLabel htmlFor="radius-y" className="sr-only">
                Radius Y
              </FieldLabel>
              <Input id="radius" placeholder="0" defaultValue={0} />
            </Field>
            <CollapsibleContent className="col-span-full grid grid-cols-subgrid gap-2">
              <Field>
                <FieldLabel htmlFor="radius-x" className="sr-only">
                  Radius X
                </FieldLabel>
                <Input id="radius" placeholder="0" defaultValue={0} />
              </Field>
              <Field>
                <FieldLabel htmlFor="radius-y" className="sr-only">
                  Radius Y
                </FieldLabel>
                <Input id="radius" placeholder="0" defaultValue={0} />
              </Field>
            </CollapsibleContent>
          </FieldGroup>
          <CollapsibleTrigger render={<Button variant="outline" size="icon" />}>
            {isOpen ? <MinimizeIcon strokeWidth={1.5} /> : <MaximizeIcon strokeWidth={1.5} />}
          </CollapsibleTrigger>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
```

## File Tree

Use nested collapsibles to build a file tree.

```tsx
import { AltArrowRightIcon, FileIcon, FolderIcon } from '@solar-icons/react/linear'

import { Button } from '../ui/button'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

type FileTreeItem = { name: string } | { name: string; items: FileTreeItem[] }

export function CollapsibleFileTree() {
  const fileTree: FileTreeItem[] = [
    {
      name: 'components',
      items: [
        {
          name: 'ui',
          items: [
            { name: 'button.tsx' },
            { name: 'card.tsx' },
            { name: 'dialog.tsx' },
            { name: 'input.tsx' },
            { name: 'select.tsx' },
            { name: 'table.tsx' }
          ]
        },
        { name: 'login-form.tsx' },
        { name: 'register-form.tsx' }
      ]
    },
    {
      name: 'lib',
      items: [{ name: 'utils.ts' }, { name: 'cn.ts' }, { name: 'api.ts' }]
    },
    {
      name: 'hooks',
      items: [
        { name: 'use-media-query.ts' },
        { name: 'use-debounce.ts' },
        { name: 'use-local-storage.ts' }
      ]
    },
    {
      name: 'types',
      items: [{ name: 'index.d.ts' }, { name: 'api.d.ts' }]
    },
    {
      name: 'public',
      items: [{ name: 'favicon.ico' }, { name: 'logo.svg' }, { name: 'images' }]
    },
    { name: 'app.tsx' },
    { name: 'layout.tsx' },
    { name: 'globals.css' },
    { name: 'package.json' },
    { name: 'tsconfig.json' },
    { name: 'README.md' },
    { name: '.gitignore' }
  ]

  const renderItem = (fileItem: FileTreeItem) => {
    if ('items' in fileItem) {
      return (
        <Collapsible key={fileItem.name}>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="group w-full justify-start transition-none hover:bg-accent hover:text-accent-foreground"
              />
            }
          >
            <AltArrowRightIcon
              strokeWidth={1.75}
              className="transition-transform group-data-[state=open]:rotate-90"
            />
            <FolderIcon strokeWidth={1.75} />
            {fileItem.name}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 ml-5 style-lyra:ml-4">
            <div className="flex flex-col gap-1">
              {fileItem.items.map(child => renderItem(child))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )
    }
    return (
      <Button
        key={fileItem.name}
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-foreground"
      >
        <FileIcon strokeWidth={1.75} />
        <span>{fileItem.name}</span>
      </Button>
    )
  }

  return (
    <Card className="mx-auto w-full max-w-[16rem] gap-2" size="sm">
      <CardHeader>
        <Tabs defaultValue="explorer">
          <TabsList className="w-full">
            <TabsTrigger value="explorer">Explorer</TabsTrigger>
            <TabsTrigger value="settings">Outline</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1">{fileTree.map(item => renderItem(item))}</div>
      </CardContent>
    </Card>
  )
}
```

## API Reference

See the [Base UI](https://base-ui.com/react/components/collapsible#api-reference) documentation for more information.
