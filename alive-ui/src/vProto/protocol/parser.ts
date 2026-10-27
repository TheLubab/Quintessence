import type { Op, Props } from './types';

const KEY = /^[a-z][\w-]*$/i;

function tokenize(s: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false, has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { inQ = !inQ; has = true; continue; }
    if (c === '\\' && inQ && i + 1 < s.length) { cur += s[++i]; continue; }
    if (!inQ && /\s/.test(c)) {
      if (has || cur) { out.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += c; has = true;
  }
  if (has || cur) out.push(cur);
  return out;
}

function parseProps(toks: string[], onError: (m: string) => void): Props {
  const props: Props = {};
  for (const t of toks) {
    const eq = t.indexOf('=');
    const k = eq === -1 ? t : t.slice(0, eq);
    if (eq === -1 || !KEY.test(k)) { onError(`bad prop "${t}"`); continue; }
    props[k] = t.slice(eq + 1);
  }
  return props;
}

export function parseLine(line: string, onError: (m: string) => void): Op | null {
  const s = line.trim();
  if (!s || s[0] === '#' || s[0] === '@') return null;
  if (s.startsWith('```')) return null;
  const toks = tokenize(s.slice(1));
  switch (s[0]) {
    case '+': {
      const [kind, id, ...rest] = toks;
      if (!kind || !id) { onError('add needs kind and id'); return null; }
      return { t: 'add', kind, id, props: parseProps(rest, onError) };
    }
    case '~': {
      const [id, ...rest] = toks;
      if (!id) { onError('set needs id'); return null; }
      return { t: 'set', id, props: parseProps(rest, onError) };
    }
    case '-': {
      const id = toks.length > 1 ? toks[1] : toks[0];
      if (!id) { onError('del needs id'); return null; }
      return { t: 'del', id };
    }
    default:
      onError(`unknown sigil "${s[0]}"`);
      return null;
  }
}

/** Feed it arbitrary chunks; emits one Op per completed line. */
export class OpParser {
  private buf = '';
  constructor(
    private onOp: (op: Op) => void,
    private onError: (line: string, msg: string) => void = () => {},
  ) {}

  push(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf('\n')) !== -1) {
      this.line(this.buf.slice(0, i));
      this.buf = this.buf.slice(i + 1);
    }
  }

  end() {
    if (this.buf.trim()) this.line(this.buf);
    this.buf = '';
  }

  private line(l: string) {
    const op = parseLine(l, (m) => this.onError(l, m));
    if (op) this.onOp(op);
  }
}
