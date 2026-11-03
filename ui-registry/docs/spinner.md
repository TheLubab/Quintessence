# Spinner

A compact loading indicator with an accessible status label. Run `quint ui-components add spinner --install`.

```tsx
import { Spinner } from '../ui/spinner'

export function LoadingStatus() {
  return (
    <div className="flex items-center gap-2">
      <Spinner /> Loading orders
    </div>
  )
}
```

Use it for compact actions or work without a predictable content shape. Prefer a skeleton for loading regions whose layout is known. The default accessible label is “Loading”; pass `aria-label` to describe a more specific operation.
