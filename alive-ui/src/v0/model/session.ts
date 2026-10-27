import type { Rejection } from "../protocol/ops";
import { parse } from "../parser/parse";
import { Splitter } from "../parser/splitter";
import type { SplitEvent, Statement } from "../parser/splitter";
import type { Runtime } from "../engine/runtime";
import type { Msg } from "../../llm/client";
import { streamChat } from "../../llm/client";
import { buildContext } from "./context";
import type { SessionEvent } from "./context";
import { SYSTEM } from "./prompt";

export type { SessionEvent } from "./context";

export type StreamFn = (
  messages: Msg[],
  signal?: AbortSignal,
) => AsyncGenerator<string>;

const lineText = (stmt: Statement): string => {
  if (stmt.body === undefined) return stmt.head;
  const tag = /<<([A-Z_]+)\s*$/.exec(stmt.head)?.[1];
  return tag
    ? `${stmt.head}\n${stmt.body}\n${tag}`
    : `${stmt.head}\n${stmt.body}`;
};

export class Session {
  private readonly runtime: Runtime;
  private readonly stream: StreamFn;
  private ctl: AbortController | null = null;
  private running: Promise<void> | null = null;
  private generation = 0;
  private pending: Rejection[] = [];

  constructor(runtime: Runtime, stream: StreamFn = streamChat) {
    this.runtime = runtime;
    this.stream = stream;
  }

  async send(event: SessionEvent): Promise<void> {
    if (!this.shouldSend(event)) return;

    const generation = ++this.generation;
    this.ctl?.abort();
    if (this.running) await this.running.catch(() => {});
    if (generation !== this.generation) return;

    const ctl = new AbortController();
    this.ctl = ctl;
    this.runtime.beginTurn();

    const errors = this.pending;
    this.pending = [];
    const user = buildContext(this.runtime, event, errors);
    const run = this.generate(user, ctl);
    this.running = run;

    try {
      await run;
    } finally {
      if (this.ctl === ctl) {
        this.ctl = null;
        this.runtime.endTurn();
      }
      if (this.running === run) this.running = null;
    }
  }

  stop(): void {
    this.generation += 1;
    this.ctl?.abort();
  }

  private shouldSend(event: SessionEvent): boolean {
    if (event.type === "start") return true;
    if (event.type === "ask") return event.prompt.trim().length > 0;
    return this.runtime.fire(event.id, event.type) !== undefined;
  }

  private async generate(user: string, ctl: AbortController): Promise<void> {
    const errors: Rejection[] = [];
    let previewId: string | null = null;

    const onEvent = (event: SplitEvent) => {
      if (ctl.signal.aborted) return;

      if (event.type === "preview") {
        const parsed = parse(event.stmt);
        if (!parsed.ok) return;
        if (parsed.op.t !== "create" && parsed.op.t !== "update") return;
        const result = this.runtime.preview(parsed.op);
        if (result.ok) previewId = parsed.op.id;
        return;
      }

      if (event.type === "discard") {
        if (previewId !== null) this.runtime.clearPreview(previewId);
        previewId = null;
        errors.push({ line: event.head, reason: event.reason });
        return;
      }

      previewId = null;
      const parsed = parse(event.stmt);
      if (!parsed.ok) {
        errors.push({ line: lineText(event.stmt), reason: parsed.reason });
        return;
      }

      const result = this.runtime.submit(parsed.op);
      if (!result.ok) {
        errors.push({ line: lineText(event.stmt), reason: result.reason });
      }
    };

    const splitter = new Splitter(onEvent);

    try {
      for await (const chunk of this.stream(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        ctl.signal,
      )) {
        if (ctl.signal.aborted) break;
        splitter.push(chunk);
      }
      if (!ctl.signal.aborted) splitter.end();
    } catch (error) {
      if ((error as Error).name !== "AbortError") console.error(error);
    } finally {
      if (previewId !== null) this.runtime.clearPreview(previewId);
      this.pending.push(...errors);
    }
  }
}