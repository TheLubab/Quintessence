import { describe, expect, it } from "vitest";
import type { Msg } from "../llm/client";
import { Log } from "../v0/engine/log";
import { Runtime } from "../v0/engine/runtime";
import { runOne } from "./run";
import type { EvalStream } from "./run";
import type { Scenario } from "./scenarios";

const scenario: Scenario = {
  id: "unit",
  name: "Unit scenario",
  group: "home",
  event: { type: "start" },
};

const streamOf = (chunks: string[]): EvalStream =>
  async function* (_messages: Msg[], _signal?: AbortSignal, _model?: string) {
    for (const chunk of chunks) {
      yield chunk;
      await Promise.resolve();
    }
  };

describe("eval runner", () => {
  it("counts accepted statements, rejections, and timings", async () => {
    const script = [
      "+card home title=Home\n",
      "+group home.g in=home layout=stack\n",
      "~missing title=nope\n",
      "+button home.b in=home.g label=Hi\n",
    ];
    const result = await runOne(scenario, "fake-model", 2, {
      stream: streamOf(script),
    });

    expect(result.model).toBe("fake-model");
    expect(result.run).toBe(2);
    expect(result.accepted).toBe(3);
    expect(result.rejected).toBe(1);
    expect(result.acceptRate).toBe(0.75);
    expect(result.firstTokenMs).not.toBeNull();
    expect(result.firstLineMs).not.toBeNull();
    expect(result.firstOpMs).not.toBeNull();
    expect(result.firstTokenMs ?? 0).toBeLessThanOrEqual(result.firstLineMs ?? 0);
    expect(result.firstLineMs ?? 0).toBeLessThanOrEqual(result.firstOpMs ?? 0);
    expect(result.totalMs).toBeGreaterThanOrEqual(result.firstOpMs ?? 0);
    expect(result.outputChars).toBe(script.join("").length);
    expect(result.outputSample).toBe(script.join(""));
    expect(result.state).toHaveLength(3);
    expect(
      result.state.flatMap((op) => (op.t === "create" ? [op.id] : [])),
    ).toEqual(["home", "home.g", "home.b"]);

    const replay = new Runtime(new Log({ persist: false }));
    for (const op of result.state) {
      expect(replay.submit(op).ok).toBe(true);
    }
    expect(replay.outline()).toEqual([
      { id: "home", title: "Home", nodeCount: 3 },
    ]);

    expect(result.rejections).toHaveLength(1);
    expect(result.rejections[0].key).toBe("unknown id");
  });

  it("records a rejected line without a newline at end of stream", async () => {
    const result = await runOne(scenario, "fake-model", 1, {
      stream: streamOf(["not alive"]),
    });

    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.acceptRate).toBe(0);
    expect(result.firstTokenMs).not.toBeNull();
    expect(result.firstLineMs).not.toBeNull();
    expect(result.firstOpMs).toBeNull();
    expect(result.outputSample).toBe("not alive");
    expect(result.rejections[0].key).toBe("unknown operation");
  });

  it("records an unterminated heredoc as a rejection", async () => {
    const result = await runOne(scenario, "fake-model", 1, {
      stream: streamOf(["+card home title=Home\n+text home.t in=home content=<<END\npartial"]),
    });

    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.firstTokenMs).not.toBeNull();
    expect(result.firstLineMs).not.toBeNull();
    expect(result.firstOpMs).not.toBeNull();
    expect(result.outputSample).toContain("partial");
    expect(result.rejections[0].key).toBe("unterminated heredoc");
  });
});