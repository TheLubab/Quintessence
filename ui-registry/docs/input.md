---
title: Input
description: A text input component for forms and user data entry with built-in styling and accessibility features.
base: base
component: true
---

Some examples also use `badge`, `button`, `button-group`, `field`, `input-group`, `select`. Install the ones you need with `quint ui-components add badge button button-group field input-group select --install`.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputDemo() {
  return (
    <Field>
      <FieldLabel htmlFor="input-demo-api-key">API Key</FieldLabel>
      <Input id="input-demo-api-key" type="password" placeholder="sk-..." />
      <FieldDescription>Your API key is encrypted and stored securely.</FieldDescription>
    </Field>
  )
}
```

## Installation

Use `quint ui-components add input --install`.

## Usage

```tsx
import { Input } from '../ui/input'
```

```tsx
<Input />
```

## Basic

```tsx
import { Input } from '../ui/input'

export function InputBasic() {
  return <Input placeholder="Enter text" />
}
```

## Field

Use `Field`, `FieldLabel`, and `FieldDescription` to create an input with a
label and description.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputField() {
  return (
    <Field>
      <FieldLabel htmlFor="input-field-username">Username</FieldLabel>
      <Input id="input-field-username" type="text" placeholder="Enter your username" />
      <FieldDescription>Choose a unique username for your account.</FieldDescription>
    </Field>
  )
}
```

## Field Group

Use `FieldGroup` to show multiple `Field` blocks and to build forms.

```tsx
import { Button } from '../ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputFieldgroup() {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="fieldgroup-name">Name</FieldLabel>
        <Input id="fieldgroup-name" placeholder="Jordan Lee" />
      </Field>
      <Field>
        <FieldLabel htmlFor="fieldgroup-email">Email</FieldLabel>
        <Input id="fieldgroup-email" type="email" placeholder="name@example.com" />
        <FieldDescription>We&apos;ll send updates to this address.</FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Button type="reset" variant="outline">
          Reset
        </Button>
        <Button type="submit">Submit</Button>
      </Field>
    </FieldGroup>
  )
}
```

## Disabled

Use the `disabled` prop to disable the input. To style the disabled state, add the `data-disabled` attribute to the `Field` component.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputDisabled() {
  return (
    <Field data-disabled>
      <FieldLabel htmlFor="input-demo-disabled">Email</FieldLabel>
      <Input id="input-demo-disabled" type="email" placeholder="Email" disabled />
      <FieldDescription>This field is currently disabled.</FieldDescription>
    </Field>
  )
}
```

## Invalid

Use the `aria-invalid` prop to mark the input as invalid. To style the invalid state, add the `data-invalid` attribute to the `Field` component.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputInvalid() {
  return (
    <Field data-invalid>
      <FieldLabel htmlFor="input-invalid">Invalid Input</FieldLabel>
      <Input id="input-invalid" placeholder="Error" aria-invalid />
      <FieldDescription>This field contains validation errors.</FieldDescription>
    </Field>
  )
}
```

## File

Use the `type="file"` prop to create a file input.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputFile() {
  return (
    <Field>
      <FieldLabel htmlFor="picture">Picture</FieldLabel>
      <Input id="picture" type="file" />
      <FieldDescription>Select a picture to upload.</FieldDescription>
    </Field>
  )
}
```

## Inline

Use `Field` with `orientation="horizontal"` to create an inline input.
Pair with `Button` to create a search input with a button.

```tsx
import { Button } from '../ui/button'
import { Field } from '../ui/field'
import { Input } from '../ui/input'

export function InputInline() {
  return (
    <Field orientation="horizontal">
      <Input type="search" placeholder="Search..." />
      <Button>Search</Button>
    </Field>
  )
}
```

## Grid

Use a grid layout to place multiple inputs side by side.

```tsx
import { Field, FieldGroup, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputGrid() {
  return (
    <FieldGroup className="grid max-w-sm grid-cols-2">
      <Field>
        <FieldLabel htmlFor="first-name">First Name</FieldLabel>
        <Input id="first-name" placeholder="Jordan" />
      </Field>
      <Field>
        <FieldLabel htmlFor="last-name">Last Name</FieldLabel>
        <Input id="last-name" placeholder="Lee" />
      </Field>
    </FieldGroup>
  )
}
```

## Required

Use the `required` attribute to indicate required inputs.

```tsx
import { Field, FieldDescription, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputRequired() {
  return (
    <Field>
      <FieldLabel htmlFor="input-required">
        Required Field <span className="text-destructive">*</span>
      </FieldLabel>
      <Input id="input-required" placeholder="This field is required" required />
      <FieldDescription>This field must be filled out.</FieldDescription>
    </Field>
  )
}
```

## Badge

Use `Badge` in the label to highlight a recommended field.

```tsx
import { Badge } from '../ui/badge'
import { Field, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputBadge() {
  return (
    <Field>
      <FieldLabel htmlFor="input-badge">
        Webhook URL{' '}
        <Badge variant="secondary" className="ml-auto">
          Beta
        </Badge>
      </FieldLabel>
      <Input id="input-badge" type="url" placeholder="https://api.example.com/webhook" />
    </Field>
  )
}
```

## Input Group

To add icons, text, or buttons inside an input, use the `InputGroup` component. See the [Input Group](input-group.md) component for more examples.

```tsx
import { InfoCircleIcon } from '@solar-icons/react/linear'

import { Field, FieldLabel } from '../ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '../ui/input-group'

export function InputInputGroup() {
  return (
    <Field>
      <FieldLabel htmlFor="input-group-url">Website URL</FieldLabel>
      <InputGroup>
        <InputGroupInput id="input-group-url" placeholder="example.com" />
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <InfoCircleIcon strokeWidth={1.75} />
        </InputGroupAddon>
      </InputGroup>
    </Field>
  )
}
```

## Button Group

To add buttons to an input, use the `ButtonGroup` component. See the [Button Group](button-group.md) component for more examples.

```tsx
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Field, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'

export function InputButtonGroup() {
  return (
    <Field>
      <FieldLabel htmlFor="input-button-group">Search</FieldLabel>
      <ButtonGroup>
        <Input id="input-button-group" placeholder="Type to search..." />
        <Button variant="outline">Search</Button>
      </ButtonGroup>
    </Field>
  )
}
```

## Form

A full form example with multiple inputs, a select, and a button.

```tsx
import { Button } from '../ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../ui/field'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select'

export function InputForm() {
  const countries = [
    { label: 'United States', value: 'us' },
    { label: 'United Kingdom', value: 'uk' },
    { label: 'Canada', value: 'ca' }
  ]
  return (
    <form className="w-full max-w-sm">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="form-name">Name</FieldLabel>
          <Input id="form-name" type="text" placeholder="Evil Rabbit" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="form-email">Email</FieldLabel>
          <Input id="form-email" type="email" placeholder="john@example.com" />
          <FieldDescription>We&apos;ll never share your email with anyone.</FieldDescription>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="form-phone">Phone</FieldLabel>
            <Input id="form-phone" type="tel" placeholder="+1 (555) 123-4567" />
          </Field>
          <Field>
            <FieldLabel htmlFor="form-country">Country</FieldLabel>
            <Select items={countries} defaultValue="us">
              <SelectTrigger id="form-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {countries.map(country => (
                    <SelectItem key={country.value} value={country.value}>
                      {country.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="form-address">Address</FieldLabel>
          <Input id="form-address" type="text" placeholder="123 Main St" />
        </Field>
        <Field orientation="horizontal">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit">Submit</Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
```
