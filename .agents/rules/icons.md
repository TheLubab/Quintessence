---
description: Use @solar-icons/react for all icons.
globs: '*.tsx, *.jsx'
alwaysApply: false
---

- Use `@solar-icons/react` for all icons, including documentation examples. Don't install or use other icon packages.
- Import icons from the style entrypoint: `import { ArrowUpIcon } from '@solar-icons/react/linear'`. Use `/linear` for regular UI icons and `/bold` for filled states (for example an active pin or fast mode).
- Solar icon names end with `Icon` (e.g. `ArrowUpIcon`, `CloseIcon`, `ChatRoundIcon`). Do not use `Icon`-prefixed names.
- Icons accept `size` (number) and standard SVG props including `className`. The stroke prop is `strokeWidth`, not `stroke`.
- Use only the app icon size/stroke pairs below for UI icons. Avoid `14`, `18`, `22`, `28`, `32`, `40`, or other intermediate sizes.

  | Size | Stroke width | Usage |
  | --- | --- | --- |
  | `12` | `1.75` | Dense metadata, timeline nodes, and tiny status glyphs |
  | `16` | `1.75` | Compact controls, inline rows, tabs/nav/workspace chrome |
  | `20` | `1.5` | Default standalone actions and normal controls |
  | `24` | `1.5` | Empty states, large affordances, and illustrative UI moments |

- Solar's Linear default is `1.5`, not the app default. Always set the `strokeWidth` prop explicitly on every Solar icon.
- Inside `<Button>`: icons are sized automatically via CSS — `xs`/`icon-xs` → 12px, `sm`/`icon-sm` → 16px, `default`/`icon`/`lg`/`icon-lg` → 20px. Do not set `size` on icons inside buttons; still set the `strokeWidth` that matches the rendered button icon size.
- For icon props and maps, import the shared type from `@solar-icons/react/lib/types`:
  `import type { Icon as SolarIcon } from '@solar-icons/react/lib/types'`.