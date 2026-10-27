import type { Msg } from "../llm/client";
import { streamChat } from "../llm/client";
import { Log } from "../v0/engine/log";
import { Runtime } from "../v0/engine/runtime";
import { buildContext } from "../v0/model/context";
import { SYSTEM } from "../v0/model/prompt";
import { parse } from "../v0/parser/parse";
import { Splitter } from "../v0/parser/splitter";
import type { Statement } from "../v0/parser/splitter";
import type { Op } from "../v0/protocol/ops";
import type { Scenario } from "./scenarios";

export type EvalStream = (
  messages: Msg[],
  signal?: AbortSignal,
  model?: string,
) => AsyncGenerator<string>;

export interface RejectionSample {
  line: string;
  reason: string;
  key: string;
}

export interface EvalResult {
  id: string;
  at: number;
  scenarioId: string;
  scenario: string;
  group: string;
  model: string;
  run: number;
  accepted: number;
  rejected: number;
  issues: number;
  acceptRate: number | null;
  firstTokenMs: number | null;
  firstLineMs: number | null;
  firstOpMs: number | null;
  totalMs: number;
  outputChars: number;
  outputSample: string;
  state: Op[];
  promptChars: number;
  aborted: boolean;
  error?: string;
  rejections: RejectionSample[];
}

export interface RunOptions {
  signal?: AbortSignal;
  stream?: EvalStream;
}

const defaultStream: EvalStream = (messages, signal, model) =>
  streamChat(messages, signal, { model });

const OUTPUT_SAMPLE_MAX = 4000;

const statementText = (stmt: Statement): string => {
  if (stmt.body === undefined) return stmt.head;
  const tag = /<<([A-Z_]+)\s*$/.exec(stmt.head)?.[1];
  return tag
    ? `${stmt.head}\n${stmt.body}\n${tag}`
    : `${stmt.head}\n${stmt.body}`;
};

const REASON_RULES: Array<[RegExp, string]> = [
  [/^unknown id/, "unknown id"],
  [/^parent .* does not exist/, "missing parent"],
  [/^id .* already exists/, "duplicate id"],
  [/^unknown kind/, "unknown kind"],
  [/^unknown prop/, "unknown prop"],
  [/^bad value for/, "bad value"],
  [/^unknown operation/, "unknown operation"],
  [/^expected /, "bad statement shape"],
  [/^unterminated heredoc/, "unterminated heredoc"],
  [/^nothing to update/, "nothing to update"],
  [/^rule .* already exists/, "duplicate rule"],
  [/^event .* cannot fire/, "event/kind mismatch"],
  [/^card .* node limit/, "node limit"],
  [/^turn op limit/, "turn op limit"],
  [/^bad id/, "bad id"],
  [/^in=/, "bad in"],
  [/^move does not take/, "bad move"],
  [/^cannot /, "invalid move"],
  [/^unknown event/, "unknown event"],
  [/^unknown action/, "unknown action"],
  [/^"in" needs a value/, "bad in"],
  [/^use before= or after=/, "bad move"],
  [/^heredoc /, "bad heredoc"],
  [/^missing space after string/, "bad string"],
  [/^unterminated string/, "bad string"],
  [/^unexpected quote/, "bad string"],
  [/^bad prop name/, "bad prop name"],
  [/^duplicate prop/, "duplicate prop"],
  [/^not an operation/, "not an operation"],
];

