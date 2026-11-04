# Harness

Quint has one harness: **Meta**, implemented against **Muse Code**. The agent
loop does not live in this repository: a `muse serve` host owns the model,
tools, permissions, and conversation history; Quint is the UI and workspace
host. The transport is the official `@muse-code/sdk` over the Muse Session
Protocol (MSP).

## Layers

```
1. runtime wire      Muse Session Protocol (MSP) frames          @muse-code/sdk
   │
   ▼
2. display           Turn / Part / ToolCall / StreamEvent           shared/format.ts
   │
   ▼
3. socket            ClientMessage / ServerMessage                  shared/types.ts
   │
   ▼
4. frontend          React Query transcript + ephemeral previews    frontend/features/chat/*
```

`backend/agents/meta/adapter.ts` is the only place that maps Muse items to the
shared display format. Everything above it speaks the socket contract.

## Files

```
backend/agents/
  README.md          this file
  types.ts           the Harness contract
  registry.ts        WorkspaceType -> harness lookup (meta only)
  auth.ts            cached readiness and login lifecycle
  debug.ts           wire/client-frame taps
  fork.ts            native-fork fallback helpers
  meta/
    config.ts        MUSE_BIN / MUSE_ARGS / META_API_KEY
    client.ts        muse serve host lifecycle + MSP connection
    adapter.ts       Muse item -> display events
    session.ts       sessions, turns, previews, interrupt, history
    models.ts        Muse model catalog exposed to the picker
    index.ts         the Harness object
```

## Configuration

```sh
MUSE_BIN=muse                 # default; absolute paths are supported
MUSE_ARGS=serve, --verbose    # trust and host networking defaults are also applied
META_API_KEY=...              # optional when `muse` already has a login
MUSE_SHUTDOWN_TIMEOUT_MS=...  # optional
MUSE_BACKGROUND_OBSERVERS=1  # opt in to Muse's additional observer model calls
```

One host is spawned per workspace with `cwd` set to the workspace root. The host
owns credentials, model discovery (`model/list`), session persistence
(`session/list`, `session/resume`), and pending approvals. Quint displays the host-provided choices and returns decisions for the exact stage. Project skills load from
`<workspace>/.agents/skills`, which Muse Code scans natively.

## Status

Chat, model catalog, session list/replay, live turns, previews, interrupts, and
forks are wired through `@muse-code/sdk`. The host is started with
`--trust-workspace`, so project skills and rules load without a manual prompt;
this grants per-run trust and does not persist it in Muse settings.
`--sandbox-network enabled` keeps the filesystem sandbox but gives the agent
shell host networking, which it needs for Quint's loopback control port. Without
it, `quint bundle`, `quint refresh`, and every other workspace CLI command fail from
inside the agent even though the server is running. Agent questions use Muse's
native `userInput/request` flow and are rendered in the chat composer.

Custom `MUSE_ARGS` retain these defaults unless an explicit network policy or
`--disable-sandbox` is supplied. Restart Quint after changing runtime arguments:
the sandbox is fixed for the lifetime of each Muse host.

Context usage is current occupancy; window size is capacity, not a token charge.
Chat usage is cumulative across main-agent model calls, including cached input.
Muse background agents (such as reminders) can add dashboard usage that is not
included in the session counter.

Quint disables the reminder roster by default to avoid extra background model
calls on small requests. Set `MUSE_BACKGROUND_OBSERVERS=1` to restore the runtime
default. Existing conversation history is retained; use a new chat to avoid
resending a long previous conversation.

On POSIX systems, agent PATH starts with a Quint launcher pinned to the running
server's Bun executable, package root, and control port. It does not depend on
the workspace's current directory or whichever global `quint` was installed last.

## Model and approval boundaries

`shared/meta-models.ts` identifies supported Meta chat families independently from
the hosting provider. The picker filters the runtime catalog, and every turn
resolves its model against that same catalog before opening or sending a session.
An omitted/default selection resolves to a concrete eligible ID. Saved settings
reject unsupported families at the API boundary as well.

New and resumed sessions use `onRequest`. `approvals.ts` normalizes requests and
validates responses against the current requirement and available choices. The
chat panel displays these choices; only host notifications settle the request.
Resume failures are surfaced without silently creating a replacement chat.
Retained-session refusals return an actionable conflict response for chat history
and state reads. The original Muse error is kept as the cause in server logs;
Quint does not rewrite or delete the retained session. Starting a new chat is a
way to continue, not a repair of the original session log.

Device sign-in subscribes to completion notifications before requesting a code.
Finished login attempts cannot cancel a later attempt. Failed sign-in details
remain visible across page reloads, and the sign-in status retry bypasses the
availability cache.

## Application lifecycle boundary

The session service supplies a typed rename callback when sending. The adapter
awaits it before exposing a new native session ID, without writing application
selection or quintlet metadata itself. `sendMessage` resolves at native acceptance
or queueing and rejects startup failures. Entry points report these rejections;
the harness only emits error frames for failures after acceptance. Native
execution state stays in the adapter; the application service adds no second
persisted run state machine.
