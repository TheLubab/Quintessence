import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const BASE_URL = "https://api.meta.ai/v1";
const CHAT_MODEL = "muse-spark-1.3";
const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const IMAGE_MODEL = "muse-image-1.0";

export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image_url";
      readonly image_url: {
        readonly url: string;
        readonly detail?: "auto" | "low" | "high";
      };
    };

export type ChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string | readonly ChatContentPart[];
};

export type JsonSchema = {
  readonly name: string;
  readonly schema: Record<string, unknown>;
};

export type CompletionOptions = {
  readonly signal: AbortSignal;
  readonly schema?: JsonSchema;
  readonly webSearch?: boolean;
};

export type ImageResult = {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
};

export type MetaModel = {
  readonly id: string;

  complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ): Promise<string>;

  transcribe(bytes: Uint8Array, signal: AbortSignal): Promise<string>;

  generateImage(prompt: string, signal: AbortSignal): Promise<ImageResult>;
};

export class ProviderError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);

    this.name = "ProviderError";
    this.status = status;
  }
}

function endpoint(path: string): string {
  return `${BASE_URL}/${path.replace(/^\/+/, "")}`;
}

function preview(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

function requestSignal(
  signal: AbortSignal,
  timeoutMs: number,
): {
  signal: AbortSignal;
  controller: AbortController;
  release(): void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
  }

  const timer = setTimeout(() => {
    controller.abort(new Error("Model request timed out"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    controller,
    release() {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    },
  };
}

async function request(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: string }> {
  const gate = requestSignal(signal, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: gate.signal });
    const body = await response.text();

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    if (gate.controller.signal.aborted && !signal.aborted) {
      throw new ProviderError("Model request timed out", 504);
    }

    throw error;
  } finally {
    gate.release();
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;

  if (!Array.isArray(content)) return "";

  return content
    .map((part: unknown) => {
      if (typeof part === "string") return part;

      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";

  for (let index = offset; index < offset + length; index++) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }

  return value;
}

function wavFormat(bytes: Uint8Array): {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
} | null {
  if (bytes.byteLength < 44) return null;
  if (readAscii(bytes, 0, 4) !== "RIFF") return null;
  if (readAscii(bytes, 8, 4) !== "WAVE") return null;

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;

    if (id === "fmt " && size >= 16 && start + 16 <= bytes.byteLength) {
      return {
        audioFormat: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bitsPerSample: view.getUint16(start + 14, true),
      };
    }

    offset = start + size + (size % 2);
  }

  return null;
}

function isSupportedWav(bytes: Uint8Array): boolean {
  const format = wavFormat(bytes);

  return (
    format !== null &&
    format.audioFormat === 1 &&
    format.channels === 1 &&
    format.bitsPerSample === 16 &&
    (format.sampleRate === 16_000 || format.sampleRate === 24_000)
  );
}

function ffmpegExecutable(): string {
  const configured = process.env.FFMPEG_PATH?.trim();

  if (configured) return configured;

  try {
    const nodeRequire = createRequire(import.meta.url);
    const installed = nodeRequire("@ffmpeg-installer/ffmpeg") as {
      path?: unknown;
    };

    if (typeof installed.path === "string" && installed.path) {
      return installed.path;
    }
  } catch {
    return "ffmpeg";
  }

  return "ffmpeg";
}

function transcode(bytes: Uint8Array, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const executable = ffmpegExecutable();
    const child = spawn(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    const output: Buffer[] = [];
    let errors = "";
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", abort);
    };

    const fail = (error: unknown) => {
      if (settled) return;

      settled = true;
      cleanup();
      reject(error);
    };

    const abort = () => {
      child.kill("SIGKILL");
      fail(abortError(signal));
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      fail(
        error.code === "ENOENT"
          ? new ProviderError(
              "ffmpeg is required to prepare this audio for transcription",
              501,
            )
          : error,
      );
    });

    child.stdout.on("data", (chunk: Buffer) => {
      output.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString("utf8");

      if (errors.length > 4_000) errors = errors.slice(0, 4_000);
    });

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, { once: true });

    child.stdin.on("error", () => undefined);
    child.stdin.end(Buffer.from(bytes));

    child.on("close", (code) => {
      if (settled) return;

      if (code !== 0) {
        fail(
          new ProviderError(
            `Audio conversion failed: ${preview(errors)}`,
            502,
          ),
        );
        return;
      }

      const value = Buffer.concat(output);

      if (value.length === 0) {
        fail(
          new ProviderError("Audio conversion produced no output", 502),
        );
        return;
      }

      settled = true;
      cleanup();
      resolve(new Uint8Array(value));
    });
  });
}

