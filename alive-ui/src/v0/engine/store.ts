import type { Action } from "../protocol/ops";
import type { EventName, KindName, PropValue } from "../protocol/schema";

export interface Node {
  id: string;
  kind: KindName;
  parent: string | null;
  children: string[];
  props: Record<string, PropValue>;
  rules: Map<EventName, Action>;
}

export class Store {
  private byId = new Map<string, Node>();
  private roots: string[] = [];

  get(id: string): Node | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): Node[] {
    return [...this.byId.values()];
  }

  cards(): readonly string[] {
    return [...this.roots];
  }

  childIds(id: string): readonly string[] {
    return this.byId.get(id)?.children ?? [];
  }

  children(id: string): Node[] {
    const node = this.byId.get(id);
    if (!node) return [];
    const out: Node[] = [];
    for (const child of node.children) {
      const n = this.byId.get(child);
      if (n) out.push(n);
    }
    return out;
  }

  indexOf(id: string): number {
    const node = this.byId.get(id);
    if (!node) return -1;
    if (node.parent === null) return this.roots.indexOf(id);
    return this.byId.get(node.parent)?.children.indexOf(id) ?? -1;
  }

  isInside(a: string, b: string): boolean {
    let cur = this.byId.get(a)?.parent ?? null;
    while (cur !== null) {
      if (cur === b) return true;
      cur = this.byId.get(cur)?.parent ?? null;
    }
    return false;
  }

  cardOf(id: string): string | undefined {
    let node = this.byId.get(id);
    if (!node) return undefined;
    while (node.parent !== null) {
      const parent = this.byId.get(node.parent);
      if (!parent) break;
      node = parent;
    }
    return node.id;
  }

  subtreeSize(id: string): number {
    const node = this.byId.get(id);
    if (!node) return 0;
    let count = 0;
    const walk = (n: Node) => {
      count += 1;
      for (const child of n.children) {
        const c = this.byId.get(child);
        if (c) walk(c);
      }
    };
    walk(node);
    return count;
  }

  nodeCount(cardId: string): number {
    const node = this.byId.get(cardId);
    if (!node || node.parent !== null) return 0;
    return this.subtreeSize(cardId);
  }

  insert(node: Node, index: number): void {
    this.byId.set(node.id, node);
    if (node.parent === null) {
      this.roots.splice(index, 0, node.id);
      return;
    }
    const parent = this.byId.get(node.parent);
    parent?.children.splice(index, 0, node.id);
  }

  detach(id: string): Node | undefined {
    const node = this.byId.get(id);
    if (!node) return undefined;
    if (node.parent === null) {
      const i = this.roots.indexOf(id);
      if (i !== -1) this.roots.splice(i, 1);
    } else {
      const parent = this.byId.get(node.parent);
      const i = parent?.children.indexOf(id) ?? -1;
      if (i !== -1) parent!.children.splice(i, 1);
    }
    this.byId.delete(id);
    return node;
  }

  move(id: string, parent: string, index: number): void {
    const node = this.detach(id);
    if (!node) return;
    node.parent = parent;
    this.insert(node, index);
  }

  clear(): void {
    this.byId.clear();
    this.roots.length = 0;
  }
}