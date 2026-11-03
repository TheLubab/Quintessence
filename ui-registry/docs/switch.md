---
title: Switch
description: A control that allows the user to toggle between checked and not checked.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/switch
  api: https://base-ui.com/react/components/switch#api-reference
---

Some examples also use `field`, `label`. Install the ones you need with `quint ui-components add field label --install`.

```tsx
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

export function SwitchDemo() {
  return (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  )
}
```

## Installation

Use `quint ui-components add switch --install`.

## Usage

```tsx
import { Switch } from '../ui/switch'
```

```tsx
<Switch />
```

## Description

```tsx
import { Field, FieldContent, FieldDescription, FieldLabel } from '../ui/field'
import { Switch } from '../ui/switch'

export function SwitchDescription() {
  return (
    <Field orientation="horizontal" className="max-w-sm">
      <FieldContent>
        <FieldLabel htmlFor="switch-focus-mode">Share across devices</FieldLabel>
        <FieldDescription>
          Focus is shared across devices, and turns off when you leave the app.
        </FieldDescription>
      </FieldContent>
      <Switch id="switch-focus-mode" />
    </Field>
  )
}
```

## Choice Card

Card-style selection where `FieldLabel` wraps the entire `Field` for a clickable card pattern.

```tsx
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '../ui/field'
import { Switch } from '../ui/switch'

export function SwitchChoiceCard() {
  return (
    <FieldGroup className="w-full max-w-sm">
      <FieldLabel htmlFor="switch-share">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Share across devices</FieldTitle>
            <FieldDescription>
              Focus is shared across devices, and turns off when you leave the app.
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-share" />
        </Field>
      </FieldLabel>
      <FieldLabel htmlFor="switch-notifications">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Enable notifications</FieldTitle>
            <FieldDescription>
              Receive notifications when focus mode is enabled or disabled.
            </FieldDescription>
          </FieldContent>
          <Switch id="switch-notifications" defaultChecked />
        </Field>
      </FieldLabel>
    </FieldGroup>
  )
}
```

## Disabled

Add the `disabled` prop to the `Switch` component to disable the switch. Add the `data-disabled` prop to the `Field` component for styling.

```tsx
import { Field, FieldLabel } from '../ui/field'
import { Switch } from '../ui/switch'

export function SwitchDisabled() {
  return (
    <Field orientation="horizontal" data-disabled className="w-fit">
      <Switch id="switch-disabled-unchecked" disabled />
      <FieldLabel htmlFor="switch-disabled-unchecked">Disabled</FieldLabel>
    </Field>
  )
}
```

## Invalid

Add the `aria-invalid` prop to the `Switch` component to indicate an invalid state. Add the `data-invalid` prop to the `Field` component for styling.

```tsx
import { Field, FieldContent, FieldDescription, FieldLabel } from '../ui/field'
import { Switch } from '../ui/switch'

export function SwitchInvalid() {
  return (
    <Field orientation="horizontal" className="max-w-sm" data-invalid>
      <FieldContent>
        <FieldLabel htmlFor="switch-terms">Accept terms and conditions</FieldLabel>
        <FieldDescription>You must accept the terms and conditions to continue.</FieldDescription>
      </FieldContent>
      <Switch id="switch-terms" aria-invalid />
    </Field>
  )
}
```

## API Reference

See the [Base UI Switch](https://base-ui.com/react/components/switch#api-reference) documentation.
