# Developing applets

Every applet — a **Widget** or a **Quintlet** — is a default-exported React component in
`.quint/<type>/<name>.tsx`, optionally paired with a `<name>.server.ts`. `quint bundle` compiles each
into a live module and reloads it in the browser. Run it after source edits. Read
`DESIGN.md` first.
Write normal React + Tailwind — below is only what's **quint-specific**.

### Build environment

- Bun is the required dependency of Quint, so it must be installed
- For package management **always** use bun
- package.json is scaffolded during init. You are free to install/remove/do whatever with packages.
- if packages aren't installed, it's your responsibility to call `bun install`
- `react` and `react-dom` are stubs — they're provided by Quint at runtime via the browser importmap.
  They're listed only so editors pick up the correct types.
- `quint bundle` runs **Bun's bundler**, so standard Bun imports, loaders, and tricks apply (JSON,
  text, etc.) — see the Bun docs. The quint-specific imports are covered below.

### Anatomy and imports

```tsx
// .quint/widgets/hello.tsx
import { useEffect, useState } from 'react'
import { getGreeting } from './hello.server' // optional server fn — see below

// Optional config — fields are per type (see Widgets / Quintlets below). requiredEnv is shared.
export const config = { requiredEnv: ['API_KEY'] }

export default function Hello() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    getGreeting().then(setMsg) // call server fns like any async function
  }, [])
  return <div className="h-full w-full p-4">{msg}</div>
}
```

Imports resolve relatively (same folder, or elsewhere under `.quint/` — e.g. `../lib/format`) or
from `.quint/package.json` deps — no `@/` aliases. Files starting with `_` (e.g. `_utils.tsx`) in
`widgets/` and `quintlets/` are never applet entry points — put code shared between applets there.
`quint bundle` tracks these local imports: editing a shared module rebuilds every applet using it.
**Applets never import from each other, not even types.**

### Widgets

Live cards on the Dashboard grid — many visible at once. `config` sets the grid footprint:

```ts
export const config = {
  colSpan: 2, // columns the card spans — 1–4
  rowSpan: 1, // rows the card spans — 1–4
  requiredEnv: ['API_KEY'] // optional env-key hints (advisory; see Environment and secrets)
} as const
```

Render **content only**: a plain `h-full w-full` region with no card chrome (`rounded-*`,
`shadow-*`, or outer `border`) — the dashboard owns the shell, spacing, and elevation. It does not
own the fill, so the widget must set its own opaque background.
Changing `colSpan`/`rowSpan` needs `quint bundle --force --only widgets/<id>`. See
`DESIGN.md`.

### Quintlets

Quintlets are full-screen apps, one per tab.

```ts
export const config = {
  title: 'Customer dashboard', // sentence-case nav label — defaults to the file name
  icon: 'user', // icon id; use the selected icon for a pending quintlet
  requiredEnv: ['CRM_API_KEY'] // optional env-key hints (advisory; see Environment and secrets)
} as const
```

A quintlet **owns its whole page** — its own `h-full w-full` layout, scrolling
(`overflow-auto`), padding, and chrome. Build it to read like an app screen. See `DESIGN.md`.

