import { parentOf } from '../protocol/types';
import type { Node, Op, Patch } from '../protocol/types';

type AddOp = Extract<Op, { t: 'add' }>;

export class Store {
  readonly nodes = new Map<string, Node>();
  private pending = new Map<string, AddOp[]>(); // parentId -> adds waiting on it
  private listeners = new Set<(p: Patch) => void>();

  subscribe(fn: (p: Patch) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(p: Patch) { for (const l of this.listeners) l(p); }

  apply(op: Op) {
    if (op.t === 'add') this.add(op);
    else if (op.t === 'set') this.set(op);
    else this.del(op.id);
  }

  private add(op: AddOp) {
    const parent = parentOf(op.id);
    if (parent && !this.nodes.has(parent)) {
      const q = this.pending.get(parent) ?? [];
      q.push(op);
      this.pending.set(parent, q);
      return;
    }

    const existing = this.nodes.get(op.id);
    if (existing && existing.kind === op.kind) {
      existing.props = { ...op.props };
      this.emit({ t: 'update', node: existing });
      return;
    }
    if (existing) this.del(op.id); // kind changed: replace

    const node: Node = { id: op.id, kind: op.kind, props: { ...op.props }, parent, children: [] };
    this.nodes.set(node.id, node);
    if (parent) this.nodes.get(parent)!.children.push(node.id);
    this.emit({ t: 'create', node });

    const waiting = this.pending.get(node.id);
    if (waiting) {
      this.pending.delete(node.id);
      for (const w of waiting) this.add(w);
    }
  }

  private set(op: Extract<Op, { t: 'set' }>) {
    const n = this.nodes.get(op.id);
    if (!n) { console.warn('~ on missing node', op.id); return; }
    const changed: string[] = [];
    for (const [k, v] of Object.entries(op.props)) {
      if (v === '') {
        if (k in n.props) { delete n.props[k]; changed.push(k); }
      } else if (n.props[k] !== v) {
        n.props[k] = v; changed.push(k);
      }
    }
    if (changed.length) this.emit({ t: 'update', node: n, changed });
  }

  private del(id: string) {
    const n = this.nodes.get(id);
    if (!n) { this.pending.delete(id); return; }
    const removed: string[] = [];
    const walk = (x: Node) => {
      for (const c of x.children) walk(this.nodes.get(c)!);
      removed.push(x.id);
      this.nodes.delete(x.id);
      this.pending.delete(x.id);
    };
    walk(n);
    if (n.parent) {
      const p = this.nodes.get(n.parent);
      if (p) p.children = p.children.filter((c) => c !== id);
    }
    this.emit({ t: 'remove', id, removed });
  }

  /** State serialized in the same language: this is what the LLM reads. */
  snapshot(): string {
    const lines: string[] = [];
    const walk = (n: Node) => {
      lines.push(`+${n.kind} ${n.id}${fmtProps(n.props)}`);
      for (const c of n.children) walk(this.nodes.get(c)!);
    };
    for (const n of this.nodes.values()) if (!n.parent) walk(n);
    return lines.join('\n');
  }
}

const fmtProps = (p: Record<string, string>) =>
  Object.entries(p)
    .map(([k, v]) => ` ${k}=${/[\s"\\]/.test(v) ? `"${v.replace(/["\\]/g, '\\$&')}"` : v}`)
    .join('');
