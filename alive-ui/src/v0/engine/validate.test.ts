import { describe, expect, it } from "vitest";
import { apply } from "./apply";
import type { CheckedOp, Op } from "../protocol/ops";
import { Store } from "./store";
import { dump } from "./test-arb";
import type { ValidateCtx } from "./validate";
import { LIMITS, toRawOp, validate } from "./validate";

const accept = (
  store: Store,
  op: Op,
  ctx?: ValidateCtx,
): CheckedOp => {
  const result = validate(store, op, ctx);
  if (!result.ok) throw new Error(`${result.reason} :: ${JSON.stringify(op)}`);
  apply(store, result.op);
  return result.op;
};

const reject = (store: Store, op: Op, ctx?: ValidateCtx): string => {
  const result = validate(store, op, ctx);
  if (result.ok) throw new Error(`expected rejection :: ${JSON.stringify(op)}`);
  return result.reason;
};

const seed = (store: Store) => {
  accept(store, {
    t: "create",
    kind: "card",
    id: "card",
    props: { title: "Home" },
  });
  accept(store, {
    t: "create",
    kind: "group",
    id: "g",
    in: "card",
    props: { layout: "stack" },
  });
};

describe("validate create", () => {
  it("creates roots and children", () => {
    const store = new Store();
    const card = accept(store, {
      t: "create",
      kind: "card",
      id: "card",
      props: { title: "Home", layer: "main" },
    });
    const text = accept(store, {
      t: "create",
      kind: "text",
      id: "card.title",
      in: "card",
      props: { content: "Hello", level: "2" },
    });

    expect(card.t).toBe("create");
    expect(text.t).toBe("create");
    expect(store.get("card.title")?.parent).toBe("card");
    expect(store.get("card.title")?.props).toEqual({
      content: "Hello",
      level: 2,
    });
  });

  it("replaces props on an existing id and keeps its children", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "old", level: "2" },
    });

    const replaced = accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "new" },
    });
    expect(replaced).toMatchObject({ t: "create", replace: true });
    expect(store.get("t")?.props).toEqual({ content: "new" });
    expect(store.get("g")?.children).toEqual(["t"]);

    expect(
      reject(store, {
        t: "create",
        kind: "group",
        id: "t",
        in: "g",
        props: {},
      }),
    ).toMatch(/already exists as text/);

    accept(store, {
      t: "create",
      kind: "group",
      id: "g2",
      in: "card",
      props: { layout: "stack" },
    });
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "t",
        in: "g2",
        props: { content: "moved" },
      }),
    ).toMatch(/already exists under/);
  });

  it("rejects bad shape", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });

    expect(
      reject(store, {
        t: "create",
        kind: "widget" as never,
        id: "x",
        props: {},
      }),
    ).toMatch(/unknown kind/);
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "card",
        in: "g",
        props: {},
      }),
    ).toMatch(/already exists/);
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "on",
        in: "g",
        props: {},
      }),
    ).toMatch(/reserved/);
    expect(
      reject(store, {
        t: "create",
        kind: "card",
        id: "other",
        in: "g",
        props: {},
      }),
    ).toMatch(/root kind/);
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "orphan",
        props: {},
      }),
    ).toMatch(/needs in/);
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "orphan",
        in: "missing",
        props: {},
      }),
    ).toMatch(/does not exist/);
    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "under.btn",
        in: "btn",
        props: {},
      }),
    ).toMatch(/not a container/);
  });

  it("drops bad props and reports issues without rejecting", () => {
    const store = new Store();
    seed(store);

    const result = validate(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x", level: "9", nope: "1" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.op.t).toBe("create");
    if (result.op.t !== "create") return;
    expect(result.op.props).toEqual({ content: "x" });
    expect(result.op.issues).toHaveLength(2);

    const nulled = validate(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: null },
    });
    expect(nulled.ok).toBe(true);
    if (nulled.ok && nulled.op.t === "create") {
      expect(nulled.op.props).toEqual({});
    }
  });

  it("enforces limits", () => {
    const store = new Store();
    seed(store);

    expect(
      reject(store, {
        t: "create",
        kind: "text",
        id: "long",
        in: "g",
        props: { content: "x".repeat(LIMITS.propLength + 1) },
      }),
    ).toMatch(/exceeds/);

    accept(
      store,
      {
        t: "create",
        kind: "text",
        id: "t",
        in: "g",
        props: { content: "ok" },
      },
      { limits: { nodesPerCard: 3 } },
    );
    expect(
      reject(
        store,
        {
          t: "create",
          kind: "text",
          id: "t2",
          in: "g",
          props: { content: "no" },
        },
        { limits: { nodesPerCard: 3 } },
      ),
    ).toMatch(/node limit/);
  });
});