/** Collapse noisy ids and values so rejection counts group by category. */
export function reasonKey(reason: string): string {
  for (const [pattern, key] of REASON_RULES) {
    if (pattern.test(reason)) return key;
  }
  const head = reason.split(":")[0].replace(/"[^"]*"/g, '"…"').trim();
  return (head || reason).slice(0, 80);
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const seed = (runtime: Runtime, source: string): RejectionSample[] => {
  const errors: RejectionSample[] = [];
  const splitter = new Splitter((event) => {
    if (event.type === "preview") return;
    if (event.type === "discard") {
      errors.push({
        line: event.head,
        reason: event.reason,
        key: reasonKey(event.reason),
      });
      return;
    }
    const line = statementText(event.stmt);
    const parsed = parse(event.stmt);
    if (!parsed.ok) {
      errors.push({ line, reason: parsed.reason, key: reasonKey(parsed.reason) });
      return;
    }
    const result = runtime.submit(parsed.op);
    if (!result.ok) {
      errors.push({ line, reason: result.reason, key: reasonKey(result.reason) });
    }
  });
  splitter.push(source);
  splitter.end();
  return errors;
};

const makeId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function runOne(
  scenario: Scenario,
  model: string,
  run: number,
  options: RunOptions = {},
): Promise<EvalResult> {
  const at = Date.now();
  const stream = options.stream ?? defaultStream;
  const base = {
    id: makeId(),
    at,
    scenarioId: scenario.id,
    scenario: scenario.name,
    group: scenario.group,
    model,
    run,
  };

  const runtime = new Runtime(new Log({ persist: false }));
  runtime.beginTurn("setup");
  const setupErrors = seed(runtime, scenario.setup ?? "");
  runtime.endTurn();

  if (setupErrors.length) {
    return {
      ...base,
      accepted: 0,
      rejected: 0,
      issues: 0,
      acceptRate: null,
      firstTokenMs: null,
      firstLineMs: null,
      firstOpMs: null,
      totalMs: 0,
      outputChars: 0,
      outputSample: "",
      state: [],
      promptChars: 0,
      aborted: false,
      error: `scenario setup failed: ${setupErrors[0].line} :: ${setupErrors[0].reason}`,
      rejections: [],
    };
  }

  for (const [id, value] of Object.entries(scenario.inputs ?? {})) {
    runtime.setInput(id, value);
  }

  if (
    scenario.event.type === "click" ||
    scenario.event.type === "submit"
  ) {
    const fired = runtime.fire(scenario.event.id, scenario.event.type);
    if (!fired) {
      return {
        ...base,
        accepted: 0,
        rejected: 0,
        issues: 0,
        acceptRate: null,
        firstTokenMs: null,
        firstLineMs: null,
        firstOpMs: null,
        totalMs: 0,
        outputChars: 0,
        outputSample: "",
        state: [],
        promptChars: 0,
        aborted: false,
        error: `event ${scenario.event.type} ${scenario.event.id} has no rule`,
        rejections: [],
      };
    }
  }

  const context = buildContext(runtime, scenario.event);
  const messages: Msg[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: context },
  ];

  runtime.beginTurn("eval");

  let accepted = 0;
  let rejected = 0;
  let issues = 0;
  let firstTokenMs: number | null = null;
  let firstLineMs: number | null = null;
  let firstOpMs: number | null = null;
  let outputChars = 0;
  let outputSample = "";
  let aborted = false;
  let error: string | undefined;
  const rejections: RejectionSample[] = [];
  const startedAt = performance.now();

  const splitter = new Splitter((event) => {
    if (event.type === "preview") return;
    if (event.type === "discard") {
      rejected += 1;
      rejections.push({
        line: event.head,
        reason: event.reason,
        key: reasonKey(event.reason),
      });
      return;
    }

    if (firstLineMs === null) firstLineMs = performance.now() - startedAt;
    const line = statementText(event.stmt);
    const parsed = parse(event.stmt);
    if (!parsed.ok) {
      rejected += 1;
      rejections.push({
        line,
        reason: parsed.reason,
        key: reasonKey(parsed.reason),
      });
      return;
    }

    const result = runtime.submit(parsed.op);
    if (!result.ok) {
      rejected += 1;
      rejections.push({
        line,
        reason: result.reason,
        key: reasonKey(result.reason),
      });
      return;
    }

    accepted += 1;
    issues += result.issues.length;
    if (firstOpMs === null) firstOpMs = performance.now() - startedAt;
  });

  try {
    for await (const chunk of stream(messages, options.signal, model)) {
      if (options.signal?.aborted) {
        aborted = true;
        break;
      }
      if (chunk.length) {
        if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
        if (outputSample.length < OUTPUT_SAMPLE_MAX) {
          outputSample += chunk.slice(
            0,
            OUTPUT_SAMPLE_MAX - outputSample.length,
          );
        }
      }
      outputChars += chunk.length;
      splitter.push(chunk);
    }
    if (aborted || options.signal?.aborted) {
      aborted = true;
    } else {
      splitter.end();
    }
  } catch (caught) {
    const err = caught as Error;
    if (err.name === "AbortError" || options.signal?.aborted) {
      aborted = true;
    } else {
      error = message(caught);
    }
  } finally {
    runtime.endTurn();
  }

  const totalMs = performance.now() - startedAt;
  const lines = accepted + rejected;
  const state = runtime
    .outline()
    .flatMap((card) => runtime.cardOps(card.id));

  return {
    ...base,
    accepted,
    rejected,
    issues,
    acceptRate: lines === 0 ? null : accepted / lines,
    firstTokenMs,
    firstLineMs,
    firstOpMs,
    totalMs,
    outputChars,
    outputSample,
    state,
    promptChars: context.length,
    aborted,
    ...(error ? { error } : {}),
    rejections,
  };
}