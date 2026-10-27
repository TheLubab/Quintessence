import { apply, patchFor } from "./apply";
import { Log } from "./log";
import type { LogEntry } from "./log";
import type { CheckedOp, Op, Patch, Rejection } from "../protocol/ops";
import { printOp } from "../parser/print";
import type { EventName, PropValue } from "../protocol/schema";
import { Store } from "./store";
import { toRawOp, validate } from "./validate";

export type { CheckedOp, Op, Patch, Rejection } from "../protocol/ops";
export type { LogEntry } from "./log";

export type SubmitResult =
  | { ok: true; issues: string[]; noop: boolean }
  | { ok: false; reason: string };

export type PreviewResult =
  | { ok: true; issues: string[] }
  | { ok: false; reason: string };

export interface FireResult {
  intent: string;
  card: string;
  inputs: Record<string, string>;
}

export interface CardOutline {
  id: string;
  title: string;
  nodeCount: number;
}

const issuesOf = (op: CheckedOp): string[] =>
  op.t === "create" || op.t === "update" ? op.issues : [];

const rawProps = (
  props: Record<string, PropValue>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) out[key] = String(value);
  return out;
};

const subtree = (store: Store, id: string): string[] => {
  const out: string[] = [];
  const walk = (current: string) => {
    const node = store.get(current);
    if (!node) return;
    out.push(current);
    for (const child of node.children) walk(child);
  };
  walk(id);
  return out;
};

export class Runtime {
  private readonly log: Log;
  private readonly store: Store;
  private readonly listeners = new Set<(patch: Patch) => void>();
  private readonly inputValues = new Map<string, string>();
  private previewId: string | null = null;
  private turn = "";
  private turnCount = 0;
  private turnSeq = 0;

  constructor(log: Log = new Log(), store: Store = new Store()) {
    this.log = log;
    this.store = store;
  }

