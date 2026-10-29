import type { ActionDescriptor, Page, Value } from "./contracts.ts";

import type { StorageList } from "../storage/contracts.ts";
import { AdaptError } from "./errors.ts";

/** Reject getters, symbols, and hidden fields instead of losing them. */
export function record(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new AdaptError("INVALID_INPUT", "Expected a plain object");
  }

  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!;

    if (
      typeof key !== "string" ||
      !keys.includes(key) ||
      !field.enumerable ||
      !("value" in field) ||
      field.value === undefined
    ) {
      throw new AdaptError("INVALID_INPUT", `Invalid field: ${String(key)}`);
    }
  }

  return value as Record<string, unknown>;
}

export function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdaptError("INVALID_INPUT", `${field} must be a nonempty string`);
  }

  return value;
}

export function parentId(value: unknown): string | null {
  return value === null ? null : text(value, "parent");
}

function validateValue(
  value: unknown,
  ancestors = new Set<object>(),
): asserts value is Value {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }

  if (typeof value !== "object" || value === null) {
    throw new AdaptError("INVALID_INPUT", "Data must be JSON values");
  }

  if (ancestors.has(value)) {
    throw new AdaptError("INVALID_INPUT", "Data must not contain cycles");
  }

  ancestors.add(value);

  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Reflect.ownKeys(value).length !== value.length + 1
    ) {
      throw new AdaptError(
        "INVALID_INPUT",
        "Data must contain plain, dense arrays",
      );
    }

    for (let index = 0; index < value.length; index++) {
      const field = Object.getOwnPropertyDescriptor(value, index);

      if (!field?.enumerable || !("value" in field)) {
        throw new AdaptError("INVALID_INPUT", "Invalid array element");
      }

      validateValue(field.value, ancestors);
    }
  } else {
    const object = record(value, Object.keys(value));

    for (const item of Object.values(object)) {
      validateValue(item, ancestors);
    }
  }

  ancestors.delete(value);
}

/** Use the same JSON representation in either adapter. */
export function dataValue(value: unknown): Value {
  validateValue(value);

  return JSON.parse(JSON.stringify(value)) as Value;
}

export function actionList(value: unknown): readonly ActionDescriptor[] {
  const snapshot = dataValue(value);

  if (!Array.isArray(snapshot)) {
    throw new AdaptError("INVALID_INPUT", "actions must be an array");
  }

  const ids = new Set<string>();

  return snapshot.map((item: unknown) => {
    const action = record(item, ["id", "label", "description"]);
    const id = text(action.id, "action id");
    const label = text(action.label, "action label");

    if (ids.has(id)) {
      throw new AdaptError("INVALID_INPUT", `Duplicate action: ${id}`);
    }

    ids.add(id);

    if ("description" in action) {
      if (typeof action.description !== "string") {
        throw new AdaptError("INVALID_INPUT", "Invalid action description");
      }

      return {
        id,
        label,
        description: action.description,
      };
    }

    return { id, label };
  });
}

export function pagination(options: Record<string, unknown>): StorageList {
  const limit = "limit" in options ? options.limit : 50;

  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 200
  ) {
    throw new AdaptError(
      "INVALID_INPUT",
      "limit must be an integer from 1 to 200",
    );
  }

  const after = "after" in options ? text(options.after, "after") : null;

  return { limit, after };
}

export function page<T extends { readonly id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const items = rows.slice(0, limit);

  return {
    items,
    next: rows.length > limit ? items.at(-1)!.id : null,
  };
}