describe("validate update", () => {
  it("merges, removes and detects no-ops", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "a", level: "2" },
    });

    const changed = accept(store, {
      t: "update",
      id: "t",
      props: { content: "b", level: "2" },
    });
    expect(changed.t).toBe("update");
    if (changed.t === "update") {
      expect(changed.props).toEqual({ content: "b", level: 2 });
      expect(changed.noop).toBe(false);
    }
    expect(store.get("t")?.props).toEqual({ content: "b", level: 2 });

    const noop = accept(store, {
      t: "update",
      id: "t",
      props: { content: "b" },
    });
    expect(noop.t).toBe("update");
    if (noop.t === "update") expect(noop.noop).toBe(true);

    accept(store, { t: "update", id: "t", props: { content: null } });
    expect(store.get("t")?.props).toEqual({ level: 2 });

    const partial = validate(store, {
      t: "update",
      id: "t",
      props: { nope: "1", level: "3" },
    });
    expect(partial.ok).toBe(true);
    if (partial.ok && partial.op.t === "update") {
      expect(partial.op.issues).toHaveLength(1);
      expect(partial.op.props).toEqual({ level: 3 });
    }
  });

  it("rejects unknown ids and updates with nothing left", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "a" },
    });

    expect(
      reject(store, { t: "update", id: "missing", props: { content: "x" } }),
    ).toMatch(/unknown id/);
    expect(reject(store, { t: "update", id: "t", props: { nope: "1" } })).toMatch(
      /nothing to update/,
    );
    expect(reject(store, { t: "update", id: "t", props: { in: "g" } })).toMatch(
      /nothing to update/,
    );
    expect(
      reject(store, {
        t: "update",
        id: "t",
        props: { content: "x".repeat(LIMITS.propLength + 1) },
      }),
    ).toMatch(/exceeds/);
  });
});

describe("validate delete and move", () => {
  it("deletes only existing ids", () => {
    const store = new Store();
    seed(store);
    accept(store, { t: "delete", id: "g" });
    expect(store.has("g")).toBe(false);
    expect(reject(store, { t: "delete", id: "g" })).toMatch(/unknown id/);
  });

  it("checks move targets, references and cycles", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "group",
      id: "h",
      in: "card",
      props: { layout: "row" },
    });
    accept(store, {
      t: "create",
      kind: "group",
      id: "h2",
      in: "h",
      props: { layout: "stack" },
    });
    accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x" },
    });
    accept(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });

    expect(
      reject(store, { t: "move", id: "card", in: "g" }),
    ).toMatch(/cards cannot be moved/);
    expect(
      reject(store, { t: "move", id: "g", in: "g" }),
    ).toMatch(/into itself/);
    expect(
      reject(store, { t: "move", id: "h", in: "h2" }),
    ).toMatch(/subtree/);
    expect(
      reject(store, { t: "move", id: "t", in: "btn" }),
    ).toMatch(/not a container/);
    expect(
      reject(store, { t: "move", id: "t", in: "h", at: { rel: "before", ref: "missing" } }),
    ).toMatch(/reference/);
    expect(
      reject(store, { t: "move", id: "t", in: "h", at: { rel: "after", ref: "card" } }),
    ).toMatch(/not inside/);
    expect(
      reject(store, { t: "move", id: "t", in: "h", at: { rel: "before", ref: "t" } }),
    ).toMatch(/relative to itself/);

    accept(store, { t: "move", id: "t", in: "h" });
    expect(store.get("t")?.parent).toBe("h");
    expect(store.get("h")?.children).toEqual(["h2", "t"]);

    accept(store, { t: "move", id: "t", in: "h", at: { rel: "before", ref: "h2" } });
    expect(store.get("h")?.children).toEqual(["t", "h2"]);
  });

  it("enforces the destination card limit", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x" },
    });
    accept(store, {
      t: "create",
      kind: "card",
      id: "card2",
      props: { title: "Other" },
    });
    accept(store, {
      t: "create",
      kind: "group",
      id: "g2",
      in: "card2",
      props: { layout: "stack" },
    });

    expect(
      reject(
        store,
        { t: "move", id: "g", in: "card2" },
        { limits: { nodesPerCard: 3 } },
      ),
    ).toMatch(/node limit/);
  });
});

