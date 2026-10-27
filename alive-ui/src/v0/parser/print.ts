import type { Op, RawProps } from "../protocol/ops";

const bare = (v: string) => /^[^\s"]+$/.test(v) && !v.startsWith("<<");
export const quote = (s: string) =>
  '"' + s.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\n") + '"';

/** The last multi-line value becomes a heredoc (it must be the last token). */
function withProps(head: string, p: RawProps): string {
  const keys = Object.keys(p);
  let hd = -1;
  keys.forEach((k, i) => {
    const v = p[k];
    if (v !== null && v.includes("\n")) hd = i;
  });

  let out = head;
  keys.forEach((k, i) => {
    if (i === hd) return;
    const v = p[k];
    out += ` ${k}=${v === null ? "" : bare(v) ? v : quote(v)}`;
  });
  if (hd === -1) return out;

  const body = p[keys[hd]] as string;
  const lines = body.split("\n");
  let tag = "END";
  while (lines.some((l) => l.trimEnd() === tag)) tag += "_"; // never collide with the body
  return `${out} ${keys[hd]}=<<${tag}\n${body}\n${tag}`;
}

export function printOp(op: Op): string {
  switch (op.t) {
    case "create":
      return withProps(
        `+${op.kind} ${op.id}${op.in ? ` in=${op.in}` : ""}`,
        op.props,
      );
    case "update":
      return withProps(`~${op.id}`, op.props);
    case "delete":
      return `-${op.id}`;
    case "move":
      return `>${op.id} in=${op.in}${op.at ? ` ${op.at.rel}=${op.at.ref}` : ""}`;
    case "rule_add":
      return `+on ${op.id} ${op.event} -> ${op.action.type} ${quote(op.action.intent)}`;
    case "rule_del":
      return `-on ${op.id} ${op.event}`;
  }
}
