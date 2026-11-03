---
title: Alert
description: Displays a callout for user attention.
base: base
component: true
---

Some examples also use `button`. Install the ones you need with `quint ui-components add button --install`.


```tsx
import { CheckCircleIcon, InfoCircleIcon } from '@solar-icons/react/linear'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

export function AlertDemo() {
  return (
    <div className="grid w-full max-w-md items-start gap-4">
      <Alert>
        <CheckCircleIcon strokeWidth={1.75} />
        <AlertTitle>Payment successful</AlertTitle>
        <AlertDescription>
          Your payment of $29.99 has been processed. A receipt has been sent to your email address.
        </AlertDescription>
      </Alert>
      <Alert>
        <InfoCircleIcon strokeWidth={1.75} />
        <AlertTitle>New feature available</AlertTitle>
        <AlertDescription>
          We&apos;ve added dark mode support. You can enable it in your account settings.
        </AlertDescription>
      </Alert>
    </div>
  )
}
```

## Installation

Use `quint ui-components add alert --install`.

## Usage

```tsx showLineNumbers
import { Alert, AlertAction, AlertDescription, AlertTitle } from '../ui/alert'
```

```tsx showLineNumbers
<Alert>
  <InfoCircleIcon strokeWidth={1.75} />
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>
    You can add components and dependencies to your app using the cli.
  </AlertDescription>
  <AlertAction>
    <Button variant="outline">Enable</Button>
  </AlertAction>
</Alert>
```

## Composition

Use the following composition to build an `Alert`:

```text
Alert
├── Icon
├── AlertTitle
├── AlertDescription
└── AlertAction
```

## Basic

A basic alert with an icon, title and description.

```tsx
import { CheckCircleIcon } from '@solar-icons/react/linear'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

export function AlertBasic() {
  return (
    <Alert className="max-w-md">
      <CheckCircleIcon strokeWidth={1.75} />
      <AlertTitle>Account updated successfully</AlertTitle>
      <AlertDescription>
        Your profile information has been saved. Changes will be reflected immediately.
      </AlertDescription>
    </Alert>
  )
}
```

## Destructive

Use `variant="destructive"` to create a destructive alert.

```tsx
import { DangerCircleIcon } from '@solar-icons/react/linear'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

export function AlertDestructive() {
  return (
    <Alert variant="destructive" className="max-w-md">
      <DangerCircleIcon strokeWidth={1.75} />
      <AlertTitle>Payment failed</AlertTitle>
      <AlertDescription>
        Your payment could not be processed. Please check your payment method and try again.
      </AlertDescription>
    </Alert>
  )
}
```

## Action

Use `AlertAction` to add a button or other action element to the alert.

```tsx
import { Alert, AlertAction, AlertDescription, AlertTitle } from '../ui/alert'
import { Button } from '../ui/button'

export function AlertActionExample() {
  return (
    <Alert className="max-w-md">
      <AlertTitle>Dark mode is now available</AlertTitle>
      <AlertDescription>Enable it under your profile settings to get started.</AlertDescription>
      <AlertAction>
        <Button size="xs" variant="default">
          Enable
        </Button>
      </AlertAction>
    </Alert>
  )
}
```

## Custom Colors

You can customize the alert colors by adding custom classes such as `bg-amber-50 dark:bg-amber-950` to the `Alert` component.

```tsx
import { DangerTriangleIcon } from '@solar-icons/react/linear'

import { Alert, AlertDescription, AlertTitle } from '../ui/alert'

export function AlertColors() {
  return (
    <Alert className="max-w-md border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
      <DangerTriangleIcon strokeWidth={1.75} />
      <AlertTitle>Your subscription will expire in 3 days.</AlertTitle>
      <AlertDescription>
        Renew now to avoid service interruption or upgrade to a paid plan to continue using the
        service.
      </AlertDescription>
    </Alert>
  )
}
```

## API Reference

### Alert

The `Alert` component displays a callout for user attention.

| Prop      | Type                         | Default     |
| --------- | ---------------------------- | ----------- |
| `variant` | `"default" \| "destructive"` | `"default"` |

### AlertTitle

The `AlertTitle` component displays the title of the alert.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AlertDescription

The `AlertDescription` component displays the description or content of the alert.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |

### AlertAction

The `AlertAction` component displays an action element (like a button) positioned absolutely in the top-right corner of the alert.

| Prop        | Type     | Default |
| ----------- | -------- | ------- |
| `className` | `string` | -       |