  subscribe(listener: (patch: Patch) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  beginTurn(id?: string): string {
    let turn = id;
    if (!turn) {
      this.turnSeq += 1;
      turn = `turn-${this.turnSeq}`;
    }
    this.turn = turn;
    this.turnCount = 0;
    return turn;
  }

  endTurn(): void {
    this.turn = "";
    this.turnCount = 0;
  }

  submit(op: Op): SubmitResult {
    return this.execute(op, true);
  }

  preview(op: Op): PreviewResult {
    if (!this.turn) this.beginTurn();
    const result = validate(this.store, op, { opsThisTurn: this.turnCount });
    if (!result.ok) return result;

    const checked = result.op;
    const issues = issuesOf(checked);
    if (checked.t !== "create" && checked.t !== "update") {
      return { ok: true, issues };
    }

    const patch = patchFor(this.store, checked);
    if (!patch || (patch.t !== "create" && patch.t !== "update")) {
      return { ok: true, issues };
    }

    if (this.previewId !== null && this.previewId !== patch.id) {
      this.clearPreview(this.previewId);
    }
    this.previewId = patch.id;
    if (patch.t === "create") this.emit({ ...patch, draft: true });
    else this.emit({ ...patch, draft: true });
    return { ok: true, issues };
  }

  clearPreview(id: string): void {
    if (this.previewId !== id) return;
    this.previewId = null;
    this.emit({ t: "draft_remove", id });
  }

  cardOf(id: string): string | undefined {
    return this.store.cardOf(id);
  }

  cardOps(cardId: string): Op[] {
    const out: Op[] = [];
    const walk = (id: string) => {
      const node = this.store.get(id);
      if (!node) return;
      out.push({
        t: "create",
        kind: node.kind,
        id: node.id,
        ...(node.parent !== null ? { in: node.parent } : {}),
        props: rawProps(node.props),
      });
      for (const [event, action] of node.rules) {
        out.push({ t: "rule_add", id: node.id, event, action });
      }
      for (const child of node.children) walk(child);
    };
    walk(cardId);
    return out;
  }

  outline(exclude?: string): CardOutline[] {
    return this.store
      .cards()
      .filter((id) => id !== exclude)
      .map((id) => {
        const card = this.store.get(id);
        return {
          id,
          title: String(card?.props.title ?? id),
          nodeCount: this.store.nodeCount(id),
        };
      });
  }

  inputs(cardId: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (id: string) => {
      const node = this.store.get(id);
      if (!node) return;
      if (node.kind === "input") out[id] = this.inputValues.get(id) ?? "";
      for (const child of node.children) walk(child);
    };
    walk(cardId);
    return out;
  }

  setInput(id: string, value: string): void {
    const node = this.store.get(id);
    if (!node || node.kind !== "input") return;
    this.inputValues.set(id, value);
  }

  fire(id: string, event: EventName): FireResult | undefined {
    const node = this.store.get(id);
    if (!node) return undefined;
    const action = node.rules.get(event);
    if (!action) return undefined;
    const card = this.store.cardOf(id);
    if (!card) return undefined;
    return { intent: action.intent, card, inputs: this.inputs(card) };
  }

  async load(): Promise<Rejection[]> {
    const entries = await this.log.load();
    return this.restore(entries);
  }

  restore(entries: readonly LogEntry[]): Rejection[] {
    this.clearForReplay();
    const rejected: Rejection[] = [];
    let current = "";

    for (const entry of entries) {
      if (entry.turn !== current) {
        this.beginTurn(entry.turn);
        current = entry.turn;
      }
      const result = this.execute(entry.op, false);
      if (!result.ok) {
        rejected.push({ line: printOp(entry.op), reason: result.reason });
      }
    }

    this.endTurn();
    return rejected;
  }

  async undo(): Promise<boolean> {
    await this.log.load();
    const before = this.log.all().length;
    const remaining = await this.log.dropLastTurn();
    if (before === this.log.all().length) return false;
    this.restore(remaining);
    return true;
  }

  async reset(): Promise<void> {
    this.clearForReplay();
    await this.log.clear();
  }

  private execute(op: Op, logging: boolean): SubmitResult {
    if (!this.turn) this.beginTurn();
    const opsThisTurn = this.turnCount;
    this.turnCount += 1;

    if (this.previewId !== null && this.previewId === op.id) {
      this.clearPreview(op.id);
    }

    const result = validate(this.store, op, { opsThisTurn });
    if (!result.ok) return result;

    const checked = result.op;
    if (checked.t === "update" && checked.noop) {
      return { ok: true, issues: checked.issues, noop: true };
    }

    const patch = apply(this.store, checked);
    if (!patch) return { ok: true, issues: issuesOf(checked), noop: true };

    this.syncInputs(checked, patch);
    if (logging) this.log.append(this.turn, toRawOp(checked));
    this.emit(patch);
    return { ok: true, issues: issuesOf(checked), noop: false };
  }

  private syncInputs(op: CheckedOp, patch: Patch): void {
    if (patch.t === "remove") {
      for (const id of patch.removed) this.inputValues.delete(id);
      return;
    }

    if (op.t === "create" && op.kind === "input") {
      const value = op.props.value;
      if (typeof value === "string") this.inputValues.set(op.id, value);
      return;
    }

    if (op.t === "update") {
      const node = this.store.get(op.id);
      if (node?.kind !== "input") return;
      if (!("value" in op.props)) return;
      const value = op.props.value;
      if (value === null) this.inputValues.delete(op.id);
      else if (typeof value === "string") this.inputValues.set(op.id, value);
    }
  }

  private clearForReplay(): void {
    if (this.previewId !== null) this.clearPreview(this.previewId);
    for (const id of this.store.cards()) {
      this.emit({ t: "remove", id, removed: subtree(this.store, id) });
    }
    this.store.clear();
    this.inputValues.clear();
    this.previewId = null;
    this.turn = "";
    this.turnCount = 0;
  }

  private emit(patch: Patch): void {
    for (const listener of [...this.listeners]) listener(patch);
  }
}