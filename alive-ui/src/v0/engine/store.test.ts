import { describe, expect, it } from "vitest";
import type { Node } from "./store";
import { Store } from "./store";

const node = (
  id: string,
  kind: Node["kind"],
  parent: string | null,
  props: Node["props"] = {},
): Node => ({ id, kind, parent, children: [], props, rules: new Map() });

describe("store", () => {
  it("tracks roots, children and indexes", () => {
    const store = new Store();
    store.insert(node("card", "card", null), 0);
    store.insert(node("g", "group", "card"), 0);
    store.insert(node("t", "text", "g"), 0);
    store.insert(node("btn", "button", "g"), 1);

    expect(store.cards()).toEqual(["card"]);
    expect(store.childIds("card")).toEqual(["g"]);
    expect(store.children("g").map((n) => n.id)).toEqual(["t", "btn"]);
    expect(store.indexOf("card")).toBe(0);
    expect(store.indexOf("g")).toBe(0);
    expect(store.indexOf("btn")).toBe(1);
    expect(store.indexOf("missing")).toBe(-1);
    expect(store.cardOf("btn")).toBe("card");
    expect(store.cardOf("card")).toBe("card");
    expect(store.cardOf("missing")).toBeUndefined();
    expect(store.isInside("btn", "g")).toBe(true);
    expect(store.isInside("btn", "card")).toBe(true);
    expect(store.isInside("card", "btn")).toBe(false);
    expect(store.isInside("g", "g")).toBe(false);
    expect(store.nodeCount("card")).toBe(4);
    expect(store.subtreeSize("g")).toBe(3);
    expect(store.nodeCount("g")).toBe(0);
  });

  it("detaches and moves subtrees", () => {
    const store = new Store();
    store.insert(node("card", "card", null), 0);
    store.insert(node("a", "group", "card"), 0);
    store.insert(node("b", "group", "card"), 1);
    store.insert(node("t", "text", "a"), 0);

    store.move("t", "b", 0);

    expect(store.childIds("a")).toEqual([]);
    expect(store.childIds("b")).toEqual(["t"]);
    expect(store.get("t")?.parent).toBe("b");

    const detached = store.detach("t");
    expect(detached?.id).toBe("t");
    expect(store.get("t")).toBeUndefined();
    expect(store.childIds("b")).toEqual([]);
  });

  it("clears all state", () => {
    const store = new Store();
    store.insert(node("card", "card", null), 0);
    store.insert(node("g", "group", "card"), 0);

    store.clear();

    expect(store.all()).toEqual([]);
    expect(store.cards()).toEqual([]);
  });
});