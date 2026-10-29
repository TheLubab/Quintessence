import { randomUUID } from "node:crypto";

import type { Space, Thing, Value } from "../core/contracts.ts";

import type { Operation, OperationResult } from "../core/actions.ts";

import { idList, parseInvocation } from "../core/actions.ts";

import { dataValue, record, text } from "../core/validation.ts";

import { AdaptError } from "../core/errors.ts";

export type CapabilityContext = {
  readonly targets: readonly Thing[];
  readonly input: Value;
};

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
      readonly signal: AbortSignal;
    },
  ): Promise<OperationResult>;
};

type Entry = {
  readonly scope: string;
  readonly spaceId: string;
  operation: Operation;
};

export function createCapabilities(onError?: (error: unknown) => void) {
  const capabilities = new Map<string, Capability>();
  const operations = new Map<string, Entry>();
  const tasks = new Set<Promise<void>>();
  const controller = new AbortController();

  let closing = false;

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

    const entry: Entry = {
      scope,
      spaceId: space.id,
      operation,
    };

    operations.set(operation.id, entry);

    // Capture the acceptance response before background execution starts.
    const accepted = structuredClone(operation);

    const task = Promise.resolve().then(async () => {
      try {
        const output = await capability.run({
          ...structuredClone(context),
          space,
          signal: controller.signal,
        });

        const fields = record(dataValue(output), ["things"]);

        const result: OperationResult = {
          things: idList(fields.things, "result things"),
        };

        // Results must refer to things in this same authorized space.
        for (const id of result.things) {
          if (!(await space.get(id))) {
            throw new Error(
              `Capability returned a missing result thing: ${id}`,
            );
          }
        }

        entry.operation = {
          ...operation,
          status: "succeeded",
          finishedAt: Date.now(),
          result,
        };
      } catch (error) {
        report(error);

        entry.operation = {
          ...operation,
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
                  message: "The operation could not be completed",
                },
        };
      }
    });

    tasks.add(task);

    void task.then(() => {
      tasks.delete(task);
    });

    return accepted;
  }

  function get(scope: string, spaceId: string, id: string): Operation {
    const entry = operations.get(text(id, "operation id"));

    if (!entry || entry.scope !== scope || entry.spaceId !== spaceId) {
      throw new AdaptError("NOT_FOUND", "Operation not found");
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
    close,
  };
}
