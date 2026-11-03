# Quint ui-components

`quint ui-components` copies ready-to-use component source into `.quint/ui/`.
Workspaces do not need `components.json` or path aliases.

## Catalog

The public catalog is every `registry:ui` and `registry:block` item in
`registry.json`. Some entries are recipes that install the components needed for
composition and include docs explaining how to put them together. `utils` and
`scoped-portal` are internal support items.

## Commands

- `quint ui-components` lists the catalog and installed state.
- `quint ui-components add <name…> [--force] [--install]` copies requested items
  and their dependencies into `.quint/ui/`.
- `quint ui-components docs <name…>` prints the bundled markdown docs.

Requested files are skipped when they already exist unless `--force` is used.
Existing support files are always protected. `--install` installs additional
npm dependencies in `.quint/`. Rebuilding remains a separate `quint bundle` step.

## Registry

`registry.json` is the source of truth. `backend/applet-engine/ui-components.ts` uses the
pinned shadcn registry loader to read it, then recursively collects local
dependencies and deduplicates files and npm packages. The CLI accepts only
names from the bundled catalog, so installs work offline.

Files under `ui-registry/` are already install-ready:

- imports use sibling paths such as `./button` and `./utils`;
- icons come from `@solar-icons/react` with explicit stroke widths from the [icon rules](../.agents/rules/icons.md);
- portalled overlays use `ScopedPortal` so applet-scoped styles still match;
- Drawer portals into its quintlet container instead of the page.

Docs live in `ui-registry/docs/`. The standard docs are adapted from the 4.21 snapshot, with Quint installation commands, relative component imports, and Solar icons. Button and Drawer
have concise local docs.

Components shared with the host are re-exported from `frontend/components/ui/`.
Keep their implementations in `ui-registry/`; the facades define the shared set,
and their tests cover component behavior. A host-only compatibility copy should
explain why it cannot use the registry source yet.

## Updating the snapshot

Generate components with `bunx --bun shadcn@4.21.0` using Base Nova and Base UI.
Keep generated APIs, markup, and styles. Rewrite imports to sibling paths, convert
generated icons to Solar, apply applet portal scoping and project icon stroke widths,
and run repository formatting. Then update `registry.json`, docs, and the pinned
`shadcn` dependency together. Convert doc examples to Solar too, including imports,
icon names, and icon types.

Compare CLI output using the repository's `components.json` and `frontend/index.css`.
Generated output depends on project settings and theme tokens.

[Release staging](../scripts/stage-release.ts) includes `registry.json` and
`ui-registry/`, so portable installs expose the same catalog and documentation.

## Build integration

Every applet build starts from a CSS entry Quint generates
(`writeSyntheticTailwindCss` → `.quint/.build/<kind>-tailwind.css`):
`@import 'tailwindcss'`, followed by the shared theme, `tw-animate-css`,
`shadcn/tailwind.css`, the applet variants, and `@source`. Quint inlines these
styles from its own dependencies. Workspaces gain no CSS dependencies, and
Tailwind emits only utilities used by the applet and its imported `.quint/ui/`
files.

## Portals

Most overlays still portal to `document.body` so they can escape widget
overflow and stacking. `ScopedPortal` copies the current applet scope onto the
portalled subtree, which keeps scoped CSS working. This wrapper is already
baked into the checked-in overlay sources.

Known limitation: portalled content resolves theme variables from the
host `:root`, not the widget frame's inline per-widget derivations
(`data-vivid`, dark-surface tokens) — with the default theme they match;
a heavily themed workspace can show slightly off-theme popups. Copying
frame tokens onto the wrapper is a possible follow-up.

Drawer stays inside the applet root so it covers only the current quintlet.
