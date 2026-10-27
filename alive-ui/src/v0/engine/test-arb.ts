import * as fc from "fast-check";
import type { Action, Op, Patch } from "../protocol/ops";
import { canFire, kindDef } from "../protocol/schema";
import type { EventName } from "../protocol/schema";
import type { Store } from "./store";

const IDS = [
  "card",
  "g",
  "t",
  "btn",
  "inp",
  "a",
  "a.b",
  "card.g",
  "bad id",
  "on",
  "A",
  "",
];

const KINDS = ["card", "group", "text", "button", "input", "image"] as const;

const KEYS = [
  "title",
  "label",
  "content",
  "level",
  "in",
  "value",
  "layout",
  "attention",
  "density",
  "mode",
  "icon",
  "src",
  "alt",
  "x",
];

const VALUES = [
  "1",
  "2",
  "3",
  "ground",
  "main",
  "overlay",
  "stack",
  "row",
  "grid",
  "compact",
  "comfortable",
  "editorial",
  "focus",
];

const id = fc.constantFrom(...IDS);
const kind = fc.constantFrom(...KINDS);
const event = fc.constantFrom("click", "submit");
const props = fc.dictionary(
  fc.constantFrom(...KEYS),
  fc.oneof(fc.string(), fc.constant(null), fc.constantFrom(...VALUES)),
  { maxKeys: 4 },
);

const create: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("create" as const),
  kind,
  id,
  in: fc.option(id, { nil: undefined }),
  props,
});

const update: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("update" as const),
  id,
  props,
});

const remove: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("delete" as const),
  id,
});

const move: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("move" as const),
  id,
  in: id,
  at: fc.option(
    fc.record({
      rel: fc.constantFrom("before" as const, "after" as const),
      ref: id,
    }),
    { nil: undefined },
  ),
});

const ruleAdd: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("rule_add" as const),
  id,
  event,
  action: fc.record({
    type: fc.constant("prompt" as const),
    intent: fc.string(),
  }),
});

const ruleDel: fc.Arbitrary<Op> = fc.record({
  t: fc.constant("rule_del" as const),
  id,
  event,
});

export const rawOp: fc.Arbitrary<Op> = fc.oneof(
  create,
  update,
  remove,
  move,
  ruleAdd,
  ruleDel,
);

export const dump = (store: Store) => ({
  cards: [...store.cards()],
  nodes: store
    .all()
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      parent: node.parent,
      children: [...node.children],
      props: { ...node.props },
      rules: [...node.rules.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
});

export function checkStore(store: Store): void {
  const all = store.all();
  const ids = new Set(all.map((node) => node.id));
  if (ids.size !== all.length) throw new Error("duplicate node id");

  const roots = store.cards();
  if (new Set(roots).size !== roots.length) throw new Error("duplicate root");

  let rootCount = 0;
  for (const node of all) {
    if (store.indexOf(node.id) === -1) {
      throw new Error(`indexOf failed for ${node.id}`);
    }

    if (node.parent === null) {
      rootCount += 1;
      if (!roots.includes(node.id)) {
        throw new Error(`root ${node.id} missing from cards`);
      }
      if (node.kind !== "card") {
        throw new Error(`root ${node.id} is not a card`);
      }
    } else {
      const parent = store.get(node.parent);
      if (!parent) throw new Error(`orphan ${node.id}`);
      if (!parent.children.includes(node.id)) {
        throw new Error(`${node.id} missing from parent children`);
      }
      if (!kindDef(parent.kind).container) {
        throw new Error(`non-container ${parent.id} has children`);
      }
    }

    if (new Set(node.children).size !== node.children.length) {
      throw new Error(`${node.id} has duplicate children`);
    }

    for (const child of node.children) {
      const c = store.get(child);
      if (!c) throw new Error(`missing child ${child}`);
      if (c.parent !== node.id) {
        throw new Error(`${child} parent is ${String(c.parent)} not ${node.id}`);
      }
    }

    for (const [name] of node.rules) {
      if (!canFire(name, node.kind)) {
        throw new Error(`rule ${name} cannot fire on ${node.kind}`);
      }
    }
  }

  if (rootCount !== roots.length) {
    throw new Error("root count does not match cards");
  }

  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id)) throw new Error(`cycle at ${id}`);
    reachable.add(id);
    const node = store.get(id);
    if (!node) throw new Error(`missing node ${id}`);
    for (const child of node.children) walk(child);
  };
  for (const id of roots) walk(id);
  if (reachable.size !== all.length) throw new Error("unreachable nodes");

  for (const id of roots) {
    if (store.nodeCount(id) !== store.subtreeSize(id)) {
      throw new Error(`node count mismatch for ${id}`);
    }
  }
}

interface MirrorNode {
  id: string;
  kind: string;
  parent: string | null;
  children: string[];
  props: Record<string, string | number>;
  rules: Map<EventName, Action>;
}

export class Mirror {
  private readonly nodes = new Map<string, MirrorNode>();
  private roots: string[] = [];

  apply(patch: Patch): void {
    switch (patch.t) {
      case "create": {
        const node: MirrorNode = {
          id: patch.id,
          kind: patch.kind,
          parent: patch.parent,
          children: [],
          props: { ...patch.props },
          rules: new Map(),
        };
        this.nodes.set(node.id, node);
        if (node.parent === null) this.roots.splice(patch.index, 0, node.id);
        else this.nodes.get(node.parent)!.children.splice(patch.index, 0, node.id);
        return;
      }
      case "update": {
        const node = this.nodes.get(patch.id)!;
        for (const [key, value] of Object.entries(patch.props)) {
          node.props[key] = value;
        }
        for (const key of patch.removed) delete node.props[key];
        return;
      }
      case "move": {
        const node = this.nodes.get(patch.id)!;
        if (node.parent === null) {
          this.roots = this.roots.filter((id) => id !== patch.id);
        } else {
          const old = this.nodes.get(node.parent)!;
          old.children = old.children.filter((id) => id !== patch.id);
        }
        node.parent = patch.parent;
        this.nodes.get(patch.parent)!.children.splice(patch.index, 0, patch.id);
        return;
      }
      case "remove": {
        for (const id of patch.removed) this.removeOne(id);
        return;
      }
      case "rule": {
        const node = this.nodes.get(patch.id)!;
        if (patch.action) node.rules.set(patch.event, patch.action);
        else node.rules.delete(patch.event);
        return;
      }
      case "draft_remove":
        return;
    }
  }

  toJSON() {
    return {
      cards: [...this.roots],
      nodes: [...this.nodes.values()]
        .map((node) => ({
          id: node.id,
          kind: node.kind,
          parent: node.parent,
          children: [...node.children],
          props: { ...node.props },
          rules: [...node.rules.entries()].sort(([a], [b]) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  private removeOne(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    for (const child of [...node.children]) this.removeOne(child);
    this.nodes.delete(id);
    if (node.parent === null) {
      this.roots = this.roots.filter((root) => root !== id);
    } else {
      const parent = this.nodes.get(node.parent);
      if (parent) parent.children = parent.children.filter((c) => c !== id);
    }
  }
}