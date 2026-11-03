---
title: Calendar
description: A calendar component that allows users to select a date or a range of dates.
base: base
component: true
links:
  doc: https://react-day-picker.js.org
---

Some examples also use `card`, `field`, `input-group`. Install the ones you need with `quint ui-components add card field input-group --install`.


```tsx
'use client'

import * as React from 'react'

import { Calendar } from '../ui/calendar'

export function CalendarDemo() {
  const [date, setDate] = React.useState<Date | undefined>(new Date())

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      className="rounded-lg border"
      captionLayout="dropdown"
    />
  )
}
```

## Installation

Use `quint ui-components add calendar --install`.

## Usage

```tsx showLineNumbers
import { Calendar } from '../ui/calendar'
```

```tsx showLineNumbers
const [date, setDate] = React.useState<Date | undefined>(new Date())

return <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-lg border" />
```

See the [React DayPicker](https://react-day-picker.js.org) documentation for more information.

## About

The `Calendar` component is built on top of [React DayPicker](https://react-day-picker.js.org).

## Date Picker

You can use the `<Calendar>` component to build a date picker. See the [Date Picker](date-picker.md) page for more information.

## Selected Date (With TimeZone)

The Calendar component accepts a `timeZone` prop to ensure dates are displayed and selected in the user's local timezone.

```tsx showLineNumbers
export function CalendarWithTimezone() {
  const [date, setDate] = React.useState<Date | undefined>(undefined)
  const [timeZone, setTimeZone] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  return <Calendar mode="single" selected={date} onSelect={setDate} timeZone={timeZone} />
}
```

**Note:** If you notice a selected date offset (for example, selecting the 20th highlights the 19th), make sure the `timeZone` prop is set to the user's local timezone.

**Why client-side?** The timezone is detected using `Intl.DateTimeFormat().resolvedOptions().timeZone` inside a `useEffect` to ensure compatibility with server-side rendering. Detecting the timezone during render would cause hydration mismatches, as the server and client may be in different timezones.

## Basic

A basic calendar component. We used `className="rounded-lg border"` to style the calendar.

```tsx
'use client'

import { Calendar } from '../ui/calendar'

export function CalendarBasic() {
  return <Calendar mode="single" className="rounded-lg border" />
}
```

## Range Calendar

Use the `mode="range"` prop to enable range selection.

```tsx
'use client'

import * as React from 'react'
import { addDays } from 'date-fns'
import { type DateRange } from 'react-day-picker'

import { Calendar } from '../ui/calendar'
import { Card, CardContent } from '../ui/card'

export function CalendarRange() {
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), 0, 12),
    to: addDays(new Date(new Date().getFullYear(), 0, 12), 30)
  })

  return (
    <Calendar
      mode="range"
      defaultMonth={dateRange?.from}
      selected={dateRange}
      onSelect={setDateRange}
      numberOfMonths={2}
      className="rounded-lg border"
    />
  )
}
```

## Month and Year Selector

Use `captionLayout="dropdown"` to show month and year dropdowns.

```tsx
'use client'

import { Calendar } from '../ui/calendar'

export function CalendarCaption() {
  return <Calendar mode="single" captionLayout="dropdown" className="rounded-lg border" />
}
```

## Presets

```tsx
'use client'

import * as React from 'react'
import { addDays } from 'date-fns'

import { Button } from '../ui/button'
import { Calendar } from '../ui/calendar'
import { Card, CardContent, CardFooter } from '../ui/card'

export function CalendarWithPresets() {
  const [date, setDate] = React.useState<Date | undefined>(
    new Date(new Date().getFullYear(), 1, 12)
  )
  const [currentMonth, setCurrentMonth] = React.useState<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )

  return (
    <Card className="mx-auto w-fit max-w-[300px]" size="sm">
      <CardContent>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          fixedWeeks
          className="p-0 [--cell-size:--spacing(9.5)]"
        />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {[
          { label: 'Today', value: 0 },
          { label: 'Tomorrow', value: 1 },
          { label: 'In 3 days', value: 3 },
          { label: 'In a week', value: 7 },
          { label: 'In 2 weeks', value: 14 }
        ].map(preset => (
          <Button
            key={preset.value}
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              const newDate = addDays(new Date(), preset.value)
              setDate(newDate)
              setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1))
            }}
          >
            {preset.label}
          </Button>
        ))}
      </CardFooter>
    </Card>
  )
}
```

## Date and Time Picker

```tsx
'use client'

import * as React from 'react'
import { ClockCircleIcon } from '@solar-icons/react/linear'

import { Calendar } from '../ui/calendar'
import { Card, CardContent, CardFooter } from '../ui/card'
import { Field, FieldGroup, FieldLabel } from '../ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/input-group'

export function CalendarWithTime() {
  const [date, setDate] = React.useState<Date | undefined>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 12)
  )

  return (
    <Card size="sm" className="mx-auto w-fit">
      <CardContent>
        <Calendar mode="single" selected={date} onSelect={setDate} className="p-0" />
      </CardContent>
      <CardFooter className="border-t bg-card">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="time-from">Start Time</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="time-from"
                type="time"
                step="1"
                defaultValue="10:30:00"
                className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
              <InputGroupAddon>
                <ClockCircleIcon strokeWidth={1.75} className="text-muted-foreground" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="time-to">End Time</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="time-to"
                type="time"
                step="1"
                defaultValue="12:30:00"
                className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              />
              <InputGroupAddon>
                <ClockCircleIcon strokeWidth={1.75} className="text-muted-foreground" />
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </CardFooter>
    </Card>
  )
}
```

## Booked dates

```tsx
'use client'

import * as React from 'react'

import { Calendar } from '../ui/calendar'
import { Card, CardContent } from '../ui/card'

export function CalendarBookedDates() {
  const [date, setDate] = React.useState<Date | undefined>(new Date(new Date().getFullYear(), 0, 6))
  const bookedDates = Array.from(
    { length: 15 },
    (_, i) => new Date(new Date().getFullYear(), 0, 12 + i)
  )

  return (
    <Card className="mx-auto w-fit p-0">
      <CardContent className="p-0">
        <Calendar
          mode="single"
          defaultMonth={date}
          selected={date}
          onSelect={setDate}
          disabled={bookedDates}
          modifiers={{
            booked: bookedDates
          }}
          modifiersClassNames={{
            booked: '[&>button]:line-through opacity-100'
          }}
        />
      </CardContent>
    </Card>
  )
}
```

## Custom Cell Size

```tsx
'use client'

import * as React from 'react'
import { addDays } from 'date-fns'
import { type DateRange } from 'react-day-picker'

import { Calendar, CalendarDayButton } from '../ui/calendar'
import { Card, CardContent } from '../ui/card'

export function CalendarCustomDays() {
  const [range, setRange] = React.useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), 11, 8),
    to: addDays(new Date(new Date().getFullYear(), 11, 8), 10)
  })

  return (
    <Card className="mx-auto w-fit p-0">
      <CardContent className="p-0">
        <Calendar
          mode="range"
          defaultMonth={range?.from}
          selected={range}
          onSelect={setRange}
          numberOfMonths={1}
          captionLayout="dropdown"
          className="[--cell-size:--spacing(10)] md:[--cell-size:--spacing(12)]"
          formatters={{
            formatMonthDropdown: date => {
              return date.toLocaleString('default', { month: 'long' })
            }
          }}
          components={{
            DayButton: ({ children, modifiers, day, ...props }) => {
              const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6

              return (
                <CalendarDayButton day={day} modifiers={modifiers} {...props}>
                  {children}
                  {!modifiers.outside && <span>{isWeekend ? '$120' : '$100'}</span>}
                </CalendarDayButton>
              )
            }
          }}
        />
      </CardContent>
    </Card>
  )
}
```

You can customize the size of calendar cells using the `--cell-size` CSS variable. You can also make it responsive by using breakpoint-specific values:

```tsx showLineNumbers
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  className="rounded-lg border [--cell-size:--spacing(11)] md:[--cell-size:--spacing(12)]"
/>
```

Or use fixed values:

```tsx showLineNumbers
<Calendar
  mode="single"
  selected={date}
  onSelect={setDate}
  className="rounded-lg border [--cell-size:2.75rem] md:[--cell-size:3rem]"
/>
```

## Week Numbers

Use `showWeekNumber` to show week numbers.

```tsx
'use client'

import * as React from 'react'

import { Calendar } from '../ui/calendar'
import { Card, CardContent } from '../ui/card'

export function CalendarWeekNumbers() {
  const [date, setDate] = React.useState<Date | undefined>(
    new Date(new Date().getFullYear(), 0, 12)
  )

  return (
    <Card className="mx-auto w-fit p-0">
      <CardContent className="p-0">
        <Calendar
          mode="single"
          defaultMonth={date}
          selected={date}
          onSelect={setDate}
          showWeekNumber
        />
      </CardContent>
    </Card>
  )
}
```

## API Reference

See the [React DayPicker](https://react-day-picker.js.org) documentation for more information on the `Calendar` component.
