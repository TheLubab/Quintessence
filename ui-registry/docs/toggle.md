# Toggle

A two-state button. Run `quint ui-components add toggle --install`.

```tsx
import { useState } from 'react'
import { Toggle } from '../ui/toggle'

export function BoldToggle() {
  const [pressed, setPressed] = useState(false)
  return <Toggle pressed={pressed} onPressedChange={setPressed} aria-label="Bold">B</Toggle>
}
```

Use `variant="outline"` for an outline and `size` for the available sizes. Set `disabled` when unavailable. Give icon-only toggles an accessible name. See the installed source and the [Base UI toggle API](https://base-ui.com/react/components/toggle#api-reference) for props.
