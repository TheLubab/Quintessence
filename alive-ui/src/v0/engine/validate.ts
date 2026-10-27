import type { CheckedOp, Op, RawProps } from "../protocol/ops";
import {
  canFire,
  checkProps,
  isAction,
  isEvent,
  isId,
  isKind,
  kindDef,
} from "../protocol/schema";
import type { CheckedProps, PropValue } from "../protocol/schema";
import type { Store } from "./store";

export interface Limits {
  nodesPerCard: number;
  propLength: number;
  opsPerTurn: number;
}

export const LIMITS: Limits = {
  nodesPerCard: 500,
  propLength: 16_000,
  opsPerTurn: 400,
};

export interface ValidateCtx {
  opsThisTurn?: number;
  limits?: Partial<Limits>;
}

export type Validated =
  | { ok: true; op: CheckedOp }
  | { ok: false; reason: string };

const ok = (op: CheckedOp): Validated => ({ ok: true, op });
const reject = (reason: string): Validated => ({ ok: false, reason });

const idError = (id: unknown): string | null => {
  if (typeof id !== "string") return "id must be a string";
  if (id === "on") return '"on" is reserved';
  return isId(id)
    ? null
    : `bad id "${id}" (start with a letter, then a-z 0-9 _ . -)`;
};

const propError = (
  key: string,
  value: PropValue,
  max: number,
): string | null =>
  typeof value === "string" && value.length > max
    ? `prop "${key}" exceeds ${max} characters`
    : null;

const limit = <K extends keyof Limits>(ctx: ValidateCtx, key: K): Limits[K] =>
  ctx.limits?.[key] ?? LIMITS[key];

export function validate(
  store: Store,
  op: Op,
  ctx: ValidateCtx = {},
): Validated {
  if (!op || typeof op !== "object" || typeof op.t !== "string") {
    return reject("not an operation");
  }

  if ((ctx.opsThisTurn ?? 0) >= limit(ctx, "opsPerTurn")) {
    return reject(`turn op limit of ${limit(ctx, "opsPerTurn")} reached`);
  }

  switch (op.t) {
    case "create":
      return create(store, op, ctx);
    case "update":
      return update(store, op, ctx);
    case "delete":
      return del(store, op);
    case "move":
      return move(store, op, ctx);
    case "rule_add":
      return ruleAdd(store, op);
    case "rule_del":
      return ruleDel(store, op);
    default:
      return reject(`unknown operation "${String((op as { t: unknown }).t)}"`);
  }
}

function create(
  store: Store,
  op: Extract<Op, { t: "create" }>,
  ctx: ValidateCtx,
): Validated {
  if (!isKind(op.kind)) {
    return reject(`unknown kind "${String(op.kind)}"`);
  }

  const ie = idError(op.id);
  if (ie) return reject(ie);

  const existing = store.get(op.id);
  if (existing && existing.kind !== op.kind) {
    return reject(
      `id "${op.id}" already exists as ${existing.kind}; use - then + to change kind`,
    );
  }

  const def = kindDef(op.kind);
  if (def.root && op.in !== undefined) {
    return reject(`${op.kind} is a root kind and cannot have in=`);
  }
  if (!def.root && op.in === undefined) {
    return reject(`${op.kind} needs in=ID`);
  }

  if (existing) {
    const parent = existing.parent;
    if ((op.in ?? null) !== parent) {
      return reject(
        `id "${op.id}" already exists under ${parent === null ? "top level" : `"${parent}"`}; use > to move it`,
      );
    }
  } else {
    const maxNodes = limit(ctx, "nodesPerCard");
    if (op.in !== undefined) {
      const pe = idError(op.in);
      if (pe) return reject(`in=${String(op.in)}: ${pe}`);
      const parent = store.get(op.in);
      if (!parent) return reject(`parent "${op.in}" does not exist`);
      if (!kindDef(parent.kind).container) {
        return reject(`parent "${op.in}" is not a container`);
      }
      const card = store.cardOf(op.in);
      if (card && store.nodeCount(card) + 1 > maxNodes) {
        return reject(`card "${card}" node limit of ${maxNodes} reached`);
      }
    } else if (maxNodes < 1) {
      return reject(`card node limit of ${maxNodes} reached`);
    }
  }

  const checked = checkProps(op.kind, (op.props ?? {}) as RawProps);
  const props: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(checked.props)) {
    if (value === null) continue;
    const pe = propError(key, value, limit(ctx, "propLength"));
    if (pe) return reject(pe);
    props[key] = value;
  }

  return ok({
    t: "create",
    kind: op.kind,
    id: op.id,
    ...(op.in !== undefined ? { in: op.in } : {}),
    props,
    issues: checked.issues,
    ...(existing ? { replace: true as const } : {}),
  });
}