Keep shareable or reload-safe state in URL query params,
read it from `params`, and update it with `navigate()`. Keep temporary state, such as drafts and
hover, in React. See [Applet intents](INTENTS.md#quintlet-params-and-history).

#### Creating quintlets from chat

When the user asks for a new quintlet, use the current session ID and pin state from the
hidden context. If this chat is pinned, build in this turn:

```sh
quint quintlets create --requirements "<complete requirements>"
```

Otherwise, start the build in a separate chat by forking the current session:

```sh
quint quintlets create --from-session <session-id> --requirements "<complete requirements>"
```

The command returns a permanent `quintletId` and keeps the current chat and tab open.
Let the user choose when to open the new quintlet; do not navigate automatically.

- `mode: "handoff"`: another chat continues the build. Finish this turn with a link such as
  `[Open the quintlet](quint:/quintlets/<quintletId>)`.
- `mode: "in-place"`: no chat was created or attached. Continue the build in this turn using the
  returned id and build instructions.

#### Pending quintlet builds

Read the applet design guidance before editing.
When the direction is clear, choose a sentence-case title and relevant icon. Preserve proper names
and acronyms. Set this provisional metadata before the first bundle:

```sh
quint quintlets set <quintlet-id> --title "<title>" --icon <icon-id>
```

Choose from the available quintlet icons in the hidden context when that list is present. Then write
`.quint/quintlets/<quintlet-id>.tsx` and use the same title and icon in its config. Run
`quint check --only quintlets/<quintlet-id>` before `quint bundle --only quintlets/<quintlet-id>`. A successful bundle
replaces the pending screen in the same tab. Keep the user's current tab open and finish with a
`quint:/quintlets/<quintlet-id>` link.

### Styling and UI components

- Use Tailwind for static styling. Do not add custom CSS, `@apply`, or static `style={{}}` values.
- Use `style={{}}` only for computed data such as chart geometry, progress, per-item delays, or
  per-frame transforms.
- Use icons from `@solar-icons/react`. Do not add raw SVG icons or another icon pack. When the
  project provides `.agents/rules/icons.md`, follow its size and stroke policy.
- Applets cannot import the host project's `cn`. If `.quint/ui/utils.ts` exists, import `cn` from
  `../ui/utils`; otherwise use a local `cx()` when classes are conditional. Never build class
  names with template-literal ternaries.

```tsx
function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
```

Use bundled components for standard controls. Read the
[shared usage rules](UI-COMPONENTS.md) before composing them.

- `quint ui-components` lists available components and recipes with installed state.
- `quint ui-components docs <name…>` prints bundled usage docs. Read them before using an
  unfamiliar component or when its API may have changed.
- `quint ui-components add <name…> --install` copies source into `.quint/ui/` and installs npm
  dependencies. Pass all needed names in one call.
- Import relatively, e.g. `import { Button } from '../ui/button'`, then run `quint bundle`
  after editing applets.

Reuse familiar installed components without rereading their catalog entries, docs, or source.
Inspect source only for local customizations, doc conflicts, or concrete build issues.

### Server functions

In `<name>.server.ts`, export callable server functions as named `async function`s; an optional `dispose()` hook releases resources on worker shutdown and call
them from the component like ordinary async functions; arguments and return values are auto-serialized (`Date`, `Map`,
`Set`, … work). They run on the Bun server with `process.env` and full filesystem access, at
`cwd = <workspace root>` (the parent of `.quint/`, where you operate) — so workspace files are plain
relative paths:

```ts
// hello.server.ts — read files, call APIs, query DBs…
export async function getGreeting(): Promise<string> {
  return (await Bun.file('./notes.md').text()).split('\n')[0]
}
```

The component fetches on mount; after you change underlying data a server fn reads, run
`quint refresh` to re-pull it without a rebuild.

It's plain Bun — every Bun API is available with no setup: `bun:sqlite`, `Bun.redis`, `Bun.s3`,
`Bun.file`, `fetch`, …

### Files and assets

- **Bundled asset** — `import logo from './logo.png'` resolves to a URL at build time (images &
  fonts: `png jpg gif svg webp avif ico woff woff2 ttf otf`). For small art shipped beside the
  `.tsx`.
- **Workspace file** — stream a file from the workspace via `resolveUrl` from the **`quint`** package:

  ```tsx
  import { resolveUrl } from 'quint'
  ;<video src={resolveUrl('quint:/files/clips/intro.mp4')} controls />
  ```

  Paths are relative to the workspace root. Files stream with HTTP range support for media seeking.
  Only media/asset extensions are served; dotfiles, source, and JSON are rejected.
  File URLs can be resolved at module load.

  For a dynamic path, such as one returned by a server function, encode each segment:

  ```tsx
  const fileAddress = `quint:/files/${clip.file.split('/').map(encodeURIComponent).join('/')}`
  ;<video src={resolveUrl(fileAddress)} controls />
  ```

### Applet intents

Use intents to make applets feel like part of the wider workspace: navigate between tabs, open
another quintlet with a specific item selected, add context to chat, or send a message on the user's
behalf when they click a button. For example, a chart can open a detailed quintlet, or an order card
can ask the agent to investigate a delay. Read [Applet intents](INTENTS.md) for the
available functions and when to use them.

### Verification and handoff

Use `quint check --only quintlets/<id>` or `quint check --only widgets/<id>` for the applet you changed. Use
the kind alone only when the work spans several applets. The command owns the supported applet
TypeScript setup and can gain more checks later. Do not create `.quint/tsconfig.json`, invoke `tsc`
directly, or retry with ad hoc compiler flags and missing type packages.

For a frontend rebuild, use this stopping point:

1. Run `quint check --only <kind>/<id>` once after source edits, then
   `quint bundle --only <kind>/<id>`.
2. In the browser, exercise the changed interaction, such as reveal and rating, and check one
   narrow layout.
3. Inspect `quint debug logs --only <kind>/<id> --json` for runtime errors.

Stop when these checks pass. Expand verification only when a check fails or the changed behavior
needs another focused check. Do not search for repo tests by default. Run an existing applet test or
`quint call-server-fn` only when the change touches the behavior it covers. If native-app inspection is
unavailable, keep verification in the browser instead of retrying the unsupported tool.

After the final successful checks, hand off the result according to the task:

- After building or editing a widget, run `quint navigate 'quint:/dashboard'`.
- After editing an existing quintlet, run `quint navigate 'quint:/quintlets/<quintlet-id>'`.
- After a pending quintlet build, keep the current tab open and link to `quint:/quintlets/<quintlet-id>` in the
  final reply.

Keep the final reply user-facing. Include requested artifacts and links, and report verification or limitations when useful.

### Debugging

`quint bundle` only proves an applet compiles — it can still fail to load in the browser, crash on
render, or throw in its server functions. For frontend rebuilds, check runtime logs as required
above. For other work, use these channels when smoke-testing new behavior or investigating a
problem:

- `quint call-server-fn widgets/hello/getGreeting` /
  `quint call-server-fn quintlets/crm/searchUsers '["ann", 10]'` — run one `.server.ts` function
  directly (args are one JSON array). Each invocation runs in a fresh, isolated one-shot process
  with the same env, module loading, and timeout as the browser's calls, so a pass means the real
  path works — handy for trying a function without touching the UI. Server functions only; for
  arbitrary scripts use `quint env exec`.
- `quint debug logs` — the applet errors the workspace has seen since each applet's last good
  build: browser-side load failures and render crashes, plus server-function (rpc) errors. The
  user's tab reports these automatically, so when the user says something is broken, what
  happened is usually already on record — a good first place to look. Entries clear when their
  applet next builds successfully. (`quint debug` is an experimental command group — expect its
  output and flags to evolve; use `--json` when you need to parse it.)

`quint bundle`'s footer also mentions when runtime errors are on record, so standing breakage
surfaces on its own.

