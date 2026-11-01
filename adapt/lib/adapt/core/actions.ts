import type { Value } from "./contracts.ts";
import { AdaptError } from "./errors.ts";
import { dataValue, record, text } from "./validation.ts";

/** A contextual offer to invoke a registered capability. */
export type ActionDescriptor = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;

  /** Semantic category, not a prescribed UI location. */
  readonly category?: string;

  readonly capability: string;
  readonly targets: readonly string[];
  readonly input?: Value;

  readonly recommendation?: {
    readonly relevance: number;
    readonly reason?: string;
  };
};

/** An action resolved from one contributor in a session. */
export type OfferedAction = ActionDescriptor & {
  readonly source: string;
  readonly busy: boolean;
};

export type Invocation = {
  readonly capability: string;
  readonly targets: readonly string[];
  readonly input?: Value;
};

export type OperationResult = {
  readonly things: readonly string[];
};

export type OperationProgress = {
  readonly stage: string;
  readonly detail?: string;
};

type OperationBase = {
  readonly id: string;
  readonly capability: string;
  readonly targets: readonly string[];

  /** Omitted invocation input is normalized to null. */
  readonly input: Value;

  readonly startedAt: number;
  readonly progress?: OperationProgress;
};

export type Operation = OperationBase &
  (
    | {
        readonly status: "running";
      }
    | {
        readonly status: "succeeded";
        readonly finishedAt: number;
        readonly result: OperationResult;
      }
    | {
        readonly status: "failed";
        readonly finishedAt: number;
        readonly error: {
          readonly code: string;
          readonly message: string;
        };
      }
    | {
        readonly status: "cancelled";
        readonly finishedAt: number;
        readonly message: string;
        readonly result?: OperationResult;
      }
  );

/** Execution transport for one authorized space. */
export interface OperationClient {
  invoke(input: Invocation): Promise<Operation>;
  get(id: string): Promise<Operation>;
  cancel(id: string): Promise<Operation>;
}

export function idList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new AdaptError("INVALID_INPUT", `${field} must be an array`);
  }

  const ids = value.map((item: unknown) => text(item, field));

  if (new Set(ids).size !== ids.length) {
    throw new AdaptError(
      "INVALID_INPUT",
      `${field} must not contain duplicate IDs`,
    );
  }

  return ids;
}

export function parseInvocation(value: unknown): {
  capability: string;
  targets: readonly string[];
  input: Value;
} {
  const fields = record(dataValue(value), ["capability", "targets", "input"]);

  return {
    capability: text(fields.capability, "capability"),
    targets: idList(fields.targets, "targets"),
    input: "input" in fields ? dataValue(fields.input) : null,
  };
}

export function actionList(value: unknown): readonly ActionDescriptor[] {
  const snapshot = dataValue(value);

  if (!Array.isArray(snapshot)) {
    throw new AdaptError("INVALID_INPUT", "actions must be an array");
  }

  const ids = new Set<string>();

  return snapshot.map((item: unknown): ActionDescriptor => {
    const fields = record(item, [
      "id",
      "label",
      "description",
      "category",
      "capability",
      "targets",
      "input",
      "recommendation",
    ]);

    const id = text(fields.id, "action id");

    if (ids.has(id)) {
      throw new AdaptError(
        "INVALID_INPUT",
        `Duplicate action within a contribution: ${id}`,
      );
    }

    ids.add(id);

    const action: {
      id: string;
      label: string;
      description?: string;
      category?: string;
      capability: string;
      targets: readonly string[];
      input?: Value;
      recommendation?: {
        relevance: number;
        reason?: string;
      };
    } = {
      id,
      label: text(fields.label, "action label"),
      capability: text(fields.capability, "capability"),
      targets: idList(fields.targets, "targets"),
    };

    if ("description" in fields) {
      if (typeof fields.description !== "string") {
        throw new AdaptError("INVALID_INPUT", "description must be a string");
      }

      action.description = fields.description;
    }

    if ("category" in fields) {
      action.category = text(fields.category, "category");
    }

    if ("input" in fields) {
      action.input = dataValue(fields.input);
    }

    if ("recommendation" in fields) {
      const recommendation = record(fields.recommendation, [
        "relevance",
        "reason",
      ]);

      const relevance = recommendation.relevance;

      if (
        typeof relevance !== "number" ||
        !Number.isFinite(relevance) ||
        relevance < 0 ||
        relevance > 1
      ) {
        throw new AdaptError(
          "INVALID_INPUT",
          "relevance must be between 0 and 1",
        );
      }

      action.recommendation = { relevance };

      if ("reason" in recommendation) {
        if (typeof recommendation.reason !== "string") {
          throw new AdaptError(
            "INVALID_INPUT",
            "recommendation reason must be a string",
          );
        }

        action.recommendation.reason = recommendation.reason;
      }
    }

    return action;
  });
}
