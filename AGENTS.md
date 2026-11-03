Agent chat UI powered by an external Meta agent runtime, Bun, React, and Tailwind.

## Structure

- `backend/` — Bun server, agent backends, WebSocket, state persistence; see [backend/README.md](backend/README.md) for module ownership and storage paths
- `frontend/` — React SPA, components, hooks, styles
- `shared/` — Shared types between backend and frontend

## Agent context layout

`AGENTS.md` files (root, `frontend/`, `backend/`) are the canonical instructions. Keep project instructions and skills in `.agents/`.

- `.agents/rules/` — topic rules. Read the relevant rule before editing matching files:
  - `product-language.md` (always) — `Quint` casing, sentence case, terminology, and action copy
  - `typescript.md` (`*.ts`, `*.tsx`) — props types, no `any`, `type` over `interface`
  - `tailwind.md` (`*.tsx`, `*.css`) — Tailwind-only styling, no inline styles, `cn()`
  - `icons.md` (`*.tsx`) — `@solar-icons/react` only, sizing and stroke conventions
  - `animations.md` (`*.tsx`, `*.css`) — `tw-animate-css` utilities, no custom keyframes
  - `bun.md` — Bun instead of Node/npm/vite, Bun-native APIs
  - `pull-requests.md` (before creating or updating a PR) — description format, length budget, update-on-pivot
  - `README.md` — format for writing new rules
- `.agents/skills/` — Quint-owned skills in the `SKILL.md` format. Keep optional upstream skills in the agent’s user-level installation rather than copying them into this repository. Discover optional skills at [skills.sh](https://skills.sh/docs).

## File naming and references

- Use kebab-case for repo-owned files and folders, including components, hooks, utilities, and tests: `chat-panel.tsx`, `use-chat.ts`, `chat-panel.test.tsx`. Keep suffixes such as `.test.ts`, `.server.ts`, and `.d.ts`.
- Keep React components and types in PascalCase (`ChatPanel`, `ChatPanelProps`), and functions, hooks, and variables in camelCase (`useChat`). Filename casing does not change exported identifiers.
- Preserve established instruction/document names (`AGENTS.md`, `README.md`, `SKILL.md`, `DESIGN.md`, `TESTING.md`, `NOTES.md`, `LICENSE`), bundled skill reference names, established fixture folders such as `__fixtures__`, and vendored files. These are explicit exceptions.
- When moving, renaming, or deleting files, update imports, lazy imports, test mocks, scripts, comments, and documentation references in the same change. Search for both the old full path and filename, including hidden agent instructions and skills. Historical notes may retain old paths when clearly marked as historical and paired with current guidance.
- Use relative Markdown links for local documentation and source references. Check that their targets and heading fragments still exist after a move or deletion. Use full URLs for external documentation.

## Data flow

- Each workspace added/imported to Quint stores its settings in a `.quint/.workspace.json` file in the workspace folder (hidden filename; `backend/workspaces/layout.ts` is its sole reader/writer).
- Workspace source and shared configuration under `.quint/` can be committed. `.build/` (bundler output) and `.cache/` (derived artifacts such as applet thumbnails, see `backend/applet-engine/thumbnails.ts`) are re-creatable and safe to delete or gitignore. `.canvas/` holds the image/video bytes referenced by `.canvas.json`; preserve both when sharing or backing up a canvas. Those assets cannot be recreated from the snapshot alone.
- Prefer `.quint/.workspace.json` for state that describes the workspace itself rather than the person or device using it — e.g. widget layout and workspace configuration. Litmus test: anyone who clones the workspace should get the same value.
- Store per-user app state that should follow the local Quint installation in the server-side `DATA_DIR`. Expose it through the API and use React Query for frontend caching and optimistic updates.
- Store per-browser or per-device UI preferences in `frontend/store/ui.ts`.
- Decide ownership before adding persistence. Selected sessions and other user-specific choices do not belong in `.quint/`.

## Main app design

`DESIGN.md` is the canonical design guidance for the main app frontend. Before editing host app UI in `frontend/` (`*.tsx` or `*.css`), read `DESIGN.md` together with `frontend/AGENTS.md` and the relevant `.agents/rules/` files. It applies to the app shell, chat, settings, menus, workspace list, tabs, panels, and host widget/quintlet chrome. It does **not** govern workspace widget/quintlet internals or generated applets; use workspace-local design guidance for those.

## Tests

Read [TESTING.md](TESTING.md) when deciding what test coverage a change needs.

## Commands

Development and builds use Nix exclusively for now. [flake.nix](flake.nix) defines the development shell and release packages; [nix/release.nix](nix/release.nix) defines the release build.

- Enter `nix develop` before installing dependencies, running development commands, or running checks. For a single command outside the shell, use `nix develop --command <command>`.
- Build releases with `nix build .#release` (or the appropriate target package from the flake).
- Bun commands below run inside the Nix development shell. Bun scripts are implementation steps used by the Nix workflow; do not introduce a separate non-Nix development or build workflow.

- `bun install --frozen-lockfile` — Install locked dependencies and generate ignored browser assets. The Nix shell also refreshes those assets when dependencies are already installed.
- `bun run dev` — Start the dev server on port 12345 (alias for `bun backend/cli.ts start --dev`).

See [development](docs/development.md) for server restarts and development mode.

### Running the CLI

Use the Nix development shell's `quint` command, or run `bun backend/cli.ts` from the source tree inside that shell. Portable releases are described in [distribution](docs/distribution.md).

## Browser testing

Use the Browser plugin for local UI testing when available. Reuse the current in-app browser tab when it already shows the target app. Otherwise use a browser driver already available in the environment; optional browser tooling is not a repository dependency.

Start the app inside `nix develop` and reuse an existing server on port 12345. Discover the installed browser executable and driver rather than assuming a cloud image or browser path. Wait for the app’s ready state rather than network idle because Quint keeps persistent connections open.

Muse Code is external to this repository; verify `muse --version` and the SDK fingerprint before a live integration test.
