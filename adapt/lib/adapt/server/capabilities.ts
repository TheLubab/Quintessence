import { randomUUID } from "node:crypto";

import type { Space, Thing, Value } from "../core/contracts.ts";

import type {
  Operation,
  OperationResult,
} from "../core/actions.ts";

import { idList, parseInvocation } from "../core/actions.ts";

import { dataValue, record, text } from "../core/validation.ts";

import { AdaptError } from "../core/errors.ts";

import type { OperationProgress } from "../core/actions.ts";

export type CapabilityContext = {
  readonly targets: readonly Thing[];
  readonly input: Value;
  readonly reportProgress?: (progress: OperationProgress) => void;
};

export type CapabilityResult = OperationResult;

export type Capability = {
  /** Applicability only; authorization comes from the scoped runtime. */
  supports(context: CapabilityContext): boolean;

  /**
   * Input must be null when this is omitted.
   * Supplied validators must be synchronous and side-effect-free.
   */
  validateInput?(input: Value): boolean;

  run(
    context: CapabilityContext & {
      readonly space: Space;
      readonly operationId: string;
      readonly signal: AbortSignal;
    },
  ): Promise<CapabilityResult>;
};

export type OperationPersistence = {
  get(scope: string, spaceId: string, id: string): Operation | undefined;
  put(scope: string, spaceId: string, operation: Operation): void;
  interruptRunning?(now: number, message: string): number;
  close?(): void;
};

type Entry = {
  readonly scope: string;
  readonly spaceId: string;
  readonly space: Space;
  readonly capability: Capability;
  readonly context: CapabilityContext;
  readonly controller: AbortController;
  operation: Operation;
  cancelled: boolean;
};

