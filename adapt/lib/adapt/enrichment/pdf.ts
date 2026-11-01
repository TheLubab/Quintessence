import { inflateRawSync, inflateSync } from "node:zlib";

function readEscape(source: string, index: number): [string, number] {
  const next = source[index + 1];

  if (next === undefined) return ["", index + 1];

  if (next === "\r") {
    return source[index + 2] === "\n"
      ? ["", index + 3]
      : ["", index + 2];
  }

  if (next === "\n") return ["", index + 2];

  if (next >= "0" && next <= "7") {
    let digits = next;
    let cursor = index + 2;

    while (
      digits.length < 3 &&
      source[cursor] !== undefined &&
      source[cursor]! >= "0" &&
      source[cursor]! <= "7"
    ) {
      digits += source[cursor]!;
      cursor++;
    }

    return [String.fromCharCode(Number.parseInt(digits, 8) & 0xff), cursor];
  }

  const escapes: Record<string, string> = {
    n: "\n",
    r: "\r",
    t: "\t",
    b: "\b",
    f: "\f",
    "(": "(",
    ")": ")",
    "\\": "\\",
  };

  return [escapes[next] ?? next, index + 2];
}

function decodeHex(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, "");
  const bytes: number[] = [];

  for (let index = 0; index + 1 < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";

    for (let index = 2; index + 1 < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index]! << 8) | bytes[index + 1]!);
    }

    return text;
  }

  return Buffer.from(bytes).toString("latin1");
}

function stringsIn(block: string): string[] {
  const values: string[] = [];

  for (let index = 0; index < block.length; index++) {
    const character = block[index]!;

    if (character === "(") {
      let depth = 1;
      let value = "";
      let cursor = index + 1;

      while (cursor < block.length && depth > 0) {
        const current = block[cursor]!;

        if (current === "\\") {
          const [decoded, next] = readEscape(block, cursor);
          value += decoded;
          cursor = next;
          continue;
        }

        if (current === "(") {
          depth++;
          value += current;
          cursor++;
          continue;
        }

        if (current === ")") {
          depth--;

          if (depth === 0) {
            cursor++;
            break;
          }

          value += current;
          cursor++;
          continue;
        }

        value += current;
        cursor++;
      }

      values.push(value);
      index = cursor - 1;
      continue;
    }

    if (character === "<" && block[index + 1] !== "<") {
      const end = block.indexOf(">", index + 1);

      if (end < 0) break;

      values.push(decodeHex(block.slice(index + 1, end)));
      index = end;
    }
  }

  return values;
}

function inflate(data: string): string | null {
  const bytes = Buffer.from(data, "latin1");

  try {
    return inflateSync(bytes).toString("latin1");
  } catch {
    try {
      return inflateRawSync(bytes).toString("latin1");
    } catch {
      return null;
    }
  }
}

function textFromContent(content: string): string {
  const lines: string[] = [];
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [];

  for (const block of blocks) {
    const value = stringsIn(block).join("").trim();

    if (value) lines.push(value);
  }

  return lines.join("\n");
}

export function extractPdfText(bytes: Uint8Array): string {
  const source = Buffer.from(bytes).toString("latin1");
  const streams: string[] = [];
  const pattern = /(?<![A-Za-z])stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const end = source.indexOf("endstream", start);

    if (end < 0) break;

    const header = source.slice(Math.max(0, match.index - 2048), match.index);
    const data = source.slice(start, end).replace(/\r?\n$/, "");
    const decoded = /FlateDecode/.test(header) ? inflate(data) : data;

    if (decoded) streams.push(decoded);

    pattern.lastIndex = end + "endstream".length;
  }

  if (streams.length === 0) streams.push(source);

  const text = streams.map(textFromContent).filter(Boolean).join("\n");

  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}