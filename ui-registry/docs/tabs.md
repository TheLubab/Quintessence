---
title: Tabs
description: A set of layered sections of content—known as tab panels—that are displayed one at a time.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/tabs
  api: https://base-ui.com/react/components/tabs#api-reference
---

Some examples also use `card`. Install the ones you need with `quint ui-components add card --install`.

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

export function TabsDemo() {
  return (
    <Tabs defaultValue="dashboard" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="dashboard">
        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              View your key metrics and recent project activity. Track progress across all your
              active projects.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You have 12 active projects and 3 pending tasks.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="analytics">
        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              Track performance and user engagement metrics. Monitor trends and identify growth
              opportunities.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Page views are up 25% compared to last month.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="reports">
        <Card>
          <CardHeader>
            <CardTitle>Reports</CardTitle>
            <CardDescription>
              Generate and download your detailed reports. Export data in multiple formats for
              analysis.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You have 5 reports ready and available to export.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Manage your account preferences and options. Customize your experience to fit your
              needs.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configure notifications, security, and themes.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
```

## Installation

Use `quint ui-components add tabs --install`.

## Usage

```tsx showLineNumbers
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
```

```tsx showLineNumbers
<Tabs defaultValue="account" className="w-[400px]">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">Make changes to your account here.</TabsContent>
  <TabsContent value="password">Change your password here.</TabsContent>
</Tabs>
```

## Composition

Use the following composition to build `Tabs`:

```text
Tabs
├── TabsList
│   ├── TabsTrigger
│   └── TabsTrigger
├── TabsContent
└── TabsContent
```

## Line

Use the `variant="line"` prop on `TabsList` for a line style.

```tsx
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

export function TabsLine() {
  return (
    <Tabs defaultValue="dashboard">
      <TabsList variant="line">
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

## Vertical

Use `orientation="vertical"` for vertical tabs.

```tsx
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

export function TabsVertical() {
  return (
    <Tabs defaultValue="account" orientation="vertical">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

## Disabled

```tsx
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

export function TabsDisabled() {
  return (
    <Tabs defaultValue="home">
      <TabsList>
        <TabsTrigger value="home">Home</TabsTrigger>
        <TabsTrigger value="settings" disabled>
          Disabled
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

## Icons

```tsx
import { CodeIcon, WindowFrameIcon } from '@solar-icons/react/linear'

import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'

export function TabsIcons() {
  return (
    <Tabs defaultValue="preview">
      <TabsList>
        <TabsTrigger value="preview">
          <WindowFrameIcon strokeWidth={1.75} />
          Preview
        </TabsTrigger>
        <TabsTrigger value="code">
          <CodeIcon strokeWidth={1.75} />
          Code
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
```

## API Reference

See the [Base UI Tabs](https://base-ui.com/react/components/tabs#api-reference) documentation.
