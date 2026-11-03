---
title: Textarea
description: Displays a form textarea or a component that looks like a textarea.
base: base
component: true
---

Some examples also use `button`, `field`. Install the ones you need with `quint ui-components add button field --install`.

```tsx
import { Textarea } from '../ui/textarea'

export function TextareaDemo() {
  return <Textarea placeholder="Type your message here." />
}
```

## Installation

Use `quint ui-components add textarea --install`.

## Usage

```tsx
import { Textarea } from '../ui/textarea'
```

```tsx
<Textarea />
```

## Field

Use `Field`, `FieldLabel`, and `FieldDescription` to create a textarea with a label and description.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Textarea } from '../ui/textarea'

export function TextareaField() {
  return (
    <Field>
      <FieldLabel htmlFor="textarea-message">Message</FieldLabel>
      <FieldDescription>Enter your message below.</FieldDescription>
      <Textarea id="textarea-message" placeholder="Type your message here." />
    </Field>
  )
}
```

## Disabled

Use the `disabled` prop to disable the textarea. To style the disabled state, add the `data-disabled` attribute to the `Field` component.

```tsx
import { Field, FieldLabel } from '../ui/field'
import { Textarea } from '../ui/textarea'

export function TextareaDisabled() {
  return (
    <Field data-disabled>
      <FieldLabel htmlFor="textarea-disabled">Message</FieldLabel>
      <Textarea id="textarea-disabled" placeholder="Type your message here." disabled />
    </Field>
  )
}
```

## Invalid

Use the `aria-invalid` prop to mark the textarea as invalid. To style the invalid state, add the `data-invalid` attribute to the `Field` component.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Textarea } from '../ui/textarea'

export function TextareaInvalid() {
  return (
    <Field data-invalid>
      <FieldLabel htmlFor="textarea-invalid">Message</FieldLabel>
      <Textarea id="textarea-invalid" placeholder="Type your message here." aria-invalid />
      <FieldDescription>Please enter a valid message.</FieldDescription>
    </Field>
  )
}
```

## Button

Pair with `Button` to create a textarea with a submit button.

```tsx
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

export function TextareaButton() {
  return (
    <div className="grid w-full gap-2">
      <Textarea placeholder="Type your message here." />
      <Button>Send message</Button>
    </div>
  )
}
```
