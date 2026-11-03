# Applet workers

## Server functions

`functions.ts` manages a bounded pool of workspace worker processes;
`functions-worker.ts` loads `.server.ts` modules and handles calls and reloads.
Browser RPC uses this pool. `call-server-fn` uses a fresh worker for its one-shot
call, so it does not share a warm worker's module state.

Workers start from a neutral directory to avoid Bun automatically loading a
workspace `.env`, then switch to the workspace root. The parent supplies the
resolved workspace environment. Module paths remain relative to `.quint/`.
Changes to server modules cause workers to dispose cached modules and restart.

The relevant tests are `backend/test/applet-log.test.ts`,
`backend/test/applet-typecheck.test.ts`, `backend/test/functions.test.ts`,
`backend/test/functions-worker.test.ts`, and `backend/test/server-dep-reload.test.ts`.

## Worker contracts

Function and build workers use versioned, validated Bun IPC messages defined in
[worker-protocol.ts](../backend/applet-engine/worker-protocol.ts). Every call or build batch has a
request ID. Function arguments and results retain their `devalue` encoding;
public applet RPC and build-result formats are unchanged. Transport validation
protects the internal contract; it does not sandbox applet code.

[worker-request.ts](../backend/applet-engine/worker-request.ts) owns settlement and cleanup of each
request's deadline and abort listener. Internal `WorkerError.code` distinguishes
execution, protocol, transport, exit, timeout, cancellation, and shutdown errors.
Results settle once; late replies cannot revive cancelled requests.

Function startup has a 10-second deadline. Calls have a 30-second total deadline,
including readiness. Build batches have a 120-second deadline. Internal callers
may pass `signal` and `timeoutMs`; HTTP applet RPC forwards request cancellation.
A cancelled or timed-out function retires its entire workspace worker, rejecting
other in-flight calls there. Arbitrary JavaScript cannot be interrupted safely
within a shared process. Termination prevents further execution in that worker;
it cannot undo side effects already committed or stop independently spawned
external processes. The next request creates a fresh worker; calls are never
retried automatically.

Server shutdown tracks pooled, ephemeral, and retiring function workers. Function
workers get two seconds to run loaded modules' `dispose()` hooks before a forced
kill. Builds are terminated immediately. Shutdown waits for child exits, and
cancelled builds settle only after their child exits so it cannot continue
writing bundles after cancellation. Workers also exit when their parent is gone.
