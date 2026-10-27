import { findHeredoc } from "./lex";

/** One statement. `body` exists only when the head ends with `key=<<TAG`. */
export interface Statement {
  head: string;
  body?: string;
}

export type SplitEvent =
  | { type: "statement"; stmt: Statement } // complete: commit it
  | { type: "preview"; stmt: Statement } // heredoc still streaming: never commit
  | { type: "discard"; head: string; reason: string }; // stream ended inside a heredoc

interface Open {
  head: string;
  tag: string;
  lines: string[];
  shown: string | null;
}

export class Splitter {
  private buf = "";
  private open: Open | null = null;
  private readonly emit: (e: SplitEvent) => void;

  constructor(emit: (e: SplitEvent) => void) {
    this.emit = emit;
  }

  push(chunk: string) {
    this.buf += chunk;
    let start = 0;
    for (
      let nl = this.buf.indexOf("\n");
      nl !== -1;
      nl = this.buf.indexOf("\n", start)
    ) {
      this.line(this.buf.slice(start, nl));
      start = nl + 1;
    }
    this.buf = this.buf.slice(start);
    this.preview();
  }

  end() {
    if (this.buf) this.line(this.buf); // a final line without "\n" still counts
    this.buf = "";
    const o = this.open;
    if (o) {
      this.open = null;
      this.emit({
        type: "discard",
        head: o.head,
        reason: `unterminated heredoc <<${o.tag}`,
      });
    }
  }

  private line(raw: string) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const o = this.open;

    if (o) {
      // terminator: the tag alone on a line (trailing spaces tolerated)
      if (line.trimEnd() === o.tag) {
        this.open = null;
        this.emit({
          type: "statement",
          stmt: { head: o.head, body: o.lines.join("\n") },
        });
      } else o.lines.push(line); // body is literal: no trimming, no comments, no fences
      return;
    }

    const s = line.trim();
    if (!s || s[0] === "#" || s.startsWith("```")) return;
    const tag = findHeredoc(s);
    if (tag) this.open = { head: s, tag, lines: [], shown: null };
    else this.emit({ type: "statement", stmt: { head: s } });
  }

  /** Called once per push, so previews are cheap and chunk-dependent by design. */
  private preview() {
    const o = this.open;
    if (!o) return;
    const p = this.buf.endsWith("\r") ? this.buf.slice(0, -1) : this.buf;
    // hold back a partial last line that might still become the terminator ("EN" of "END")
    const hold = o.tag.startsWith(p.trimEnd());
    const body = (hold ? o.lines : [...o.lines, p]).join("\n");
    if (body === o.shown) return;
    o.shown = body;
    this.emit({ type: "preview", stmt: { head: o.head, body } });
  }
}
