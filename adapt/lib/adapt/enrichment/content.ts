import type { Thing, Value } from "../core/contracts.ts";

import type { AssetStore } from "../assets/filesystem/index.ts";

import { parseDataUrl } from "../assets/url.ts";
import { dataValue } from "../core/validation.ts";
import { extractPdfText } from "./pdf.ts";

export type TextKind = "plain" | "document" | "structured";

export type ThingContent =
  | {
      readonly kind: "text";
      readonly title: string;
      readonly mimeType: string;
      readonly text: string;
      readonly textKind: TextKind;
      readonly truncated: boolean;
      readonly note: string | null;
      readonly knownData: Value | null;
    }
  | {
      readonly kind: "image";
      readonly title: string;
      readonly mimeType: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: "audio";
      readonly title: string;
      readonly mimeType: string;
      readonly bytes: Uint8Array;
      readonly filename: string;
    }
  | {
      readonly kind: "unavailable";
      readonly summary: string;
    };

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/javascript",
  "application/sql",
  "application/x-sh",
  "image/svg+xml",
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "ndjson",
  "xml",
  "html",
  "htm",
  "yaml",
  "yml",
  "toml",
  "log",
  "ini",
  "conf",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "sh",
  "sql",
  "svg",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "heif",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "oga",
  "m4a",
  "aac",
  "flac",
  "webm",
  "opus",
  "weba",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function thingTitle(thing: Thing): string {
  const data = thing.data;

  if (typeof data === "string") {
    const first = data.trim().split(/\r?\n/)[0]?.trim() ?? "";
    return (first || thing.type).slice(0, 120);
  }

  if (isRecord(data)) {
    for (const key of ["title", "name", "text", "label"]) {
      const value = data[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim().split(/\r?\n/)[0]!.trim().slice(0, 120);
      }
    }
  }

  return thing.type;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");

  return dot > 0 && dot < filename.length - 1
    ? filename.slice(dot + 1).toLowerCase()
    : "";
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    TEXT_MIME_TYPES.has(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

function isPdf(mimeType: string, extension: string): boolean {
  return mimeType === "application/pdf" || extension === "pdf";
}

function isImage(mimeType: string, extension: string): boolean {
  return (
    (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") ||
    IMAGE_EXTENSIONS.has(extension)
  );
}

function isAudio(mimeType: string, extension: string): boolean {
  return mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension);
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);

    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1]!;
      swapped[index - 1] = bytes[index]!;
    }

    return new TextDecoder("utf-16le").decode(swapped);
  }

  const text = new TextDecoder("utf-8").decode(bytes);

  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => named[name] ?? match)
    .replace(/&#(\d+);/g, (match, digits: string) => {
      const point = Number(digits);

      return point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match, digits: string) => {
      const point = Number.parseInt(digits, 16);

      return point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    });
}

