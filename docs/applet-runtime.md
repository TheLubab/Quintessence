# Applet runtime and diagnostics

Agents can check applet source, rebuild it, call server functions, and inspect
errors reported by the running app. The implementation lives in `backend/applet-engine/`;
CLI entry modules live in `backend/cli/commands/`.

## Commands

- `quint check` typechecks applet source with Quint's bundled declarations and Bun
  types. `--only` narrows it to a kind or one applet.
- `quint bundle` rebuilds changed widgets and quintlets. `--force` rebuilds even when
  sources appear unchanged; `--only` narrows the selection.
- `quint call-server-fn widgets/example/getGreeting '["Ann"]'` invokes an exported
  `.server.ts` function in a separate one-shot worker and prints its result.
- `quint debug logs` prints current applet errors. `--json` emits structured output,
  `--only` filters applets, and `--clear` clears the journal.

Use each command's `--help` for its arguments. A successful typecheck or build
cannot confirm browser rendering or external service behavior; inspect those
through the app and error journal where relevant.

## Error journal

`backend/applet-engine/log.ts` holds an in-memory journal per workspace. Browser module
load failures, render errors, attributed window errors, server-function errors,
and failed builds feed it. Browser reports enter through the workspace
`/applet-log` API route; server-side failures are recorded at their source.

Each workspace keeps up to 100 entries. Repeated errors with the same source,
attribution, and message update their count and timestamp. Messages and stacks
are capped. Restarting the server clears the journal.

A successful rebuild clears errors for the rebuilt applet and its rebuilt
server modules. Entries for removed applets are cleared during build-result
reconciliation. Failed and skipped builds do not clear still-relevant errors.

For worker lifecycle, timeouts, and shutdown behavior, see [applet workers](applet-workers.md).
