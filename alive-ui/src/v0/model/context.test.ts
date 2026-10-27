import { describe, expect, it } from "vitest";
import { Log } from "../engine/log";
import type { Op } from "../protocol/ops";
import { Runtime } from "../engine/runtime";
import { Store } from "../engine/store";
import { buildContext } from "./context";

const make = () => {
  const store = new Store();
  const runtime = new Runtime(new Log({ persist: false }), store);
  return { runtime, store };
};

const submit = (runtime: Runtime, op: Op) => {
  const result = runtime.submit(op);
  if (!result.ok) throw new Error(result.reason);
};

const seed = (runtime: Runtime) => {
  submit(runtime, {
    t: "create",
    kind: "card",
    id: "home",
    props: { title: "Home" },
  });
  submit(runtime, {
    t: "create",
    kind: "group",
    id: "home.body",
    in: "home",
    props: { layout: "stack" },
  });
  submit(runtime, {
    t: "create",
    kind: "input",
    id: "home.q",
    in: "home.body",
    props: { placeholder: "Ask", value: "init" },
  });
  submit(runtime, {
    t: "create",
    kind: "button",
    id: "home.go",
    in: "home.body",
    props: { label: "Go" },
  });
  submit(runtime, {
    t: "rule_add",
    id: "home.go",
    event: "click",
    action: { type: "prompt", intent: "Go there" },
  });
  submit(runtime, {
    t: "create",
    kind: "card",
    id: "other",
    props: { title: "Other" },
  });
  runtime.setInput("home.q", "typed");
};

describe("context", () => {
  it("builds STATE, ERRORS, EVENT, ASK and INPUTS", () => {
    const { runtime } = make();
    seed(runtime);

    const context = buildContext(
      runtime,
      { type: "click", id: "home.go" },
      [{ line: "~missing title=x", reason: 'unknown id "missing"' }],
    );

    expect(context).toContain("STATE\nFOCUS home\n");
    expect(context).toContain("+card home title=Home");
    expect(context).toContain("+input home.q in=home.body placeholder=Ask");
    expect(context).not.toContain("value=init");
    expect(context).not.toContain("value=typed");
    expect(context).toContain('OTHER\nother | "Other" | 1 nodes');
    expect(context).toContain(
      'ERRORS\nERROR ~missing title=x :: unknown id "missing"',
    );
    expect(context).toContain("EVENT\nclick home.go");
    expect(context).toContain("ASK\nGo there");
    expect(context).toContain('INPUTS\nhome.q = "typed"');
  });

  it("uses the empty and start context", () => {
    const { runtime } = make();
    expect(buildContext(runtime, { type: "start" })).toBe(
      [
        "STATE",
        "(empty)",
        "",
        "ERRORS",
        "(none)",
        "",
        "EVENT",
        "start",
        "",
        "ASK",
        "Begin a new interface.",
        "",
        "INPUTS",
        "(none)",
      ].join("\n"),
    );
  });

  it("uses submit rules and current input values", () => {
    const { runtime } = make();
    seed(runtime);
    submit(runtime, {
      t: "rule_add",
      id: "home.q",
      event: "submit",
      action: { type: "prompt", intent: "Search" },
    });

    const context = buildContext(runtime, { type: "submit", id: "home.q" });
    expect(context).toContain("EVENT\nsubmit home.q");
    expect(context).toContain("ASK\nSearch");
    expect(context).toContain('INPUTS\nhome.q = "typed"');
  });

  it("shows all cards when start has no focus", () => {
    const { runtime } = make();
    seed(runtime);
    const context = buildContext(runtime, { type: "start" });
    expect(context).toContain('OTHER\nhome | "Home"');
    expect(context).toContain('other | "Other" | 1 nodes');
    expect(context).toContain("INPUTS\n(none)");
  });

  it("uses a shell ask with an optional focused card", () => {
    const { runtime } = make();
    seed(runtime);

    const focused = buildContext(runtime, {
      type: "ask",
      prompt: "Summarize this",
      focus: "other",
    });
    expect(focused).toContain("STATE\nFOCUS other\n");
    expect(focused).toContain("+card other title=Other");
    expect(focused).toContain("EVENT\nask");
    expect(focused).toContain("ASK\nSummarize this");
    expect(focused).toContain('OTHER\nhome | "Home"');

    const global = buildContext(runtime, {
      type: "ask",
      prompt: "Add a new card",
    });
    expect(global).toContain('OTHER\nhome | "Home"');
    expect(global).toContain('other | "Other" | 1 nodes');
    expect(global).toContain("INPUTS\n(none)");
  });
});