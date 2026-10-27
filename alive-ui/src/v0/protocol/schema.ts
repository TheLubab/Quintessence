import { z } from "zod";

export const SCHEMA_VERSION = 1;

/* ---------- lexical rules ---------- */

export const ID_RE = /^[a-z][a-z0-9_.-]*$/;
export const TAG_RE = /^[A-Z_]+$/; // heredoc terminator
export const isId = (s: string) => ID_RE.test(s) && s !== "on"; // `on` is reserved

/* ---------- props ---------- */

/** A validated prop value as stored in the runtime. */
export type PropValue = string | number;

const str = z.string();
const level = z.enum(["1", "2", "3"]).transform(Number);

export const LAYERS = ["ground", "main", "overlay"] as const;

const common = {
  attention: level.describe("importance: 1 low, 3 high"),
  density: z.enum(["compact", "comfortable"]),
  mode: z.enum(["editorial", "focus"]),
};

/* ---------- kinds ---------- */

export type KindDef = {
  root?: boolean; // must be top-level (no `in`)
  container?: boolean; // may have children
  props: Record<string, z.ZodType>;
};

// `in` is structural, not a prop: the parser lifts it into the op.
export const KINDS = {
  card: {
    root: true,
    container: true,
    props: { title: str, layer: z.enum(LAYERS) },
  },
  group: {
    container: true,
    props: { ...common, layout: z.enum(["stack", "row", "grid"]) },
  },
  text: { props: { ...common, content: str, level } },
  button: { props: { ...common, label: str, icon: str } },
  input: { props: { ...common, placeholder: str, value: str } },
  image: { props: { ...common, src: str, alt: str } },
} satisfies Record<string, KindDef>;

export type KindName = keyof typeof KINDS;
export const kindDef = (k: KindName): KindDef => KINDS[k];

/* ---------- events and actions ---------- */

const ALL = Object.keys(KINDS) as KindName[];

/** event -> kinds it can fire on */
export const EVENTS = {
  click: ALL,
  submit: ["input"],
} satisfies Record<string, readonly KindName[]>;

export type EventName = keyof typeof EVENTS;

export const ACTIONS = ["prompt"] as const;
export type ActionName = (typeof ACTIONS)[number];

/* ---------- guards ---------- */

// hasOwnProperty, so "constructor" or "toString" are never mistaken for a kind
const has = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

export const isKind = (s: string): s is KindName => has(KINDS, s);
export const isEvent = (s: string): s is EventName => has(EVENTS, s);
export const isAction = (s: string): s is ActionName =>
  (ACTIONS as readonly string[]).includes(s);
export const canFire = (e: EventName, k: KindName) =>
  (EVENTS[e] as readonly KindName[]).includes(k);

/* ---------- prop checking ---------- */

export type CheckedProps = Record<string, PropValue | null>; // null = remove

/**
 * Checks each prop on its own, so one bad value never kills the line.
 * Unknown or invalid props are dropped and reported in `issues`.
 */
export function checkProps(
  kind: KindName,
  raw: Record<string, string | null>,
): { props: CheckedProps; issues: string[] } {
  const shape = kindDef(kind).props;
  const props: CheckedProps = {};
  const issues: string[] = [];

  for (const [k, v] of Object.entries(raw)) {
    if (!has(shape, k)) {
      issues.push(`unknown prop "${k}" on ${kind}`);
      continue;
    }
    if (v === null) {
      props[k] = null;
      continue;
    }
    const r = shape[k].safeParse(v);
    if (r.success) props[k] = r.data as PropValue;
    else issues.push(`bad value for "${k}": ${r.error.issues[0].message}`);
  }
  return { props, issues };
}