function stripMarkup(value: string): string {
  return decodeEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clipText(
  value: string,
  limit: number,
): { text: string; truncated: boolean } {
  if (value.length <= limit) return { text: value, truncated: false };

  return {
    text: `${value.slice(0, limit).trimEnd()}\n\n[Content truncated]`,
    truncated: true,
  };
}

function parseDelimited(value: string, delimiter: string): Value | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;

    if (quoted) {
      if (character === '"') {
        if (value[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && value[index + 1] === "\n") index++;

      row.push(field);
      rows.push(row);
      row = [];
      field = "";

      if (rows.length >= 5_000) break;

      continue;
    }

    field += character;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return null;

  const columns = (rows[0] ?? []).map((column) => column.trim());
  const body = rows.slice(1).map((entry) => entry.map((cell) => cell.trim()));

  try {
    return dataValue({ columns, rows: body });
  } catch {
    return null;
  }
}

function structuredData(
  text: string,
  mimeType: string,
  extension: string,
): Value | null {
  if (
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    extension === "json"
  ) {
    try {
      return dataValue(JSON.parse(text));
    } catch {
      return null;
    }
  }

  if (mimeType === "text/csv" || extension === "csv") {
    return parseDelimited(text, ",");
  }

  if (mimeType === "text/tab-separated-values" || extension === "tsv") {
    return parseDelimited(text, "\t");
  }

  return null;
}

type ByteSource = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
};

function byteSource(thing: Thing, assets?: AssetStore): ByteSource | null {
  const data = thing.data;

  if (!isRecord(data)) return null;

  const filename =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : thingTitle(thing);
  const declaredMime =
    typeof data.mimeType === "string" && data.mimeType.trim()
      ? data.mimeType.trim().toLowerCase()
      : null;
  const assetId =
    typeof data.assetId === "string" && data.assetId.trim()
      ? data.assetId.trim()
      : null;

  if (assetId && assets) {
    const stored = assets.get(assetId);

    if (stored) {
      return {
        bytes: stored.bytes,
        mimeType: declaredMime || stored.mimeType.toLowerCase(),
        filename,
      };
    }
  }

  const src = typeof data.src === "string" ? data.src : null;

  if (src) {
    const parsed = parseDataUrl(src);

    if (parsed) {
      return {
        bytes: parsed.bytes,
        mimeType: declaredMime || parsed.mimeType.toLowerCase(),
        filename,
      };
    }
  }

  return null;
}

function formatSize(bytes: number): string {
  if (bytes < 1_024) return `${bytes} bytes`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;

  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function unavailableSummary(
  title: string,
  mimeType: string,
  size: number | null,
): string {
  const kind = mimeType || "binary";
  const details = size === null ? kind : `${kind}, ${formatSize(size)}`;

  return `${title} is an unreadable file (${details}). Its content could not be extracted automatically.`;
}

export function loadThingContent(
  thing: Thing,
  assets: AssetStore | undefined,
  maxCharacters: number,
): ThingContent {
  const source = byteSource(thing, assets);
  const title = thingTitle(thing);

  if (source) {
    const { bytes, mimeType, filename } = source;
    const extension = extensionOf(filename);

    if (isPdf(mimeType, extension)) {
      const text = extractPdfText(bytes);

      if (!text) {
        return {
          kind: "unavailable",
          summary: unavailableSummary(title, mimeType, bytes.byteLength),
        };
      }

      const clipped = clipText(text, maxCharacters);

      return {
        kind: "text",
        title,
        mimeType,
        text: clipped.text,
        textKind: "document",
        truncated: clipped.truncated,
        note: "The text was extracted from a PDF. Layout and non-text content may be missing.",
        knownData: null,
      };
    }

    if (isAudio(mimeType, extension)) {
      return {
        kind: "audio",
        title,
        mimeType,
        bytes,
        filename,
      };
    }

    if (isTextMime(mimeType) || TEXT_EXTENSIONS.has(extension)) {
      const limit = Math.min(
        8_000_000,
        Math.max(1_000_000, maxCharacters * 4),
      );
      const clippedBytes =
        bytes.byteLength > limit ? bytes.subarray(0, limit) : bytes;
      const decoded = decodeText(clippedBytes);
      const rawTruncated = clippedBytes.byteLength < bytes.byteLength;
      const clipped = clipText(decoded, maxCharacters);
      const markup =
        mimeType === "text/html" ||
        mimeType === "application/xhtml+xml" ||
        extension === "html" ||
        extension === "htm" ||
        mimeType === "image/svg+xml" ||
        extension === "svg";
      const text = markup ? stripMarkup(clipped.text) : clipped.text;
      const knownData = structuredData(
        decodeText(bytes.subarray(0, Math.min(bytes.byteLength, 8_000_000))),
        mimeType,
        extension,
      );
      const structured = knownData !== null;

      return {
        kind: "text",
        title,
        mimeType,
        text,
        textKind: structured ? "structured" : "plain",
        truncated: clipped.truncated || rawTruncated,
        note: structured
          ? "A deterministic machine-readable extraction was generated from this item."
          : markup
            ? "The text was extracted from markup; hidden or script content was removed."
            : null,
        knownData,
      };
    }

    if (isImage(mimeType, extension)) {
      return {
        kind: "image",
        title,
        mimeType,
        bytes,
      };
    }

    return {
      kind: "unavailable",
      summary: unavailableSummary(title, mimeType, bytes.byteLength),
    };
  }

  const data = thing.data;

  if (typeof data === "string" && data.trim()) {
    const clipped = clipText(data, maxCharacters);

    return {
      kind: "text",
      title,
      mimeType: "text/plain",
      text: clipped.text,
      textKind: "plain",
      truncated: clipped.truncated,
      note: null,
      knownData: null,
    };
  }

  if (isRecord(data)) {
    const text = typeof data.text === "string" ? data.text : null;

    if (text?.trim()) {
      const clipped = clipText(text, maxCharacters);

      return {
        kind: "text",
        title,
        mimeType: "text/plain",
        text: clipped.text,
        textKind: "plain",
        truncated: clipped.truncated,
        note: null,
        knownData: null,
      };
    }

    const serialized = JSON.stringify(data, null, 2);

    if (serialized && serialized !== "{}") {
      const clipped = clipText(serialized, maxCharacters);
      let knownData: Value | null = null;

      try {
        knownData = dataValue(data);
      } catch {
        knownData = null;
      }

      return {
        kind: "text",
        title,
        mimeType: "application/json",
        text: clipped.text,
        textKind: "structured",
        truncated: clipped.truncated,
        note: "A deterministic machine-readable extraction was generated from this item.",
        knownData,
      };
    }
  }

  return {
    kind: "unavailable",
    summary: `${title} is an empty ${thing.type} item.`,
  };
}