---
title: Checkbox
description: A control that allows the user to toggle between checked and not checked.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/checkbox
  api: https://base-ui.com/react/components/checkbox#api-reference
---

Some examples also use `field`, `label`, `table`. Install the ones you need with `quint ui-components add field label table --install`.

```tsx
'use client'

import { Checkbox } from '../ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '../ui/field'
import { Label } from '../ui/label'

export function CheckboxDemo() {
  return (
    <FieldGroup className="max-w-sm">
      <Field orientation="horizontal">
        <Checkbox id="terms-checkbox" name="terms-checkbox" />
        <Label htmlFor="terms-checkbox">Accept terms and conditions</Label>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id="terms-checkbox-2" name="terms-checkbox-2" defaultChecked />
        <FieldContent>
          <FieldLabel htmlFor="terms-checkbox-2">Accept terms and conditions</FieldLabel>
          <FieldDescription>By clicking this checkbox, you agree to the terms.</FieldDescription>
        </FieldContent>
      </Field>
      <Field orientation="horizontal" data-disabled>
        <Checkbox id="toggle-checkbox" name="toggle-checkbox" disabled />
        <FieldLabel htmlFor="toggle-checkbox">Enable notifications</FieldLabel>
      </Field>
      <FieldLabel>
        <Field orientation="horizontal">
          <Checkbox id="toggle-checkbox-2" name="toggle-checkbox-2" />
          <FieldContent>
            <FieldTitle>Enable notifications</FieldTitle>
            <FieldDescription>
              You can enable or disable notifications at any time.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldLabel>
    </FieldGroup>
  )
}
```

## Installation

Use `quint ui-components add checkbox --install`.

## Usage

```tsx
import { Checkbox } from '../ui/checkbox'
```

```tsx
<Checkbox />
```

## Checked State

Use `defaultChecked` for uncontrolled checkboxes, or `checked` and
`onCheckedChange` to control the state.

```tsx showLineNumbers
import * as React from 'react'
import { Checkbox } from '../ui/checkbox'

export function Example() {
  const [checked, setChecked] = React.useState(false)

  return <Checkbox checked={checked} onCheckedChange={setChecked} />
}
```

## Invalid State

Set `aria-invalid` on the checkbox and `data-invalid` on the field wrapper to
show the invalid styles.

```tsx
import { Checkbox } from '../ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '../ui/field'

export function CheckboxInvalid() {
  return (
    <FieldGroup className="mx-auto w-56">
      <Field orientation="horizontal" data-invalid>
        <Checkbox id="terms-checkbox-invalid" name="terms-checkbox-invalid" aria-invalid />
        <FieldLabel htmlFor="terms-checkbox-invalid">Accept terms and conditions</FieldLabel>
      </Field>
    </FieldGroup>
  )
}
```

## Basic

Pair the checkbox with `Field` and `FieldLabel` for proper layout and labeling.

```tsx
import { Checkbox } from '../ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '../ui/field'

export function CheckboxBasic() {
  return (
    <FieldGroup className="mx-auto w-56">
      <Field orientation="horizontal">
        <Checkbox id="terms-checkbox-basic" name="terms-checkbox-basic" />
        <FieldLabel htmlFor="terms-checkbox-basic">Accept terms and conditions</FieldLabel>
      </Field>
    </FieldGroup>
  )
}
```

## Description

Use `FieldContent` and `FieldDescription` for helper text.

```tsx
import { Checkbox } from '../ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '../ui/field'

export function CheckboxDescription() {
  return (
    <FieldGroup className="mx-auto w-72">
      <Field orientation="horizontal">
        <Checkbox id="terms-checkbox-desc" name="terms-checkbox-desc" defaultChecked />
        <FieldContent>
          <FieldLabel htmlFor="terms-checkbox-desc">Accept terms and conditions</FieldLabel>
          <FieldDescription>
            By clicking this checkbox, you agree to the terms and conditions.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  )
}
```

## Disabled

Use the `disabled` prop to prevent interaction and add the `data-disabled` attribute to the `<Field>` component for disabled styles.

```tsx
import { Checkbox } from '../ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '../ui/field'

export function CheckboxDisabled() {
  return (
    <FieldGroup className="mx-auto w-56">
      <Field orientation="horizontal" data-disabled>
        <Checkbox id="toggle-checkbox-disabled" name="toggle-checkbox-disabled" disabled />
        <FieldLabel htmlFor="toggle-checkbox-disabled">Enable notifications</FieldLabel>
      </Field>
    </FieldGroup>
  )
}
```

## Group

Use multiple fields to create a checkbox list.

```tsx
import { Checkbox } from '../ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '../ui/field'

export function CheckboxGroup() {
  return (
    <FieldSet>
      <FieldLegend variant="label">Show these items on the desktop:</FieldLegend>
      <FieldDescription>Select the items you want to show on the desktop.</FieldDescription>
      <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <Checkbox
            id="finder-pref-9k2-hard-disks-ljj-checkbox"
            name="finder-pref-9k2-hard-disks-ljj-checkbox"
            defaultChecked
          />
          <FieldLabel htmlFor="finder-pref-9k2-hard-disks-ljj-checkbox" className="font-normal">
            Hard disks
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="finder-pref-9k2-external-disks-1yg-checkbox"
            name="finder-pref-9k2-external-disks-1yg-checkbox"
            defaultChecked
          />
          <FieldLabel htmlFor="finder-pref-9k2-external-disks-1yg-checkbox" className="font-normal">
            External disks
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="finder-pref-9k2-cds-dvds-fzt-checkbox"
            name="finder-pref-9k2-cds-dvds-fzt-checkbox"
          />
          <FieldLabel htmlFor="finder-pref-9k2-cds-dvds-fzt-checkbox" className="font-normal">
            CDs, DVDs, and iPods
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="finder-pref-9k2-connected-servers-6l2-checkbox"
            name="finder-pref-9k2-connected-servers-6l2-checkbox"
          />
          <FieldLabel
            htmlFor="finder-pref-9k2-connected-servers-6l2-checkbox"
            className="font-normal"
          >
            Connected servers
          </FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}
```

## Table

```tsx
'use client'

import * as React from 'react'

import { Checkbox } from '../ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

const tableData = [
  {
    id: '1',
    name: 'Sarah Chen',
    email: 'sarah.chen@example.com',
    role: 'Admin'
  },
  {
    id: '2',
    name: 'Marcus Rodriguez',
    email: 'marcus.rodriguez@example.com',
    role: 'User'
  },
  {
    id: '3',
    name: 'Priya Patel',
    email: 'priya.patel@example.com',
    role: 'User'
  },
  {
    id: '4',
    name: 'David Kim',
    email: 'david.kim@example.com',
    role: 'Editor'
  }
]

export function CheckboxInTable() {
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set(['1']))

  const selectAll = selectedRows.size === tableData.length

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(tableData.map(row => row.id)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedRows)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedRows(newSelected)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <Checkbox
              id="select-all-checkbox"
              name="select-all-checkbox"
              checked={selectAll}
              onCheckedChange={handleSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tableData.map(row => (
          <TableRow key={row.id} data-state={selectedRows.has(row.id) ? 'selected' : undefined}>
            <TableCell>
              <Checkbox
                id={`row-${row.id}-checkbox`}
                name={`row-${row.id}-checkbox`}
                checked={selectedRows.has(row.id)}
                onCheckedChange={checked => handleSelectRow(row.id, checked === true)}
              />
            </TableCell>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{row.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

## API Reference

See the [Base UI](https://base-ui.com/react/components/checkbox#api-reference) documentation for more information.
