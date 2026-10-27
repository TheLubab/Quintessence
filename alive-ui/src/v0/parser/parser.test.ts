import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { Splitter, type SplitEvent, type Statement } from "./splitter";
import { parse } from "./parse";
import { printOp } from "./print";
import { script, garbage, cuts, text, chunkify } from "./arb";
import type { Op } from "../protocol/ops";

function run(chunks: string[]): SplitEvent[] {
  const ev: SplitEvent[] = [];
  const sp = new Splitter((e) => ev.push(e));
  for (const c of chunks) sp.push(c);
  sp.end();
  return ev;
}
const stmts = (s: string) =>
  run([s]).flatMap((e) => (e.type === "statement" ? [e.stmt] : []));
const committed = (ev: SplitEvent[]) => ev.filter((e) => e.type !== "preview");

const ok = (head: string, body?: string): Op => {
  const r = parse({ head, body });
  if (!r.ok) throw new Error(`${r.reason} :: ${head}`);
  return r.op;
};
const bad = (head: string, body?: string) => {
  const r = parse({ head, body });
  if (r.ok) throw new Error(`expected rejection :: ${head}`);
  return r.reason;
};

describe("parse", () => {
  it("create lifts `in` out of props", () => {
    expect(ok('+button notes.add in=notes label="New note"')).toEqual({
      t: "create",
      kind: "button",
      id: "notes.add",
      in: "notes",
      props: { label: "New note" },
    });
  });

  it('separates `key=` (remove) from `key=""` (empty)', () => {
    expect(ok("~a title=")).toEqual({
      t: "update",
      id: "a",
      props: { title: null },
    });
    expect(ok('~a title=""')).toEqual({
      t: "update",
      id: "a",
      props: { title: "" },
    });
  });

  it("keeps `in` as a plain prop on update", () => {
    expect(ok("~a in=b")).toEqual({ t: "update", id: "a", props: { in: "b" } });
  });

  it("reads escapes, and keeps unknown ones literally", () => {
    expect(ok('~a t="a\\"b\\\\c\\nd"')).toMatchObject({
      props: { t: 'a"b\\c\nd' },
    });
    expect(ok('~a t="a\\qb"')).toMatchObject({ props: { t: "a\\qb" } });
  });

  it("takes the heredoc body as the prop value", () => {
    expect(ok("+text a content=<<END", 'x "y" {z}')).toMatchObject({
      props: { content: 'x "y" {z}' },
    });
  });

  it("delete vs rule delete", () => {
    expect(ok("-onboarding")).toEqual({ t: "delete", id: "onboarding" });
    expect(ok("-on a.b click")).toEqual({
      t: "rule_del",
      id: "a.b",
      event: "click",
    });
  });

  it("rules", () => {
    expect(ok('+on a.b click -> prompt "Do it"')).toEqual({
      t: "rule_add",
      id: "a.b",
      event: "click",
      action: { type: "prompt", intent: "Do it" },
    });
  });

  it("move", () => {
    expect(ok(">a in=b after=c")).toEqual({
      t: "move",
      id: "a",
      in: "b",
      at: { rel: "after", ref: "c" },
    });
  });

  it("rejects with a reason", () => {
    expect(bad("+card on")).toMatch(/reserved/);
    expect(bad("+button a label=New note")).toMatch(/quote values/);
    expect(bad('+button a label="oops')).toMatch(/unterminated/);
    expect(bad("+a.b label=x")).toMatch(/expected \+kind id/);
    expect(bad("-text notes.body")).toMatch(/one id/);
    expect(bad("~a")).toMatch(/nothing to update/);
    expect(bad("~a x=1 x=2")).toMatch(/duplicate/);
    expect(bad(">a in=b before=c after=d")).toMatch(/not both/);
    expect(bad(">a before=c")).toMatch(/needs in/);
    expect(bad(">a in=b color=red")).toMatch(/does not take/);
    expect(bad("+widget a")).toMatch(/unknown kind/);
    expect(bad("+card home in=shell")).toMatch(/root/);
    expect(bad('+on a.b hover -> prompt "x"')).toMatch(/unknown event/);
    expect(bad('+on a.b click -> ask "x"')).toMatch(/unknown action/);
    expect(bad('+on a click ask "x"')).toMatch(/expected \+on/);
    expect(bad('+on a.b click -> prompt "x" ; prompt "y"')).toMatch(
      /one action/,
    );
    expect(bad("+on a.b click -> set $x 1")).toMatch(
      /expected \+on|unknown action/,
    );
    expect(bad("+text a content=<<END x=1")).toMatch(/last token/);
    expect(bad("+text a content=<<END")).toMatch(/without a body/);
    expect(bad("hello there")).toMatch(/unknown operation/);
  });
});

