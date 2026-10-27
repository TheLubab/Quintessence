import type { Rejection } from "../protocol/ops";
import { printOp } from "../parser/print";
import type { Runtime } from "../engine/runtime";

export type SessionEvent =
  | { type: "start" }
  | { type: "click"; id: string }
  | { type: "submit"; id: string }
  | { type: "ask"; prompt: string; focus?: string };

const START_ASK = "Begin a new interface.";

const eventLabel = (event: SessionEvent): string =>
  event.type === "start"
    ? "start"
    : event.type === "ask"
      ? "ask"
      : `${event.type} ${event.id}`;

const gist = (card: {
  id: string;
  title: string;
  nodeCount: number;
}): string =>
  `${card.id} | ${JSON.stringify(card.title)} | ${card.nodeCount} nodes`;

const stateBlock = (runtime: Runtime, focus?: string): string => {
  const parts: string[] = [];

  if (focus) {
    parts.push(`FOCUS ${focus}`);
    const ops = runtime.cardOps(focus).map((op) => {
      if (op.t !== "create" || op.kind !== "input") return op;
      const props = { ...op.props };
      delete props.value;
      return { ...op, props };
    });
    parts.push(ops.length ? ops.map(printOp).join("\n") : "(missing)");

    const others = runtime.outline(focus);
    if (others.length) {
      parts.push("OTHER");
      parts.push(others.map(gist).join("\n"));
    }
  } else {
    const cards = runtime.outline();
    if (cards.length) {
      parts.push("OTHER");
      parts.push(cards.map(gist).join("\n"));
    } else {
      parts.push("(empty)");
    }
  }

  return parts.join("\n");
};

const errorsBlock = (errors: readonly Rejection[]): string =>
  errors.length
    ? errors.map((error) => `ERROR ${error.line} :: ${error.reason}`).join("\n")
    : "(none)";

const inputsBlock = (inputs: Record<string, string>): string => {
  const entries = Object.entries(inputs);
  return entries.length
    ? entries
        .map(([id, value]) => `${id} = ${JSON.stringify(value)}`)
        .join("\n")
    : "(none)";
};

export function buildContext(
  runtime: Runtime,
  event: SessionEvent,
  errors: readonly Rejection[] = [],
): string {
  const fired =
    event.type === "click" || event.type === "submit"
      ? runtime.fire(event.id, event.type)
      : undefined;
  const focus =
    event.type === "ask"
      ? event.focus
        ? runtime.cardOf(event.focus)
        : undefined
      : (fired?.card ??
        (event.type === "start" ? undefined : runtime.cardOf(event.id)));
  const ask =
    event.type === "ask"
      ? event.prompt
      : fired?.intent || (event.type === "start" ? START_ASK : "(none)");
  const inputs = focus ? runtime.inputs(focus) : {};

  return [
    "STATE",
    stateBlock(runtime, focus),
    "",
    "ERRORS",
    errorsBlock(errors),
    "",
    "EVENT",
    eventLabel(event),
    "",
    "ASK",
    ask,
    "",
    "INPUTS",
    inputsBlock(inputs),
  ].join("\n");
}