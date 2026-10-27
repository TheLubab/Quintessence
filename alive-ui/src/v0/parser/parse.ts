import {
  ACTIONS,
  EVENTS,
  KINDS,
  isAction,
  isEvent,
  isId,
  isKind,
  kindDef,
} from "../protocol/schema";
import type { Op, RawProps } from "../protocol/ops";
import { lex, type Token } from "./lex";
import type { Statement } from "./splitter";

export type Parsed = { ok: true; op: Op } | { ok: false; reason: string };

const ok = (op: Op): Parsed => ({ ok: true, op });
const fail = (reason: string): Parsed => ({ ok: false, reason });
const has = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);
const word = (t: Token | undefined) => (t?.t === "word" ? t.text : null);
const show = (t: Token) =>
  t.t === "pair" || t.t === "heredoc" ? `${t.key}=…` : JSON.stringify(t.text);

function idError(id: string): string | null {
  if (id === "on") return '"on" is reserved';
  return isId(id)
    ? null
    : `bad id "${id}" (start with a letter, then a-z 0-9 _ . -)`;
}

/** Text shape and closed enums. Props, id existence and tree state are the runtime's job. */
export function parse(stmt: Statement): Parsed {
  const head = stmt.head;
  if (!head) return fail("empty statement");
  const sigil = head[0];
  if (!"+~->".includes(sigil))
    return fail(`unknown operation "${sigil}" (use + ~ - >)`);

  const lexed = lex(head.slice(1));
  if (!lexed.ok) return fail(lexed.reason);

  let toks = lexed.tokens;
  const last = toks[toks.length - 1];
  if (last?.t === "heredoc") {
    if (stmt.body === undefined) return fail("heredoc without a body");
    toks = [
      ...toks.slice(0, -1),
      { t: "pair", key: last.key, value: stmt.body },
    ];
  }

  const rule = word(toks[0]) === "on";
  switch (sigil) {
    case "+":
      return rule ? ruleAdd(toks.slice(1)) : create(toks);
    case "-":
      return rule ? ruleDel(toks.slice(1)) : del(toks);
    case "~":
      return update(toks);
    default:
      return move(toks);
  }
}

function collect(toks: Token[]): { props: RawProps } | { error: string } {
  const props: RawProps = {};
  for (const t of toks) {
    if (t.t !== "pair") {
      return {
        error: `expected key=value, got ${show(t)} (quote values that contain spaces)`,
      };
    }
    if (has(props, t.key)) return { error: `duplicate prop "${t.key}"` };
    props[t.key] = t.value;
  }
  return { props };
}

function create(toks: Token[]): Parsed {
  const kind = word(toks[0]);
  const id = word(toks[1]);
  if (!kind || !id)
    return fail("expected +kind id props (e.g. +button notes.add label=Add)");
  const e = idError(id);
  if (e) return fail(e);
  if (!isKind(kind))
    return fail(
      `unknown kind "${kind}" (only: ${Object.keys(KINDS).join(", ")})`,
    );
  const c = collect(toks.slice(2));
  if ("error" in c) return fail(c.error);

  const props = c.props;
  let parent: string | undefined;
  if (has(props, "in")) {
    const v = props.in;
    if (v === null) return fail('"in" needs a value');
    const pe = idError(v);
    if (pe) return fail(`in=${v}: ${pe}`);
    parent = v;
    delete props.in; // structural: lifted out of props
  }
  if (parent && kindDef(kind).root)
    return fail(`${kind} is a root kind and cannot have in=`);
  return ok({
    t: "create",
    kind,
    id,
    ...(parent ? { in: parent } : {}),
    props,
  });
}

function update(toks: Token[]): Parsed {
  const id = word(toks[0]);
  if (!id) return fail("expected ~id key=value ...");
  const e = idError(id);
  if (e) return fail(e);
  const c = collect(toks.slice(1));
  if ("error" in c) return fail(c.error);
  if (!Object.keys(c.props).length) return fail("nothing to update");
  return ok({ t: "update", id, props: c.props }); // `in` stays a prop here: runtime reports it
}

function del(toks: Token[]): Parsed {
  const id = word(toks[0]);
  if (!id || toks.length !== 1) return fail("expected -id (one id, no kind)");
  const e = idError(id);
  return e ? fail(e) : ok({ t: "delete", id });
}

const MOVE_KEYS = ["in", "before", "after"] as const;

function move(toks: Token[]): Parsed {
  const id = word(toks[0]);
  if (!id) return fail("expected >id in=ID [before=ID | after=ID]");
  const e = idError(id);
  if (e) return fail(e);
  const c = collect(toks.slice(1));
  if ("error" in c) return fail(c.error);

  for (const k of Object.keys(c.props)) {
    if (!(MOVE_KEYS as readonly string[]).includes(k))
      return fail(`move does not take "${k}"`);
  }
  const v: Partial<Record<(typeof MOVE_KEYS)[number], string>> = {};
  for (const k of MOVE_KEYS) {
    if (!has(c.props, k)) continue;
    const x = c.props[k];
    if (x === null) return fail(`"${k}" needs a value`);
    const pe = idError(x);
    if (pe) return fail(`${k}=${x}: ${pe}`);
    v[k] = x;
  }
  if (!v.in) return fail("move needs in=ID");
  if (v.before && v.after) return fail("use before= or after=, not both");
  const at = v.before
    ? { rel: "before" as const, ref: v.before }
    : v.after
      ? { rel: "after" as const, ref: v.after }
      : undefined;
  return ok({ t: "move", id, in: v.in, ...(at ? { at } : {}) });
}

function ruleAdd(t: Token[]): Parsed {
  const id = word(t[0]),
    event = word(t[1]),
    arrow = word(t[2]),
    action = word(t[3]);
  const intent = t[4];
  if (!id || !event || arrow !== "->" || !action || intent?.t !== "str") {
    return fail('expected +on ID EVENT -> prompt "intent"');
  }
  if (t.length > 5) return fail("v0 rules take exactly one action");
  const e = idError(id);
  if (e) return fail(e);
  if (!isEvent(event))
    return fail(
      `unknown event "${event}" (only: ${Object.keys(EVENTS).join(", ")})`,
    );
  if (!isAction(action)) {
    return fail(`unknown action "${action}" (only: ${ACTIONS.join(", ")})`);
  }
  return ok({
    t: "rule_add",
    id,
    event,
    action: { type: action, intent: intent.text },
  });
}

function ruleDel(t: Token[]): Parsed {
  const id = word(t[0]),
    event = word(t[1]);
  if (!id || !event || t.length !== 2) return fail("expected -on ID EVENT");
  const e = idError(id);
  if (e) return fail(e);
  if (!isEvent(event))
    return fail(
      `unknown event "${event}" (only: ${Object.keys(EVENTS).join(", ")})`,
    );
  return ok({ t: "rule_del", id, event });
}