function update(
  store: Store,
  op: Extract<Op, { t: "update" }>,
  ctx: ValidateCtx,
): Validated {
  const ie = idError(op.id);
  if (ie) return reject(ie);
  const node = store.get(op.id);
  if (!node) return reject(`unknown id "${op.id}"`);

  const checked = checkProps(node.kind, (op.props ?? {}) as RawProps);
  const keys = Object.keys(checked.props);
  if (keys.length === 0) {
    const detail = checked.issues.length
      ? `: ${checked.issues.join("; ")}`
      : "";
    return reject(`nothing to update${detail}`);
  }

  const props: CheckedProps = {};
  for (const [key, value] of Object.entries(checked.props)) {
    if (value !== null) {
      const pe = propError(key, value, limit(ctx, "propLength"));
      if (pe) return reject(pe);
    }
    props[key] = value;
  }

  let noop = true;
  for (const [key, value] of Object.entries(props)) {
    if (value === null) {
      if (key in node.props) noop = false;
    } else if (node.props[key] !== value) {
      noop = false;
    }
  }

  return ok({ t: "update", id: op.id, props, issues: checked.issues, noop });
}

function del(
  store: Store,
  op: Extract<Op, { t: "delete" }>,
): Validated {
  const ie = idError(op.id);
  if (ie) return reject(ie);
  if (!store.has(op.id)) return reject(`unknown id "${op.id}"`);
  return ok({ t: "delete", id: op.id });
}

function move(
  store: Store,
  op: Extract<Op, { t: "move" }>,
  ctx: ValidateCtx,
): Validated {
  const ie = idError(op.id);
  if (ie) return reject(ie);
  const node = store.get(op.id);
  if (!node) return reject(`unknown id "${op.id}"`);
  if (node.parent === null || kindDef(node.kind).root) {
    return reject("cards cannot be moved");
  }

  const pe = idError(op.in);
  if (pe) return reject(`in=${String(op.in)}: ${pe}`);
  const parent = store.get(op.in);
  if (!parent) return reject(`parent "${op.in}" does not exist`);
  if (!kindDef(parent.kind).container) {
    return reject(`parent "${op.in}" is not a container`);
  }
  if (op.in === op.id || store.isInside(op.in, op.id)) {
    return reject("cannot move a node into itself or its subtree");
  }

  if (op.at) {
    if (op.at.rel !== "before" && op.at.rel !== "after") {
      return reject(`bad placement "${String(op.at.rel)}"`);
    }
    const re = idError(op.at.ref);
    if (re) return reject(`${op.at.rel}=${String(op.at.ref)}: ${re}`);
    if (op.at.ref === op.id) {
      return reject("cannot place a node relative to itself");
    }
    const ref = store.get(op.at.ref);
    if (!ref) return reject(`reference "${op.at.ref}" does not exist`);
    if (ref.parent !== op.in) {
      return reject(`reference "${op.at.ref}" is not inside "${op.in}"`);
    }
  }

  const fromCard = store.cardOf(op.id);
  const toCard = store.cardOf(op.in);
  if (toCard && fromCard !== toCard) {
    const maxNodes = limit(ctx, "nodesPerCard");
    if (store.nodeCount(toCard) + store.subtreeSize(op.id) > maxNodes) {
      return reject(`card "${toCard}" node limit of ${maxNodes} reached`);
    }
  }

  return ok({
    t: "move",
    id: op.id,
    in: op.in,
    ...(op.at ? { at: op.at } : {}),
  });
}

function ruleAdd(
  store: Store,
  op: Extract<Op, { t: "rule_add" }>,
): Validated {
  const ie = idError(op.id);
  if (ie) return reject(ie);
  const node = store.get(op.id);
  if (!node) return reject(`unknown id "${op.id}"`);
  if (!isEvent(op.event)) {
    return reject(`unknown event "${String(op.event)}"`);
  }
  if (!canFire(op.event, node.kind)) {
    return reject(`event "${op.event}" cannot fire on ${node.kind}`);
  }
  if (!op.action || !isAction(op.action.type)) {
    return reject(`unknown action "${String(op.action?.type)}"`);
  }
  if (typeof op.action.intent !== "string") {
    return reject("rule intent must be a string");
  }
  return ok({
    t: "rule_add",
    id: op.id,
    event: op.event,
    action: { type: op.action.type, intent: op.action.intent },
  });
}

function ruleDel(
  store: Store,
  op: Extract<Op, { t: "rule_del" }>,
): Validated {
  const ie = idError(op.id);
  if (ie) return reject(ie);
  const node = store.get(op.id);
  if (!node) return reject(`unknown id "${op.id}"`);
  if (!isEvent(op.event)) {
    return reject(`unknown event "${String(op.event)}"`);
  }
  if (!node.rules.has(op.event)) {
    return reject(`rule ${op.id} ${op.event} does not exist`);
  }
  return ok({ t: "rule_del", id: op.id, event: op.event });
}

const rawProps = (props: Record<string, PropValue | null>): RawProps => {
  const out: RawProps = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = value === null ? null : String(value);
  }
  return out;
};

export function toRawOp(op: CheckedOp): Op {
  switch (op.t) {
    case "create":
      return {
        t: "create",
        kind: op.kind,
        id: op.id,
        ...(op.in !== undefined ? { in: op.in } : {}),
        props: rawProps(op.props),
      };
    case "update":
      return { t: "update", id: op.id, props: rawProps(op.props) };
    case "delete":
      return { t: "delete", id: op.id };
    case "move":
      return {
        t: "move",
        id: op.id,
        in: op.in,
        ...(op.at ? { at: op.at } : {}),
      };
    case "rule_add":
      return {
        t: "rule_add",
        id: op.id,
        event: op.event,
        action: op.action,
      };
    case "rule_del":
      return { t: "rule_del", id: op.id, event: op.event };
  }
}