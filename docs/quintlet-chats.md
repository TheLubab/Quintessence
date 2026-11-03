# Quintlet chats

A quintlet has one permanent ID and one `quintlets/<id>` tab from its sketch screen through
its compiled applet. The quintlets API returns a flat union: unfinished quintlets carry a
startup `status`, while compiled quintlets carry `status: "compiled"`. `GET /quintlets` lists
compiled quintlets; unfinished ones come from the workspace state (`GET /state`), and the
frontend merges the two. Muse Code owns native execution, queued turns, approvals,
and transcript history.

Chats belong to a workspace. A chat's `tabId` in the workspace state optionally attributes it to
a quintlet or Canvas. Completion and navigation do not transfer chat ownership;
completion does not change selection.
The displayed chat is `pinnedSessionId ?? selectedSessionIdForTab ?? null`.
A null selection means a fresh composer. Its first send creates an attached chat.

## Creation

See [quintlet creation](quintlet-workflow.md) for manual creation, CLI handoff, and pinned-chat behavior.

## Agent context

Build instructions are sent once when a chat starts working on a pending quintlet.
They supply the quintlet ID, source path, metadata command, icons, and final link.
A fresh chat receives the saved requirements and can resume only when the previous
builder is idle. Forked requests include a reminder to treat inherited history as background.

Browser messages include `activeTab` with its ID, title, and URL parameters, plus
`applet: { kind, id }` for applet sends. The server supplies `session: { id, tabId, pinned }`
on every send. Matching applet and active-quintlet details are rendered once. Programmatic
sends omit an unknown `activeTab`; fork provenance remains internal. Agents build in
place when pinned and use `--from-session` with the current session ID otherwise.

## State and completion

Each workspace's `DATA_DIR/workspaces/<workspace id>/state.json` holds its pending
quintlets. Their startup statuses are `draft`, `starting`, `submitted`, and `failed`.
Building/waiting presentation derives from normal session activity.
`buildSessionId` identifies the builder, including
pinned execution, independently of chat attribution. Ordinary messages update build state
only when the sending chat matches this ID.

`quint quintlets set <id> --title "…" --icon <id>` updates pending metadata only. A successful
bundle reveals the compiled quintlet, whose manifest config supplies its title/icon, and
removes the pending record. There is no completion-time chat or tab reassignment.

The same `state.json` holds chat attribution, fork provenance, and run settings, plus
per-tab selections and the workspace pin. Submitting a quintlet and renaming a chat each
update it in one write. `GET /api/workspaces/:id/state` returns it; every write
(`PUT`/`DELETE /sessions/:id/pin`, `PUT`/`DELETE /sessions/:id/selection`,
`PATCH /sessions/:id/config`, `POST /sessions/:id/archive`) answers with the new state,
and every change is published as `state:changed` with the whole state. A `revision`
that goes up with each change lets clients drop an older copy that arrives late.
With Collab enabled, unpinned selections are local to each browser tab. Until a
browser tab chooses a chat, it uses the server selection so CLI quintlet handoffs open
on their child chat. Choosing New chat saves an explicit empty selection locally.
The workspace pin remains shared.
Browser composer drafts use session identity or the fresh quintlet-tab identity.
Native session renames move those session references together.

## Failures and history

`fork.fromSessionId` is saved immediately after child creation. When the initial child
history read finds copied turns, `fork.throughMessageId` identifies the last
one. Inherited turns and notices stay hidden behind a context indicator. When
there is no cutoff, the full transcript remains visible. A failed initial read
does not block the build or later sends, and later reads never move the cutoff.

Startup failures preserve created chats, their IDs, and the error for explicit retry.
Errors report the child ID and, if already created, the quintlet ID. Interrupted
startup becomes failed on restart. Inference is never replayed automatically on
restart or reconnect. Deleting or discarding a quintlet archives every chat attributed
to its tab, preserving attribution, history, and fork provenance. Existing workspace
chats used for pinned execution keep their attribution and remain active. Archived
chats are removed from selections and the workspace pin. An archive failure keeps the
quintlet available to retry. A running pending quintlet can be closed, but not discarded.
`session_archived` notifications clear the chat from every connected browser's cache and local
selections. Local selections become explicitly empty so they do not fall back to
another server-selected chat. Unrelated selections and pins remain unchanged.

## Attachments

Quint stages uploads on the server and passes workspace-scoped references to the
chat backend. Images are resized and encoded as Muse image inputs; other files
are materialized as paths. The transcript preserves attachment labels and
previews across session replay.

Unknown, expired, or out-of-workspace references produce an error rather than
silently sending a turn without its attachments. The implementation is in
[uploads.ts](../backend/uploads.ts),
[attachment-message.ts](../backend/sessions/attachment-message.ts), and the
[Meta adapter](../backend/agents/meta/adapter.ts).

## Implementation

`backend/sessions/service.ts` is the application entry point for chat operations.
HTTP and WebSocket handlers call it; CLI quintlet commands call the quintlet service,
which uses the same session service for sends. `message-preparation.ts` prepares
context and pending-quintlet associations without depending on the quintlet service.
`backend/sessions/quintlet-sessions.ts` coordinates quintlet creation and handoffs.
`pending-quintlets.ts` in the same directory owns pending-quintlet persistence;
`store.ts` owns chat entries, `selected.ts` owns selections and pins,
`archive.ts` owns archiving, and `lifecycle.ts` coordinates ID renames.
Compiled quintlet manifests and build completion live in `backend/applet-engine/quintlets.ts`.
CLI creation and metadata commands live in `backend/cli/commands/quintlets.ts`.
On the frontend, `frontend/features/workspace/workspace-state.ts` owns the one state cache,
its writes, and the app-wide `state:changed` listener.

## Acceptance and recovery

A send resolves after Muse accepts or queues it. Startup errors reject to the
HTTP, WebSocket, or control handler, which reports the error once. Accepted turns
continue asynchronously; subsequent failures arrive as session events.

Native ID changes call a typed session-service lifecycle callback. Metadata is
committed atomically before the alias is published and browsers are notified.
Browsers move selections, drafts, activity, and cached history to the native ID,
cancel obsolete requests, and refresh the native snapshot. Live events arriving
during history loading are buffered and reconciled by stable message identity.
Failed history loads preserve cached content and expose retry.
