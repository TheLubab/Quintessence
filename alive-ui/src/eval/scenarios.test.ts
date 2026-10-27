import { describe, expect, it } from "vitest";
import { Log } from "../v0/engine/log";
import { Runtime } from "../v0/engine/runtime";
import { parse } from "../v0/parser/parse";
import { Splitter } from "../v0/parser/splitter";
import { reasonKey } from "./run";
import { scenarios } from "./scenarios";

const seed = (runtime: Runtime, source: string): string[] => {
  const errors: string[] = [];
  const splitter = new Splitter((event) => {
    if (event.type !== "statement") return;
    const parsed = parse(event.stmt);
    if (!parsed.ok) {
      errors.push(`${event.stmt.head} :: ${parsed.reason}`);
      return;
    }
    const result = runtime.submit(parsed.op);
    if (!result.ok) {
      errors.push(`${event.stmt.head} :: ${result.reason}`);
    }
  });
  splitter.push(source);
  splitter.end();
  return errors;
};

describe("eval scenarios", () => {
  it("has 20 uniquely identified scenarios", () => {
    expect(scenarios).toHaveLength(20);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(
      scenarios.length,
    );
  });

  it.each(scenarios)("$id has a valid setup and event", (scenario) => {
    const runtime = new Runtime(new Log({ persist: false }));
    runtime.beginTurn("setup");
    const errors = seed(runtime, scenario.setup ?? "");
    runtime.endTurn();

    expect(errors).toEqual([]);

    for (const [id, value] of Object.entries(scenario.inputs ?? {})) {
      runtime.setInput(id, value);
    }

    if (
      scenario.event.type === "click" ||
      scenario.event.type === "submit"
    ) {
      expect(
        runtime.fire(scenario.event.id, scenario.event.type),
      ).toBeDefined();
    }
  });

  it("groups rejection reasons", () => {
    expect(reasonKey('unknown id "missing"')).toBe("unknown id");
    expect(reasonKey('parent "gone" does not exist')).toBe("missing parent");
    expect(reasonKey('bad value for "level": invalid')).toBe("bad value");
    expect(reasonKey("something unexpected")).toBe("something unexpected");
  });
});