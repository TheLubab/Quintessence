import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { Log } from "./log";
import type { Op, Patch } from "../protocol/ops";
import { parse } from "../parser/parse";
import { Splitter } from "../parser/splitter";
import { Runtime } from "./runtime";
import { Store } from "./store";
import { checkStore, dump, Mirror, rawOp } from "./test-arb";

const make = () => {
  const store = new Store();
  const log = new Log({ persist: false });
  const runtime = new Runtime(log, store);
  return { runtime, store, log };
};

const card: Op = {
  t: "create",
  kind: "card",
  id: "card",
  props: { title: "Home" },
};

const group: Op = {
  t: "create",
  kind: "group",
  id: "g",
  in: "card",
  props: { layout: "stack" },
};

const submit = (runtime: Runtime, op: Op) => {
  const result = runtime.submit(op);
  if (!result.ok) throw new Error(`${result.reason} :: ${JSON.stringify(op)}`);
  return result;
};

describe("runtime submission", () => {
  it("applies sequential ops against the latest store", () => {
    const { runtime, store } = make();
    runtime.beginTurn("t");
    submit(runtime, card);
    submit(runtime, group);
    submit(runtime, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "Hello" },
    });

    expect(store.get("t")?.parent).toBe("g");
    expect(runtime.cardOf("t")).toBe("card");
    expect(runtime.cardOps("card")).toHaveLength(3);
    checkStore(store);
  });

  it("consumes parsed statements and heredoc previews", () => {
    const { runtime, store } = make();
    runtime.beginTurn("t");
    let previewed = false;

    const splitter = new Splitter((event) => {
      if (event.type === "preview") {
        const parsed = parse(event.stmt);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
          expect(runtime.preview(parsed.op).ok).toBe(true);
          previewed = true;
        }
        return;
      }
      if (event.type === "discard") return;
      const parsed = parse(event.stmt);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) submit(runtime, parsed.op);
    });

    splitter.push(
      [
        "+card home title=Home",
        "+group home.body in=home layout=stack",
        "+text home.text in=home.body content=<<END",
        "hello",
        "",
      ].join("\n"),
    );
    expect(previewed).toBe(true);
    expect(store.has("home.text")).toBe(false);

    splitter.push(["world", "END", "+button home.go in=home.body label=Go"].join("\n"));
    splitter.end();

    expect(store.get("home.text")?.props.content).toBe("hello\nworld");
    expect(store.childIds("home.body")).toEqual(["home.text", "home.go"]);
    checkStore(store);
  });

  it("leaves no trace on rejection", () => {
    fc.assert(
      fc.property(fc.array(rawOp, { maxLength: 40 }), (ops) => {
        const { runtime, store } = make();
        runtime.beginTurn("seed");
        submit(runtime, card);

        for (const op of ops) {
          runtime.beginTurn();
          const before = dump(store);
          const result = runtime.submit(op);
          if (!result.ok) expect(dump(store)).toEqual(before);
          checkStore(store);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("never throws on raw ops", () => {
    fc.assert(
      fc.property(fc.array(rawOp, { maxLength: 20 }), (ops) => {
        const { runtime, store } = make();
        for (const op of ops) {
          expect(() => runtime.submit(op)).not.toThrow();
          expect(() => runtime.preview(op)).not.toThrow();
          checkStore(store);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("runtime patches", () => {
  it("mirrors every accepted patch into the store", () => {
    fc.assert(
      fc.property(fc.array(rawOp, { maxLength: 40 }), (ops) => {
        const { runtime, store } = make();
        const mirror = new Mirror();
        runtime.subscribe((patch) => mirror.apply(patch));

        runtime.beginTurn("seed");
        submit(runtime, card);
        expect(mirror.toJSON()).toEqual(dump(store));

        ops.forEach((op, i) => {
          runtime.beginTurn(`t${i}`);
          runtime.submit(op);
          expect(mirror.toJSON()).toEqual(dump(store));
        });
      }),
      { numRuns: 100 },
    );
  });

  it("replays the accepted log into an identical store", () => {
    fc.assert(
      fc.property(fc.array(rawOp, { maxLength: 40 }), (ops) => {
        const a = make();
        a.runtime.beginTurn("seed");
        submit(a.runtime, card);
        ops.forEach((op, i) => {
          a.runtime.beginTurn(`t${i}`);
          a.runtime.submit(op);
        });

        const b = make();
        const rejected = b.runtime.restore(a.log.all());
        expect(rejected).toEqual([]);
        expect(dump(b.store)).toEqual(dump(a.store));
      }),
      { numRuns: 100 },
    );
  });
});

describe("runtime preview", () => {
  it("does not apply or log a draft", () => {
    const { runtime, store, log } = make();
    runtime.beginTurn("t");
    submit(runtime, card);
    submit(runtime, group);

    const patches: Patch[] = [];
    runtime.subscribe((patch) => patches.push(patch));

    const result = runtime.preview({
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "hello" },
    });
    expect(result.ok).toBe(true);
    expect(store.has("t")).toBe(false);
    expect(log.all()).toHaveLength(2);
    expect(patches).toEqual([
      {
        t: "create",
        id: "t",
        kind: "text",
        parent: "g",
        index: 0,
        props: { content: "hello" },
        draft: true,
      },
    ]);

    submit(runtime, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "hello" },
    });
    expect(store.has("t")).toBe(true);
    expect(patches.map((patch) => patch.t)).toEqual([
      "create",
      "draft_remove",
      "create",
    ]);
    expect(log.all()).toHaveLength(3);
  });

  it("previews updates and clears on discard or rejection", () => {
    const { runtime, store } = make();
    runtime.beginTurn("t");
    submit(runtime, card);
    submit(runtime, group);
    submit(runtime, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "old" },
    });

    const patches: Patch[] = [];
    runtime.subscribe((patch) => patches.push(patch));

    runtime.preview({ t: "update", id: "t", props: { content: "new" } });
    expect(store.get("t")?.props.content).toBe("old");
    expect(patches[0]).toMatchObject({
      t: "update",
      id: "t",
      props: { content: "new" },
      draft: true,
    });

    runtime.clearPreview("t");
    expect(patches[1]).toEqual({ t: "draft_remove", id: "t" });
    expect(store.get("t")?.props.content).toBe("old");

    runtime.preview({
      t: "create",
      kind: "text",
      id: "draft",
      in: "g",
      props: { content: "draft" },
    });
    const rejected = runtime.submit({
      t: "create",
      kind: "text",
      id: "draft",
      in: "missing",
      props: { content: "nope" },
    });
    expect(rejected.ok).toBe(false);
    expect(store.has("draft")).toBe(false);
    expect(patches.at(-1)).toEqual({ t: "draft_remove", id: "draft" });
  });
});

describe("runtime inputs and rules", () => {
  it("tracks model and typed values, then cleans them up", () => {
    const { runtime } = make();
    runtime.beginTurn("t");
    submit(runtime, card);
    submit(runtime, group);
    submit(runtime, {
      t: "create",
      kind: "input",
      id: "q",
      in: "g",
      props: { placeholder: "Ask", value: "init" },
    });
    submit(runtime, {
      t: "create",
      kind: "button",
      id: "go",
      in: "g",
      props: { label: "Go" },
    });
    submit(runtime, {
      t: "rule_add",
      id: "go",
      event: "click",
      action: { type: "prompt", intent: "Explore" },
    });

    expect(runtime.inputs("card")).toEqual({ q: "init" });
    runtime.setInput("q", "typed");
    expect(runtime.inputs("card")).toEqual({ q: "typed" });
    expect(runtime.fire("go", "click")).toEqual({
      intent: "Explore",
      card: "card",
      inputs: { q: "typed" },
    });
    expect(runtime.fire("go", "submit")).toBeUndefined();

    submit(runtime, { t: "update", id: "q", props: { value: "model" } });
    expect(runtime.inputs("card")).toEqual({ q: "model" });

    submit(runtime, { t: "delete", id: "q" });
    expect(runtime.inputs("card")).toEqual({});
  });

  it("builds card and outline context", () => {
    const { runtime } = make();
    runtime.beginTurn("t");
    submit(runtime, card);
    submit(runtime, group);
    submit(runtime, {
      t: "create",
      kind: "text",
      id: "t",
      in: "g",
      props: { content: "Hi", level: "2" },
    });
    submit(runtime, {
      t: "create",
      kind: "button",
      id: "btn",
      in: "g",
      props: { label: "Go" },
    });
    submit(runtime, {
      t: "rule_add",
      id: "btn",
      event: "click",
      action: { type: "prompt", intent: "Go" },
    });
    submit(runtime, {
      t: "create",
      kind: "card",
      id: "other",
      props: { title: "Other" },
    });

    expect(runtime.cardOps("card")).toHaveLength(5);
    expect(runtime.cardOps("missing")).toEqual([]);
    expect(runtime.outline("card")).toEqual([
      { id: "other", title: "Other", nodeCount: 1 },
    ]);
    expect(runtime.outline()).toHaveLength(2);
  });
});

describe("runtime lifecycle", () => {
  it("undoes a whole turn by replay", async () => {
    const { runtime, store, log } = make();
    runtime.beginTurn("a");
    submit(runtime, card);
    runtime.beginTurn("b");
    submit(runtime, group);

    expect(await runtime.undo()).toBe(true);
    expect(store.has("card")).toBe(true);
    expect(store.has("g")).toBe(false);
    expect(log.all().map((entry) => entry.turn)).toEqual(["a"]);

    expect(await runtime.undo()).toBe(true);
    expect(store.cards()).toEqual([]);
    expect(await runtime.undo()).toBe(false);
  });

  it("resets state and log", async () => {
    const { runtime, store, log } = make();
    runtime.beginTurn("a");
    submit(runtime, card);
    submit(runtime, group);

    await runtime.reset();

    expect(store.all()).toEqual([]);
    expect(log.all()).toEqual([]);
  });
});