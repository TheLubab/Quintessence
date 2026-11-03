React frontend connecting to the backend via WebSocket (`useChat` hook).

Before editing host-app UI, read `../DESIGN.md` and the relevant rules in `../.agents/rules`. `../DESIGN.md` owns visual direction and semantic choices; topic rules own syntax, component source owns APIs and dimensions, and the theme CSS owns token values. Generic design and shadcn skills may help with craft and component mechanics, but project guidance wins on aesthetics, installed-component policy, and approval requirements.

`../DESIGN.md` applies to host chrome and product surfaces. It does not apply to workspace widget/quintlet internals or generated applets; use their workspace-local design guidance.

## Entities

- **Workspace** — Top-level container. Has a name and contains widgets and a chat. One workspace is active at a time.
- **Widget** — A configurable card inside Dashboard. Displayed in a grid.
- **Chat** — The agent conversation. Contains a scrollable message list and an input. Available on Dashboard, Canvas, and quintlets through a docked panel or floating popup, depending on available width.

## Conventions

- Follow the [repo file naming rules](../AGENTS.md#file-naming-and-references): component, hook, and test filenames use kebab-case.

- UI components in `components/ui/` are host facades over the shared Quint registry components built on Base UI React. Local compatibility copies explain why they cannot re-export yet.
- `utils/cn.ts` is `clsx` + `tailwind-merge`.

## Shared React runtime

Read [frontend runtime](../docs/frontend-runtime.md) before changing React bundling, HMR, or browser dependency serving.

## Frontend boundaries

- `app/` owns routes and the app shell. Route files load data and compose features; keep feature UI out of them.
- `features/<name>/` owns that feature's components, hooks, state, API hooks, and nearby tests.
- `components/ui/` contains host facades for shared UI primitives. `components/shared/` contains reusable app components with no feature knowledge.
- `api/` contains shared request helpers, query keys, and query policies. Feature endpoints stay in the feature's `api.ts`.
- `platform/` contains browser-wide lifecycle code such as HMR and shared workspace events.
- `app/app-provider.tsx` owns app-wide services that live exactly as long as the app, such as the workspace events socket; `platform/app-context.ts` exposes them to hooks. Put state there when it must survive route switches. Hooks that read it do nothing outside the provider, so sandboxes and component tests open no connections.
- `utils/` contains small feature-neutral utilities. Do not use it as a catch-all for components or feature state.
- App code may compose features. Shared components and primitives must not import from `features/` or `app/`.
- Keep tests next to the code they cover. Extract a component, hook, or pure helper when a file starts mixing multiple responsibilities.
