# Date picker

This recipe installs Calendar, Popover, and Button; it does not install a separate date-picker component. Run `quint ui-components add date-picker --install`.

```tsx
import { useState } from 'react'
import { Button } from '../ui/button'
import { Calendar } from '../ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export function DatePicker() {
  const [date, setDate] = useState<Date | undefined>()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        {date ? date.toLocaleDateString() : 'Choose a date'}
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={value => {
            setDate(value)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
```

Use `mode="range"` with a range selection for date ranges. Choose the date's time zone and serialization according to the data being edited; a calendar date should not accidentally shift when converted to UTC. See `quint ui-components docs calendar popover` for the installed components.