export function createCapabilities(
  onError?: (error: unknown) => void,
  persistence?: OperationPersistence,
) {
  const capabilities = new Map<string, Capability>();
  const operations = new Map<string, Entry>();
  const tasks = new Set<Promise<void>>();
  const controller = new AbortController();

  let closing = false;

  if (persistence?.interruptRunning) {
    persistence.interruptRunning(
      Date.now(),
      "The server restarted before this operation finished. It was not resumed.",
    );
  }

  function assertOpen(): void {
    if (closing) {
      throw new AdaptError("CONFLICT", "Server is shutting down");
    }
  }

  function report(error: unknown): void {
    try {
      onError?.(error);
    } catch {
      // Logging must not prevent an operation reaching a terminal state.
    }
  }

  function persist(entry: Entry): void {
    try {
      persistence?.put(entry.scope, entry.spaceId, entry.operation);
    } catch (error) {
      report(error);
    }
  }

  function progress(entry: Entry, value: OperationProgress): void {
    if (entry.operation.status !== "running") return;
    entry.operation = {
      ...entry.operation,
      progress: value,
    };
    persist(entry);
  }

  function register(id: string, capability: Capability): void {
    assertOpen();
    text(id, "capability id");

    if (capabilities.has(id)) {
      throw new AdaptError("CONFLICT", `Capability already registered: ${id}`);
    }

    if (
      typeof capability.supports !== "function" ||
      typeof capability.run !== "function" ||
      (capability.validateInput !== undefined &&
        typeof capability.validateInput !== "function")
    ) {
      throw new AdaptError("INVALID_INPUT", `Invalid capability: ${id}`);
    }

    capabilities.set(id, { ...capability });
  }

  async function outcome(entry: Entry, output: CapabilityResult): Promise<void> {
    if (entry.operation.status !== "running") return;

    const fields = record(dataValue(output), ["things"]);

    const result: OperationResult = {
      things: idList(fields.things, "result things"),
    };

    // Results must refer to things in this same authorized space.
    for (const id of result.things) {
      if (!(await entry.space.get(id))) {
        throw new Error(`Capability returned a missing result thing: ${id}`);
      }
    }

    if (entry.cancelled || entry.controller.signal.aborted) {
      finishCancelled(entry, result);
      return;
    }

    entry.operation = {
      ...entry.operation,
      status: "succeeded",
      finishedAt: Date.now(),
      result,
    };

    persist(entry);
  }

  function finishCancelled(entry: Entry, result?: OperationResult): void {
    if (
      entry.operation.status === "succeeded" ||
      entry.operation.status === "failed" ||
      entry.operation.status === "cancelled"
    ) {
      return;
    }

    entry.cancelled = true;

    entry.operation = {
      id: entry.operation.id,
      capability: entry.operation.capability,
      targets: entry.operation.targets,
      input: entry.operation.input,
      startedAt: entry.operation.startedAt,
      status: "cancelled",
      finishedAt: Date.now(),
      message: "The operation was cancelled.",
      ...(result === undefined ? {} : { result }),
    };

    persist(entry);
  }

  function fail(entry: Entry, error: unknown): void {
    if (entry.cancelled) {
      finishCancelled(entry);
      return;
    }

    report(error);

    entry.operation = {
      id: entry.operation.id,
      capability: entry.operation.capability,
      targets: entry.operation.targets,
      input: entry.operation.input,
      startedAt: entry.operation.startedAt,
      status: "failed",
      finishedAt: Date.now(),
      error:
        error instanceof AdaptError
          ? {
              code: error.code,
              message: error.message,
            }
          : {
              code: "EXECUTION_FAILED",
              message:
                error instanceof Error && error.message.trim()
                  ? error.message
                  : "The operation could not be completed",
            },
    };

    persist(entry);
  }

  function start(entry: Entry, work: () => Promise<CapabilityResult>): void {
    const task = Promise.resolve()
      .then(work)
      .then((output) => outcome(entry, output))
      .catch((error: unknown) => fail(entry, error));

    tasks.add(task);

    void task.then(() => {
      tasks.delete(task);
    });
  }

  function requireEntry(
    scope: string,
    spaceId: string,
    id: string,
  ): Entry | undefined {
    const entry = operations.get(text(id, "operation id"));

    if (!entry || entry.scope !== scope || entry.spaceId !== spaceId) {
      return undefined;
    }

    return entry;
  }

  async function invoke(
    scope: string,
    space: Space,
    value: unknown,
  ): Promise<Operation> {
    assertOpen();

    const invocation = parseInvocation(value);
    const capability = capabilities.get(invocation.capability);

    if (!capability) {
      throw new AdaptError("NOT_FOUND", "Capability not found");
    }

    const validInput = capability.validateInput
      ? capability.validateInput(structuredClone(invocation.input))
      : invocation.input === null;

    if (validInput !== true) {
      throw new AdaptError("INVALID_INPUT", "Invalid capability input");
    }

    const targets = await Promise.all(
      invocation.targets.map(async (id) => {
        const thing = await space.get(id);

        if (!thing) {
          throw new AdaptError("NOT_FOUND", `Target not found: ${id}`);
        }

        return thing;
      }),
    );

    const context: CapabilityContext = {
      targets,
      input: invocation.input,
    };

    if (capability.supports(structuredClone(context)) !== true) {
      throw new AdaptError(
        "INVALID_INPUT",
        "Capability does not support these targets",
      );
    }

    assertOpen();

    const operation: Operation = {
      id: randomUUID(),
      capability: invocation.capability,
      targets: [...invocation.targets],
      input: structuredClone(invocation.input),
      status: "running",
      startedAt: Date.now(),
    };

    const operationController = new AbortController();
    const abort = () => operationController.abort();
    controller.signal.addEventListener("abort", abort, { once: true });

    const entry: Entry = {
      scope,
      spaceId: space.id,
      space,
      capability,
      context: structuredClone(context),
      controller: operationController,
      operation,
      cancelled: false,
    };

    operations.set(operation.id, entry);
    persist(entry);

    // Capture the acceptance response before background execution starts.
    const accepted = structuredClone(operation);

    start(entry, () =>
      entry.capability.run({
        ...structuredClone(entry.context),
        space: entry.space,
        operationId: operation.id,
        signal: entry.controller.signal,
        reportProgress: (value) => progress(entry, value),
      }),
    );

    return accepted;
  }

  function get(scope: string, spaceId: string, id: string): Operation {
    const entry = requireEntry(scope, spaceId, id);

    if (entry) return structuredClone(entry.operation);

    const stored = persistence?.get(scope, spaceId, id);

    if (stored) return structuredClone(stored);

    throw new AdaptError("NOT_FOUND", "Operation not found");
  }

  async function restore(
    scope: string,
    space: Space,
    operation: Operation,
  ): Promise<Entry> {
    const capability = capabilities.get(operation.capability);

    if (!capability) {
      throw new AdaptError("NOT_FOUND", "Capability not found");
    }

    const targets = await Promise.all(
      operation.targets.map(async (id) => {
        const thing = await space.get(id);

        if (!thing) {
          throw new AdaptError("NOT_FOUND", `Target not found: ${id}`);
        }

        return thing;
      }),
    );

    const operationController = new AbortController();
    const abort = () => operationController.abort();
    controller.signal.addEventListener("abort", abort, { once: true });

    const entry: Entry = {
      scope,
      spaceId: space.id,
      space,
      capability,
      context: {
        targets,
        input: operation.input,
      },
      controller: operationController,
      operation,
      cancelled: false,
    };

    operations.set(operation.id, entry);

    return entry;
  }

  async function cancel(
    scope: string,
    space: Space,
    id: string,
  ): Promise<Operation> {
    assertOpen();

    let entry = requireEntry(scope, space.id, id);

    if (!entry) {
      const stored = persistence?.get(scope, space.id, id);

      if (!stored) {
        throw new AdaptError("NOT_FOUND", "Operation not found");
      }

      entry = await restore(scope, space, stored);
    }

    if (entry.operation.status === "running") {
      entry.cancelled = true;
      entry.controller.abort();
      finishCancelled(entry);
    }

    return structuredClone(entry.operation);
  }

  async function close(): Promise<void> {
    closing = true;
    controller.abort();

    // Storage must stay open until existing handlers finish.
    await Promise.allSettled([...tasks]);

    operations.clear();
    capabilities.clear();
  }

  return {
    register,
    invoke,
    get,
    cancel,
    close,
  };
}