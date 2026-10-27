import { describe, expect, it } from "vitest";
import { apply, patchFor } from "./apply";
import type { CheckedOp, Op } from "../protocol/ops";
import { Store } from "./store";
import { dump } from "./test-arb";
import { validate } from "./validate";

const checked = (store: Store, op: Op): CheckedOp => {
  const result = validate(store, op);
  if (!result.ok) throw new Error(result.reason);
  return result.op;
};

const run = (store: Store, op: Op) => apply(store, checked(store, op));

const seed = (store: Store) => {
  run(store, {
    t: "create",
    kind: "card",
    id: "card",
    props: { title: "Home" },
  });
  run(store, {
    t: "create",
    kind: "group",
    id: "g",
    in: "card",
    props: { layout: "stack" },
  });
};

describe("apply create", () => {
  it("carries the insertion index", () => {
    const store = new Store();
    const card = run(store, {
      t: "create",
      kind: "card",
      id: "card",
      props: { title: "Home" },
    });
    expect(card).toEqual({
      t: "create",
      id: "card",
      kind: "card",
      parent: null,
      index: 0,
      props: { title: "Home" },
    });

    const group = run(store, {
      t: "create",
      kind: "group",
      id: "g",
      in: "card",
      props: { layout: "stack" },
    });
    expect(group).toMatchObject({ parent: "card", index: 0 });

    const text = run(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x" },
    });
    expect(text).toMatchObject({ parent: "g", index: 0 });

    const second = run(store, {
      t: "create",
      kind: "card",
      id: "card2",
      props: { title: "Other" },
    });
    expect(second).toMatchObject({ parent: null, index: 1 });
  });

  it("turns a repeated create into an update and keeps children", () => {
    const store = new Store();
    seed(store);

    const changed = run(store, {
      t: "create",
      kind: "card",
      id: "card",
      props: { title: "Other" },
    });
    expect(changed).toEqual({
      t: "update",
      id: "card",
      props: { title: "Other" },
      removed: [],
    });
    expect(store.get("card")?.children).toEqual(["g"]);

    const cleared = run(store, {
      t: "create",
      kind: "card",
      id: "card",
      props: {},
    });
    expect(cleared).toEqual({
      t: "update",
      id: "card",
      props: {},
      removed: ["title"],
    });
    expect(store.get("card")?.children).toEqual(["g"]);
  });
});

describe("apply update", () => {
  it("diffs changed and removed props", () => {
    const store = new Store();
    seed(store);
    run(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "a", level: "2" },
    });

    const changed = run(store, {
      t: "update",
      id: "t",
      props: { content: "b", level: "2" },
    });
    expect(changed).toEqual({
      t: "update",
      id: "t",
      props: { content: "b" },
      removed: [],
    });
    expect(store.get("t")?.props).toEqual({ content: "b", level: 2 });

    expect(
      patchFor(
        store,
        checked(store, { t: "update", id: "t", props: { content: "b" } }),
      ),
    ).toBeNull();
    expect(
      apply(
        store,
        checked(store, { t: "update", id: "t", props: { content: "b" } }),
      ),
    ).toBeNull();

    const removed = run(store, {
      t: "update",
      id: "t",
      props: { content: null },
    });
    expect(removed).toEqual({
      t: "update",
      id: "t",
      props: {},
      removed: ["content"],
    });
    expect(store.get("t")?.props).toEqual({ level: 2 });
  });
});

describe("apply delete", () => {
  it("removes a subtree in one patch", () => {
    const store = new Store();
    seed(store);
    run(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "x" },
    });
    run(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });

    const patch = run(store, { t: "delete", id: "g" });
    expect(patch).toEqual({
      t: "remove",
      id: "g",
      removed: ["g", "t", "btn"],
    });
    expect(store.all().map((node) => node.id)).toEqual(["card"]);
    expect(store.get("card")?.children).toEqual([]);
  });
});

describe("apply move", () => {
  it("reports the final index", () => {
    const store = new Store();
    seed(store);
    run(store, {
      t: "create",
      kind: "group",
      id: "a",
      in: "card",
      props: { layout: "row" },
    });
    run(store, {
      t: "create",
      kind: "group",
      id: "b",
      in: "card",
      props: { layout: "row" },
    });
    run(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "a",
      props: { content: "t" },
    });
    run(store, {
      t: "create",
      kind: "text",
      id: "u",
      in: "a",
      props: { content: "u" },
    });

    expect(
      run(store, {
        t: "move",
        id: "t",
        in: "a",
        at: { rel: "after", ref: "u" },
      }),
    ).toEqual({ t: "move", id: "t", parent: "a", index: 1 });
    expect(store.get("a")?.children).toEqual(["u", "t"]);

    expect(run(store, { t: "move", id: "u", in: "b" })).toEqual({
      t: "move",
      id: "u",
      parent: "b",
      index: 0,
    });
    expect(store.get("b")?.children).toEqual(["u"]);

    expect(
      run(store, {
        t: "move",
        id: "t",
        in: "b",
        at: { rel: "before", ref: "u" },
      }),
    ).toEqual({ t: "move", id: "t", parent: "b", index: 0 });
    expect(store.get("b")?.children).toEqual(["t", "u"]);
  });
});

describe("apply rules", () => {
  it("adds and removes rules", () => {
    const store = new Store();
    seed(store);
    run(store, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });

    expect(
      run(store, {
        t: "rule_add",
        id: "btn",
        event: "click",
        action: { type: "prompt", intent: "Go" },
      }),
    ).toEqual({
      t: "rule",
      id: "btn",
      event: "click",
      action: { type: "prompt", intent: "Go" },
    });

    expect(
      run(store, { t: "rule_del", id: "btn", event: "click" }),
    ).toEqual({
      t: "rule",
      id: "btn",
      event: "click",
      action: null,
    });
    expect(store.get("btn")?.rules.size).toBe(0);
  });
});

describe("patchFor", () => {
  it("does not mutate the store", () => {
    const store = new Store();
    seed(store);
    run(store, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "a" },
    });
    const before = dump(store);

    patchFor(
      store,
      checked(store, { t: "update", id: "t", props: { content: "b" } }),
    );
    patchFor(store, checked(store, { t: "delete", id: "g" }));
    patchFor(store, checked(store, { t: "move", id: "t", in: "card" }));

    expect(dump(store)).toEqual(before);
  });
});