async function transcribeWav(
  bytes: Uint8Array,
  signal: AbortSignal,
  timeoutMs: number,
  key: string,
): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  const form = new FormData();
  form.append(
    "request",
    new Blob([
      JSON.stringify({
        mode: "ENDPOINTING",
        model: TRANSCRIBE_MODEL,
        audioEncoding: "WAV",
      }),
    ], { type: "application/json" }),
  );
  form.append(
    "audio",
    new Blob([copy.buffer], { type: "audio/wav" }),
    "audio.wav",
  );

  const result = await request(
    endpoint(`asr/transcribe?sessionId=${randomUUID()}`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: form,
    },
    signal,
    timeoutMs,
  );

  if (!result.ok) {
    throw new ProviderError(
      `Transcription failed (${result.status}): ${preview(result.body)}`,
      result.status,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(result.body);
  } catch {
    throw new ProviderError("The transcription returned an invalid response");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ProviderError("The transcription returned no text");
  }

  const record = parsed as Record<string, unknown>;
  let text =
    typeof record.transcript === "string" ? record.transcript.trim() : "";

  if (!text && Array.isArray(record.turns)) {
    text = record.turns
      .map((turn: unknown) => {
        if (
          typeof turn === "object" &&
          turn !== null &&
          "transcript" in turn &&
          typeof turn.transcript === "string"
        ) {
          return turn.transcript.trim();
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (!text) {
    throw new ProviderError("The transcription was empty");
  }

  return text;
}

export function createMetaModel(options: {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}): MetaModel {
  const apiKey = options.apiKey;
  const model = options.model?.trim() || CHAT_MODEL;
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 180_000);

  async function responseCompletion(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ): Promise<string> {
    const instructions = messages
      .filter((message) => message.role === "system")
      .map((message) => messageText(message.content))
      .filter(Boolean)
      .join("\n\n");
    const input = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: [{
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: messageText(message.content),
        }],
      }));

    const result = await request(
      endpoint("responses"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input,
          store: false,
          reasoning: { effort: "medium" },
          tools: [{ type: "web_search" }],
          ...(instructions ? { instructions } : {}),
          ...(options.schema
            ? {
                text: {
                  format: {
                    type: "json_schema",
                    name: options.schema.name,
                    schema: options.schema.schema,
                  },
                },
              }
            : {}),
        }),
      },
      options.signal,
      timeoutMs,
    );

    if (!result.ok) {
      throw new ProviderError(
        `Meta search request failed (${result.status}): ${preview(result.body)}`,
        result.status,
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(result.body);
    } catch {
      throw new ProviderError("The search response was invalid");
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("output" in payload) ||
      !Array.isArray(payload.output)
    ) {
      throw new ProviderError("The search response contained no output");
    }

    const pieces: string[] = [];

    for (const item of payload.output) {
      if (
        typeof item !== "object" ||
        item === null ||
        !("type" in item) ||
        item.type !== "message" ||
        ("phase" in item && item.phase === "commentary") ||
        !("content" in item) ||
        !Array.isArray(item.content)
      ) {
        continue;
      }

      for (const part of item.content) {
        if (
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "output_text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          pieces.push(part.text);
        }
      }
    }

    const text = pieces.join("").trim();

    if (!text) {
      throw new ProviderError("The search response contained no text");
    }

    return text;
  }

  async function complete(
    messages: readonly ChatMessage[],
    options: CompletionOptions,
  ): Promise<string> {
    if (options.webSearch) {
      return responseCompletion(messages, options);
    }

    const result = await request(
      endpoint("chat/completions"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: 0,
          ...(options.schema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: options.schema.name,
                    schema: options.schema.schema,
                  },
                },
              }
            : {}),
        }),
      },
      options.signal,
      timeoutMs,
    );

    if (!result.ok) {
      throw new ProviderError(
        `Meta model request failed (${result.status}): ${preview(result.body)}`,
        result.status,
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(result.body);
    } catch {
      throw new ProviderError("The model returned an invalid response");
    }

    const choices =
      typeof payload === "object" && payload !== null && "choices" in payload
        ? payload.choices
        : null;

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ProviderError("The model returned no content");
    }

    const first = choices[0];

    const content =
      typeof first === "object" &&
      first !== null &&
      "message" in first &&
      typeof first.message === "object" &&
      first.message !== null &&
      "content" in first.message
        ? first.message.content
        : null;

    const value = messageText(content);

    if (!value.trim()) {
      throw new ProviderError("The model returned empty content");
    }

    return value;
  }

  async function transcribe(
    bytes: Uint8Array,
    signal: AbortSignal,
  ): Promise<string> {
    const wav = isSupportedWav(bytes) ? bytes : await transcode(bytes, signal);

    return transcribeWav(wav, signal, timeoutMs, apiKey);
  }

  async function generateImage(
    prompt: string,
    signal: AbortSignal,
  ): Promise<ImageResult> {
    const value = prompt.trim();

    if (!value) {
      throw new ProviderError("The image prompt was empty", 400);
    }

    const result = await request(
      endpoint("images/generations"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt: value,
          n: 1,
          size: "1536x1024",
          response_format: "b64_json",
          output_format: "webp",
          reasoning_strength: "low",
        }),
      },
      signal,
      timeoutMs,
    );

    if (!result.ok) {
      throw new ProviderError(
        `Image generation failed (${result.status}): ${preview(result.body)}`,
        result.status,
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(result.body);
    } catch {
      throw new ProviderError("The image response was invalid");
    }

    const data =
      typeof payload === "object" &&
      payload !== null &&
      "data" in payload &&
      Array.isArray(payload.data)
        ? payload.data
        : null;
    const first = data?.[0];

    if (
      typeof first !== "object" ||
      first === null ||
      !("b64_json" in first) ||
      typeof first.b64_json !== "string"
    ) {
      throw new ProviderError("The image response contained no image");
    }

    const bytes = new Uint8Array(Buffer.from(first.b64_json, "base64"));

    if (bytes.byteLength === 0) {
      throw new ProviderError("The generated image was empty");
    }

    return {
      bytes,
      mimeType: "image/webp",
    };
  }

  return {
    id: model,
    complete,
    transcribe,
    generateImage,
  };
}

export function metaFromEnvironment(
  env: Record<string, string | undefined>,
): MetaModel | null {
  const apiKey = env.MODEL_API_KEY?.trim();

  if (!apiKey) return null;

  const timeout = Number(env.MODEL_TIMEOUT_MS);

  return createMetaModel({
    apiKey,
    timeoutMs:
      Number.isFinite(timeout) && timeout >= 1_000 ? timeout : 180_000,
  });
}
