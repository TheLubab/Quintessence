import type { CheckedOp, Patch } from "../protocol/ops";
import type { PropValue } from "../protocol/schema";
import type { Node, Store } from "./store";

export function patchFor(store: Store, op: CheckedOp): Patch | null {
  switch (op.t) {
    case "create": {
      if (op.replace) {
        const node = store.get(op.id)!;
        const props: Record<string, PropValue> = {};
        const removed: string[] = [];
        for (const key of Object.keys(node.props)) {
          if (!(key in op.props)) removed.push(key);
        }
        for (const [key, value] of Object.entries(op.props)) {
          if (node.props[key] !== value) props[key] = value;
        }
        if (Object.keys(props).length === 0 && removed.length === 0) {
          return null;
        }
        return { t: "update", id: op.id, props, removed };
      }
      const parent = op.in ?? null;
      const index =
        parent === null
          ? store.cards().length
          : (store.get(parent)?.children.length ?? 0);
      return {
        t: "create",
        id: op.id,
        kind: op.kind,
        parent,
        index,
        props: { ...op.props },
      };
    }
    case "update": {
      const node = store.get(op.id)!;
      const props: Record<string, PropValue> = {};
      const removed: string[] = [];
      for (const [key, value] of Object.entries(op.props)) {
        if (value === null) {
          if (key in node.props) removed.push(key);
        } else if (node.props[key] !== value) {
          props[key] = value;
        }
      }
      if (Object.keys(props).length === 0 && removed.length === 0) {
        return null;
      }
      return { t: "update", id: op.id, props, removed };
    }
    case "delete": {
      const removed: string[] = [];
      const walk = (id: string) => {
        const node = store.get(id)!;
        removed.push(id);
        for (const child of node.children) walk(child);
      };
      walk(op.id);
      return { t: "remove", id: op.id, removed };
    }
    case "move": {
      const node = store.get(op.id)!;
      const parent = store.get(op.in)!;
      const siblings =
        node.parent === op.in
          ? parent.children.filter((id) => id !== op.id)
          : parent.children;
      let index = siblings.length;
      if (op.at) {
        const ref = siblings.indexOf(op.at.ref);
        index = op.at.rel === "before" ? ref : ref + 1;
      }
      return { t: "move", id: op.id, parent: op.in, index };
    }
    case "rule_add":
      return { t: "rule", id: op.id, event: op.event, action: op.action };
    case "rule_del":
      return { t: "rule", id: op.id, event: op.event, action: null };
  }
}

export function apply(store: Store, op: CheckedOp): Patch | null {
  const patch = patchFor(store, op);
  if (!patch) return null;

  switch (patch.t) {
    case "create": {
      const node: Node = {
        id: patch.id,
        kind: patch.kind,
        parent: patch.parent,
        children: [],
        props: { ...patch.props },
        rules: new Map(),
      };
      store.insert(node, patch.index);
      return patch;
    }
    case "update": {
      const node = store.get(patch.id)!;
      for (const [key, value] of Object.entries(patch.props)) {
        node.props[key] = value;
      }
      for (const key of patch.removed) delete node.props[key];
      return patch;
    }
    case "move":
      store.move(patch.id, patch.parent, patch.index);
      return patch;
    case "remove":
      for (const id of [...patch.removed].reverse()) store.detach(id);
      return patch;
    case "rule": {
      const node = store.get(patch.id)!;
      if (patch.action) node.rules.set(patch.event, patch.action);
      else node.rules.delete(patch.event);
      return patch;
    }
    case "draft_remove":
      return patch;
  }
}