import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Op } from "../protocol/ops";
import { Log } from "./log";
import { SCHEMA_VERSION } from "../protocol/schema";

let seq = 0;
const dbName = () => `alive-test-${Date.now()}-${seq++}`;

const op = (id: string): Op => ({
  t: "create",
  kind: "card",
  id,
  props: { title: id },
});

describe("log", () => {
  it("appends and reloads entries from IndexedDB", async () => {
    const name = dbName();
    const log = new Log({ dbName: name });
    const first = log.append("a", op("one"));
    log.append("a", op("two"));
    log.append("b", op("three"));

    expect(first.v).toBe(SCHEMA_VERSION);
    expect(first.at).toBeTypeOf("number");

    const loaded = await log.load();
    expect(loaded.map((entry) => entry.op.id)).toEqual(["one", "two", "three"]);

    const reopened = new Log({ dbName: name });
    expect((await reopened.load()).map((entry) => entry.op.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("drops the last turn and persists the removal", async () => {
    const name = dbName();
    const log = new Log({ dbName: name });
    log.append("a", op("one"));
    log.append("a", op("two"));
    log.append("b", op("three"));
    await log.load();

    const remaining = await log.dropLastTurn();
    expect(remaining.map((entry) => entry.op.id)).toEqual(["one", "two"]);

    const reopened = new Log({ dbName: name });
    expect((await reopened.load()).map((entry) => entry.op.id)).toEqual([
      "one",
      "two",
    ]);
  });

  it("loads before dropping when the in-memory log is empty", async () => {
    const name = dbName();
    const writer = new Log({ dbName: name });
    writer.append("a", op("one"));
    await writer.load();

    const empty = new Log({ dbName: name });
    expect(await empty.dropLastTurn()).toEqual([]);

    const reopened = new Log({ dbName: name });
    expect(await reopened.load()).toEqual([]);
  });

  it("clears persisted and in-memory entries", async () => {
    const name = dbName();
    const log = new Log({ dbName: name });
    log.append("a", op("one"));
    await log.clear();
    expect(log.all()).toEqual([]);

    const reopened = new Log({ dbName: name });
    expect(await reopened.load()).toEqual([]);
  });

  it("works without persistence", async () => {
    const log = new Log({ persist: false });
    log.append("a", op("one"));
    expect(await log.load()).toHaveLength(1);
    expect((await log.dropLastTurn()).length).toBe(0);
    expect(log.all()).toEqual([]);
  });
});