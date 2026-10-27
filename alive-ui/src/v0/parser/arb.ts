import * as fc from "fast-check";
import type { Op } from "../protocol/ops";
import { printOp } from "./print";

const LOWER = [..."abcdefghijklmnopqrstuvwxyz"];
const UNITS = [
  ...'abcXYZ019 \t\n\n"\\=<>{}$#+-~@()[]:;,.*/_',
  "é",
  "日",
  "END",
  "EN",
  "```",
  "<<",
  " -> ",
  "\nEND\n",
  "\n  END",
  "\nEND  \n",
  "\n# not a comment\n",
  "\n```\n",
  "\n+card x\n",
];

export const text = fc
  .array(fc.constantFrom(...UNITS), { maxLength: 24 })
  .map((a) => a.join(""));

const name = (tail: string) =>
  fc
    .tuple(
      fc.constantFrom(...LOWER),
      fc.array(fc.constantFrom(...[...tail]), { maxLength: 10 }),
    )
    .map(([h, t]) => h + t.join(""));

export const id = name(`${LOWER.join("")}0123456789_.-`).filter(
  (s) => s !== "on",
);
const key = name(`${LOWER.join("")}0123456789_-`).filter((k) => k !== "in");
const value = fc.oneof(text, fc.constant(null));
const props = fc.dictionary(key, value, { maxKeys: 4 });

const kind = fc.constantFrom(
  "card",
  "group",
  "text",
  "button",
  "input",
  "image",
);
const event = fc.constantFrom("click", "submit");

const create: fc.Arbitrary<Op> = fc
  .record({
    t: fc.constant("create" as const),
    kind,
    id,
    props,
  })
  .chain((base) =>
    fc.option(id, { nil: undefined }).map((parent) => ({
      ...base,
      in: base.kind === "card" ? undefined : parent,
    })),
  );

export const op: fc.Arbitrary<Op> = fc.oneof(
  create,
  fc.record({
    t: fc.constant("update" as const),
    id,
    props: fc.dictionary(key, value, { minKeys: 1, maxKeys: 4 }),
  }),
  fc.record({ t: fc.constant("delete" as const), id }),
  fc.record({
    t: fc.constant("move" as const),
    id,
    in: id,
    at: fc.option(
      fc.record({ rel: fc.constantFrom("before", "after"), ref: id }),
      { nil: undefined },
    ),
  }),
  fc.record({
    t: fc.constant("rule_add" as const),
    id,
    event,
    action: fc.record({ type: fc.constant("prompt" as const), intent: text }),
  }),
  fc.record({ t: fc.constant("rule_del" as const), id, event }),
);

/** A printed script with comments, fences, blank lines, CRLF and a missing final newline. */
export const script = fc
  .record({
    ops: fc.array(op, { maxLength: 8 }),
    noise: fc.array(
      fc.constantFrom("", "   ", "# a comment", "```alive", "```"),
      { maxLength: 8 },
    ),
    crlf: fc.boolean(),
    finalNl: fc.boolean(),
  })
  .map(({ ops, noise, crlf, finalNl }) => {
    const lines: string[] = [];
    ops.forEach((o, i) => {
      if (i < noise.length) lines.push(noise[i]);
      lines.push(printOp(o));
    });
    let s = lines.join("\n") + (finalNl ? "\n" : "");
    if (crlf) s = s.replace(/\n/g, "\r\n");
    return { ops, text: s };
  });

export const garbage = fc
  .array(
    fc.constantFrom(
      ...[...'+~->"\\=<# \n\rENDabc.`'],
      "END",
      "<<END",
      "->",
      "prompt",
    ),
    { maxLength: 60 },
  )
  .map((a) => a.join(""));

export const cuts = fc.array(fc.nat(), { maxLength: 12 });

export function chunkify(s: string, cs: number[]): string[] {
  const pts = [...new Set(cs.map((c) => c % (s.length + 1)))].sort(
    (a, b) => a - b,
  );
  const out: string[] = [];
  let prev = 0;
  for (const p of [...pts, s.length]) {
    out.push(s.slice(prev, p));
    prev = p;
  }
  return out;
}