describe("splitter", () => {
  it("commits a heredoc whose terminator has no trailing newline", () => {
    expect(stmts("+text a content=<<END\nhi\nthere\nEND")).toEqual([
      { head: "+text a content=<<END", body: "hi\nthere" },
    ]);
  });

  it("discards an unterminated heredoc and commits nothing", () => {
    const ev = run(["+text a content=<<END\nhi\n"]);
    expect(ev.some((e) => e.type === "statement")).toBe(false);
    expect(ev[ev.length - 1]).toMatchObject({ type: "discard" });
  });

  it("does not treat <<TAG inside a string as a heredoc", () => {
    expect(stmts('+text a content="x <<END"\n-a').map((s) => s.head)).toEqual([
      '+text a content="x <<END"',
      "-a",
    ]);
  });

  it("does not open a heredoc when lex rejects the head", () => {
    expect(
      stmts('+text a title=x"y" content=<<END\n+card x\nEND\n').map(
        (s) => s.head,
      ),
    ).toEqual(['+text a title=x"y" content=<<END', "+card x", "END"]);
  });

  it("keeps the body literal and resumes normal parsing after it", () => {
    const got = stmts(
      "+text a content=<<END\n# not a comment\n```\nENDING\n+card x\nEND\n-a",
    );
    expect(got).toEqual([
      {
        head: "+text a content=<<END",
        body: "# not a comment\n```\nENDING\n+card x",
      },
      { head: "-a" },
    ]);
  });

  it("holds back a partial line that may become the terminator", () => {
    const ev: SplitEvent[] = [];
    const sp = new Splitter((e) => ev.push(e));
    sp.push("+text a content=<<END\nhello\nEN");
    expect(ev[ev.length - 1]).toEqual({
      type: "preview",
      stmt: { head: "+text a content=<<END", body: "hello" },
    });
    sp.push("D\n");
    expect(ev[ev.length - 1]).toMatchObject({ type: "statement" });
  });

  it("is chunk-invariant (statements and discards)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          script.map((s) => s.text),
          garbage,
        ),
        cuts,
        (s, cs) => {
          expect(committed(run(chunkify(s, cs)))).toEqual(committed(run([s])));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("previews are always a prefix of the committed body", () => {
    fc.assert(
      fc.property(text, cuts, (t, cs) => {
        const src =
          printOp({
            t: "create",
            kind: "text",
            id: "a",
            props: { content: "x\n" + t },
          }) + "\n";
        const ev = run(chunkify(src, cs));
        const done = ev.flatMap((e) =>
          e.type === "statement" ? [e.stmt] : [],
        );
        expect(done).toHaveLength(1);
        for (const e of ev) {
          if (e.type === "preview")
            expect(done[0].body!.startsWith(e.stmt.body ?? "")).toBe(true);
        }
      }),
    );
  });
});

describe("pipeline", () => {
  it("print -> random chunks -> splitter -> parse returns the original ops", () => {
    fc.assert(
      fc.property(script, cuts, ({ ops, text }, cs) => {
        const got: Op[] = [];
        for (const e of run(chunkify(text, cs))) {
          expect(e.type).not.toBe("discard");
          if (e.type !== "statement") continue;
          const r = parse(e.stmt);
          if (!r.ok) throw new Error(`${r.reason} :: ${e.stmt.head}`);
          got.push(r.op);
        }
        expect(got).toEqual(ops);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws on garbage, and every rejection has a reason", () => {
    fc.assert(
      fc.property(garbage, cuts, (g, cs) => {
        for (const e of run(chunkify(g, cs))) {
          if (e.type === "discard") expect(e.reason).toBeTruthy();
          else {
            const r = parse(e.stmt as Statement);
            if (!r.ok) expect(r.reason).toBeTruthy();
          }
        }
      }),
      { numRuns: 500 },
    );
  });
});
