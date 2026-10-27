import { describe, expect, it } from "vitest";
import { Log } from "../engine/log";
import type { Patch } from "../protocol/ops";
import { Runtime } from "../engine/runtime";
import { Store } from "../engine/store";
import type { Msg } from "../../llm/client";
import { Session } from "./session";

const make = () => {
  const store = new Store();
  const runtime = new Runtime(new Log({ persist: false }), store);
  return { runtime, store };
};

const abortError = (): Error => {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
};

const submit = (runtime: Runtime, op: Parameters<Runtime["submit"]>[0]) => {
  const result = runtime.submit(op);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe("session", () => {
  it("streams statements and heredoc previews", async () => {
    const { runtime, store } = make();
    const calls: Msg[][] = [];
    const chunks = [
      "+card home title=Home\n+text home.body in=home content=<<END\nhello\n",
      "world\nEND\n",
    ];

    const stream = async function* (messages: Msg[], signal?: AbortSignal) {
      calls.push(messages);
      for (const chunk of chunks) {
        if (signal?.aborted) throw abortError();
        yield chunk;
        await Promise.resolve();
      }
    };

    const patches: Patch[] = [];
    runtime.subscribe((patch) => patches.push(patch));

    const session = new Session(runtime, stream);
    await session.send({ type: "start" });

    expect(calls).toHaveLength(1);
    expect(calls[0][1].content).toContain("EVENT\nstart");
    expect(store.get("home.body")?.props.content).toBe("hello\nworld");
    expect(patches.some((patch) => patch.t === "create" && patch.draft)).toBe(
      true,
    );
  });

  it("sends shell asks", async () => {
    const { runtime, store } = make();
    const calls: Msg[][] = [];

    const stream = async function* (messages: Msg[], _signal?: AbortSignal) {
      calls.push(messages);
      yield "+card note title=Note\n";
    };

    const session = new Session(runtime, stream);
    await session.send({ type: "ask", prompt: "Make a note" });

    expect(calls).toHaveLength(1);
    expect(calls[0][1].content).toContain("EVENT\nask");
    expect(calls[0][1].content).toContain("ASK\nMake a note");
    expect(store.has("note")).toBe(true);
  });

  it("stops the running generation", async () => {
    const { runtime } = make();
    let aborted = false;

    const stream = async function* (_messages: Msg[], signal?: AbortSignal) {
      yield "+card home title=Home\n";
      await new Promise<void>((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      aborted = true;
      throw abortError();
    };

    const created = new Promise<void>((resolve) => {
      runtime.subscribe((patch) => {
        if (patch.t === "create" && patch.id === "home") resolve();
      });
    });

    const session = new Session(runtime, stream);
    const run = session.send({ type: "start" });
    await created;
    session.stop();
    await run;

    expect(aborted).toBe(true);
  });

  it("collects rejections for the next turn", async () => {
    const { runtime } = make();
    const calls: Msg[][] = [];
    const scripts = [["~missing title=x\n"], [""], [""]];
    let index = 0;

    const stream = async function* (messages: Msg[], _signal?: AbortSignal) {
      calls.push(messages);
      for (const chunk of scripts[index++] ?? []) {
        yield chunk;
        await Promise.resolve();
      }
    };

    const session = new Session(runtime, stream);
    await session.send({ type: "start" });
    await session.send({ type: "start" });
    await session.send({ type: "start" });

    expect(calls[1][1].content).toContain(
      'ERROR ~missing title=x :: unknown id "missing"',
    );
    expect(calls[2][1].content).toContain("ERRORS\n(none)");
  });

  it("collects unterminated heredocs", async () => {
    const { runtime, store } = make();
    const calls: Msg[][] = [];
    const scripts = [
      ["+card home title=Home\n+text home.body in=home content=<<END\nhello"],
      [""],
    ];
    let index = 0;

    const stream = async function* (messages: Msg[], _signal?: AbortSignal) {
      calls.push(messages);
      for (const chunk of scripts[index++] ?? []) {
        yield chunk;
        await Promise.resolve();
      }
    };

    const session = new Session(runtime, stream);
    await session.send({ type: "start" });
    expect(store.has("home.body")).toBe(false);

    await session.send({ type: "start" });
    expect(calls[1][1].content).toContain("unterminated heredoc <<END");
    expect(calls[1][1].content).toContain("content=<<END");
  });

  it("aborts the running turn and discards its draft", async () => {
    const { runtime, store } = make();
    const calls: Msg[][] = [];
    let aborted = false;

    const stream = async function* (messages: Msg[], signal?: AbortSignal) {
      calls.push(messages);
      if (calls.length === 1) {
        yield "+card home title=Home\n+text home.draft in=home content=<<END\nhello\n";
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        aborted = true;
        throw abortError();
      }
      yield "+group home.body in=home layout=stack\n";
    };

    const patches: Patch[] = [];
    runtime.subscribe((patch) => patches.push(patch));

    let off = () => {};
    const drafted = new Promise<void>((resolve) => {
      off = runtime.subscribe((patch) => {
        if (patch.t === "create" && patch.id === "home.draft" && patch.draft) {
          off();
          resolve();
        }
      });
    });

    const session = new Session(runtime, stream);
    const first = session.send({ type: "start" });
    await drafted;
    const second = session.send({ type: "start" });
    await Promise.all([first, second]);

    expect(aborted).toBe(true);
    expect(calls[1][1].content).toContain('home | "Home" | 1 nodes');
    expect(calls[1][1].content).not.toContain("home.draft");
    expect(store.has("home.draft")).toBe(false);
    expect(
      patches.some((patch) => patch.t === "draft_remove" && patch.id === "home.draft"),
    ).toBe(true);
    expect(store.childIds("home")).toEqual(["home.body"]);
  });

  it("ignores events that have no rule", async () => {
    const { runtime } = make();
    submit(runtime, {
      t: "create",
      kind: "card",
      id: "home",
      props: { title: "Home" },
    });
    submit(runtime, {
      t: "create",
      kind: "button",
      id: "home.btn",
      in: "home",
      props: { label: "Nothing" },
    });

    let calls = 0;
    const stream = async function* (_messages: Msg[], _signal?: AbortSignal) {
      calls += 1;
      yield "";
    };

    const session = new Session(runtime, stream);
    await session.send({ type: "click", id: "home.btn" });
    expect(calls).toBe(0);
  });
});