describe("validate rules", () => {
  it("adds and removes rules with event checks", () => {
    const store = new Store();
    seed(store);
    accept(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });
    accept(store, {
      t: "create",
      kind: "input",
      id: "inp",
      in: "g",
      props: { placeholder: "Type" },
    });

    const rule = accept(store, {
      t: "rule_add",
      id: "btn",
      event: "click",
      action: { type: "prompt", intent: "Go there" },
    });
    expect(rule.t).toBe("rule_add");
    expect(store.get("btn")?.rules.get("click")?.intent).toBe("Go there");

    const replaced = accept(store, {
      t: "rule_add",
      id: "btn",
      event: "click",
      action: { type: "prompt", intent: "Again" },
    });
    expect(replaced.t).toBe("rule_add");
    expect(store.get("btn")?.rules.get("click")?.intent).toBe("Again");
    expect(
      reject(store, {
        t: "rule_add",
        id: "btn",
        event: "submit",
        action: { type: "prompt", intent: "Nope" },
      }),
    ).toMatch(/cannot fire/);
    expect(reject(store, { t: "rule_del", id: "inp", event: "click" })).toMatch(
      /does not exist/,
    );

    accept(store, { t: "rule_del", id: "btn", event: "click" });
    expect(store.get("btn")?.rules.has("click")).toBe(false);
  });
});

describe("validate limits and purity", () => {
  it("rejects past the turn op limit", () => {
    const store = new Store();
    seed(store);
    expect(
      reject(
        store,
        { t: "create", kind: "text", id: "t", in: "g", props: {} },
        { opsThisTurn: LIMITS.opsPerTurn },
      ),
    ).toMatch(/turn op limit/);
    expect(
      reject(
        store,
        { t: "create", kind: "text", id: "t", in: "g", props: {} },
        { opsThisTurn: 2, limits: { opsPerTurn: 2 } },
      ),
    ).toMatch(/turn op limit/);
  });

  it("never mutates the store", () => {
    const store = new Store();
    seed(store);
    const before = dump(store);

    validate(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x" },
    });
    validate(store, { t: "move", id: "g", in: "missing" });
    validate(store, { t: "delete", id: "card" });

    expect(dump(store)).toEqual(before);
  });

  it("survives malformed input", () => {
    const store = new Store();
    const bad = validate(store, null as unknown as Op);
    expect(bad.ok).toBe(false);
    const weird = validate(store, { t: "nope" } as unknown as Op);
    expect(weird.ok).toBe(false);
  });

  it("round-trips checked props through raw text", () => {
    const store = new Store();
    seed(store);
    const checked = validate(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "hi", level: "2" },
    });
    if (!checked.ok || checked.op.t !== "create") throw new Error("bad");

    const raw = toRawOp(checked.op);
    expect(raw).toMatchObject({
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "hi", level: "2" },
    });

    const again = validate(store, raw);
    if (!again.ok || again.op.t !== "create") throw new Error("bad");
    expect(again.op.props).toEqual({ content: "hi", level: 2 });
  });
});