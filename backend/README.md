# Backend structure

The backend runs on Bun. Code is grouped by the feature it owns. HTTP routes,
WebSocket handlers, and CLI commands call the same feature modules.

## Where code belongs

| Location             | Owns                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http/`              | Hono HTTP routes, request validation, workspace lookup middleware, and API tests. `index.ts` assembles and defines the main routes; `harnesses.ts` defines login routes.                             |
| `cli/commands/`      | One module per top-level CLI command, with its subcommands and private helpers.                                                                                                                      |
| `cli/`               | Command registration, help, CLI access gates, terminal formatting, control requests, and server launching.                                                                                           |
| `workspaces/`        | Workspace discovery and registration, creation/import, `.quint/` scaffolding, layout, tabs, theme, icons, file previews, and environment settings.                                                   |
| `sessions/`          | Quint's session metadata, selection and pin state, archiving, ID renames, message attachments, and pending-quintlet chat handoffs. Provider-owned history stays in the external runtime.             |
| `workspace-storage/` | Per-workspace `state.json` storage: one writer per workspace, transactions, atomic writes, lock timeout, a revision and a `state:changed` event per change, re-adoption of a removed workspace's id. |
| `applet-engine/`     | Quintlet/widget manifests, source analysis, builds, CSS scoping, typechecking, bundle serving, server-function workers, thumbnails, UI component installation, and the error journal.                |
| `canvas/`            | Canvas documents, assets, headless drawing, and browser screenshot requests.                                                                                                                         |
| `images/`            | Meta Muse Image generation and editing, provider errors, and saved workspace image assets. See [image generation](../docs/image-generation.md).                                                      |
| `skills/`            | Bundled workspace skill installation, version checks, and updates. These modules manage the copies shipped under `workspace-template/`.                                                              |
| `agents/`            | Muse Code harness boundary: config, transport, adapter, session state, readiness, and registry. See [the harness guide](agents/README.md).                                                           |
| `test/`              | Integration tests and existing tests that share fixtures. Other unit tests live beside their modules.                                                                                                |

Use direct module imports such as `workspaces/registry` or `sessions/store`.
Keep shared helpers in the feature that owns them. A folder does not imply a
strict dependency layer: workspace setup installs skills, applets use workspace
environment settings, and quintlet builds coordinate with session metadata.

The two registries have different jobs: `workspaces/registry.ts` owns the local
workspace list; `agents/registry.ts` owns the available agent backend (Meta).

## Entry points and shared wiring

- `cli.ts` is the executable entry point used by the portable launcher and `bun run dev`.
  It loads color setup before Citty, then `cli/index.ts`. The command tree keeps
  root help and demo/managed-user gates together.
- `web.ts` starts Bun's HTTP server, serves the SPA, handles chat and workspace
  event WebSockets, and owns shutdown. It delegates HTTP requests to `http/`.
- `control.ts` serves the loopback WebSocket used by CLI commands. Both transports
  call feature modules rather than each other.
- `events.ts` publishes workspace events. `state.ts` holds connected chat clients
  and broadcasts chat messages. `navigation-relay.ts` waits for browser navigation
  acknowledgements.
- `static.ts` locates the production frontend; `vendor.ts` serves browser dependencies.
  `constants.ts` defines the default HTTP and control addresses. `status.ts` renders
  server status; `debug.ts` controls console tracing.
- `service.ts`, `update.ts`, `server-cwd.ts`, and `version.ts` handle installation,
  process lifecycle, updates, and package identity. `app-config.ts`,
  `app-settings.ts`, and `data-dir.ts` own installation-wide settings and storage.
- `agent-caller.ts` detects CLI callers. `uploads.ts` validates and resolves chat uploads;
  `open-browser.ts` opens local browser links.

New backend wiring can stay at the root. Feature implementations belong in the
corresponding directory above.

## Storage ownership

| State                                                                                                     | Location and owner                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace layout, theme, and tab configuration                                                            | `.quint/.workspace.json`, read and written by `workspaces/layout.ts`                                                                                                               |
| Applet source                                                                                             | `.quint/quintlets/`, `.quint/widgets/`, and shared workspace source                                                                                                                |
| Generated bundles and thumbnails                                                                          | `.quint/.build/` and `.quint/.cache/`; re-creatable                                                                                                                                |
| Canvas document and image bytes                                                                           | `.quint/.canvas.json` and `.quint/.canvas/`; preserve both                                                                                                                         |
| Registered workspaces                                                                                     | `DATA_DIR/workspaces.json`, owned by `workspaces/registry.ts`                                                                                                                      |
| Session attribution, settings, and fork metadata; selected and pinned sessions; pending quintlet creation | `DATA_DIR/workspaces/<workspace id>/state.json`, stored by `workspace-storage/`; meaning owned by `sessions/store.ts`, `sessions/selected.ts`, and `sessions/pending-quintlets.ts` |
| Workspace environment preferences and secrets                                                             | `workspaces/env.ts`; metadata in `DATA_DIR`, secrets in the OS keychain or file fallback                                                                                           |
| Muse Code configuration and conversation history                                                          | Owned by Muse Code; Quint stores only its own chat metadata and selections                                                                                                         |

Browser-local UI choices are documented in [the root instructions](../AGENTS.md)
and [quintlet/chat behavior](../docs/quintlet-chats.md). Changing a module's location
must not change its storage paths or persisted formats.

## Paths and process boundaries

CLI server launches use `PACKAGE_ROOT` from `version.ts` to locate `backend/cli.ts`.
The dev supervisor watches `backend/` and `shared/` recursively. Production workers
and the skill template loader also need to resolve files inside the installed
package, independent of the user's current directory.

Keep worker entry paths and any `import.meta.dir` expressions correct when moving
files. Check dynamic imports, child-process test scripts, and documentation too.
The release staging script includes runtime backend files and excludes tests.

`applet-engine/runtime/` contains browser-bundled sources despite living under `backend/`.
Backend code must remain React-free; the canvas executor uses
`@tldraw/store` and `@tldraw/tlschema`. The guard is
`test/backend-react-free.test.ts`.

## Checks and related guides

Run `bun run typecheck`, `bun run lint`, `bun run format:check`, and
`QUINT_SECRET_BACKEND=file bun test backend shared` for changes across backend features. Tests that open HTTP
or WebSocket servers need local network access. Some service tests are specific
to Linux; follow their skip conditions on other platforms.

- [Canvas persistence and drawing](../docs/quint-canvas.md)
- [Applet checks and runtime errors](../docs/applet-runtime.md)
- [Quintlet creation and chat handoffs](../docs/quintlet-chats.md)
- [Navigation](../docs/navigation.md)
- [UI component catalog](../docs/ui-components.md)
- [Installation and managed-user configuration](../docs/config.md)

## Chat application boundary

[The session service](sessions/service.ts) coordinates chat commands and reads
for HTTP and WebSocket entry points. The quintlet service calls it for build sends;
shared message preparation handles context and quintlet associations. Native Muse
execution stays in the harness, while workspace-storage transactions own metadata.
See [quintlet chats](../docs/quintlet-chats.md#acceptance-and-recovery) for failure,
identity, selection, and history-recovery contracts.

See [applet worker contracts](../docs/applet-workers.md#worker-contracts) for IPC,
deadlines, cancellation, and shutdown behavior.
