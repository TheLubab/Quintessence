import { TAG_RE } from "../protocol/schema";

export type Token =
  | { t: "word"; text: string }
  | { t: "str"; text: string } // "quoted"
  | { t: "pair"; key: string; value: string | null } // value null = `key=`
  | { t: "heredoc"; key: string; tag: string }; // key=<<TAG, last token only

export type Lexed =
  | { ok: true; tokens: Token[] }
  | { ok: false; reason: string };

const KEY_RE = /^[a-z][a-z0-9_-]*$/;
const isWs = (c: string) => c === " " || c === "\t" || c === "\r";

/** Reads "..." starting at s[i]. Null if the closing quote is missing. */
function readString(
  s: string,
  i: number,
): { value: string; end: number } | null {
  let out = "";
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === '"') return { value: out, end: j + 1 };
    if (c === "\\") {
      const n = s[j + 1];
      if (n === '"' || n === "\\") {
        out += n;
        j++;
      } else if (n === "n") {
        out += "\n";
        j++;
      } else out += c; // unknown escape: keep the backslash literally
    } else out += c;
  }
  return null;
}

export function lex(s: string): Lexed {
  const tokens: Token[] = [];
  const fail = (reason: string): Lexed => ({ ok: false, reason });
  let i = 0;

  for (;;) {
    while (i < s.length && isWs(s[i])) i++;
    if (i >= s.length) return { ok: true, tokens };

    // bare "string" token (used by a rule's quoted intent)
    if (s[i] === '"') {
      const r = readString(s, i);
      if (!r) return fail("unterminated string");
      if (r.end < s.length && !isWs(s[r.end]))
        return fail("missing space after string");
      tokens.push({ t: "str", text: r.value });
      i = r.end;
      continue;
    }

    let j = i;
    while (j < s.length && !isWs(s[j]) && s[j] !== '"') j++;
    const run = s.slice(i, j);
    const eq = run.indexOf("=");

    if (eq === -1) {
      if (s[j] === '"') return fail(`unexpected quote after "${run}"`);
      tokens.push({ t: "word", text: run });
      i = j;
      continue;
    }

    const key = run.slice(0, eq);
    const val = run.slice(eq + 1);
    if (!KEY_RE.test(key)) return fail(`bad prop name in "${run}"`);

    if (s[j] === '"') {
      if (val) return fail(`unexpected quote in "${run}"`);
      const r = readString(s, j);
      if (!r) return fail(`unterminated string for "${key}"`);
      if (r.end < s.length && !isWs(s[r.end]))
        return fail(`missing space after string for "${key}"`);
      tokens.push({ t: "pair", key, value: r.value });
      i = r.end;
    } else if (val.startsWith("<<")) {
      const tag = val.slice(2);
      if (!TAG_RE.test(tag))
        return fail(`bad heredoc tag "${tag}" (capitals, e.g. <<END)`);
      if (s.slice(j).trim())
        return fail("heredoc must be the last token on the line");
      tokens.push({ t: "heredoc", key, tag });
      i = j;
    } else {
      tokens.push({ t: "pair", key, value: val === "" ? null : val });
      i = j;
    }
  }
}

/**
 * Used by the splitter on a trimmed statement line. Shares `lex` with `parse`,
 * so both agree on whether a heredoc body follows. Returns null when the line is
 * not a valid heredoc opener.
 */
export function findHeredoc(line: string): string | null {
  const s = line.trimStart();
  if (!s || !"+~->".includes(s[0])) return null;
  const r = lex(s.slice(1));
  if (!r.ok) return null;
  const last = r.tokens[r.tokens.length - 1];
  return last?.t === "heredoc" ? last.tag : null;
}
