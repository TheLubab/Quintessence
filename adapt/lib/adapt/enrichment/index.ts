import type { Space, Thing, Value } from "../core/contracts.ts";

import type { AssetStore } from "../assets/filesystem/index.ts";

import type { Enrichment, EnrichmentStore } from "./contracts.ts";
import type { MetaModel } from "./meta.ts";

import {
  analyzeCollection,
  analyzeItem,
  type CollectionMember,
} from "./analysis.ts";
import {
  clipText,
  loadThingContent,
  thingTitle,
  type ThingContent,
} from "./content.ts";
import { ProviderError } from "./meta.ts";

const MAX_IMAGE_BYTES = 20_000_000;
const MAX_AUDIO_BYTES = 25_000_000;
const MAX_COLLECTION_MEMBERS = 1_000;

export type ScheduleInput = {
  readonly scope: string;
  readonly space: Space;
  readonly thingId: string;
};

export type EnrichmentService = {
  schedule(input: ScheduleInput): void;

  get(scope: string, spaceId: string, thingId: string): Enrichment | null;

  remove(scope: string, spaceId: string, thingId: string): void;

  close(): Promise<void>;
};

export type EnrichmentOptions = {
  readonly store: EnrichmentStore;
  readonly assets?: AssetStore;
  readonly model?: MetaModel | null;
  readonly containerTypes: readonly string[];
  readonly concurrency?: number;
  readonly maxTextCharacters?: number;
  readonly onError?: (error: unknown) => void;
};

type Job = {
  readonly key: string;
  readonly scope: string;
  readonly space: Space;
  readonly thingId: string;
  pending: boolean;
  queued: boolean;
  running: boolean;
};

type Outcome = {
  readonly status: "ready" | "skipped";
  readonly summary: string;
  readonly description: string | null;
  readonly text: string | null;
  readonly data: Value | null;
  readonly model: string | null;
};

export function createEnrichment(
  options: EnrichmentOptions,
): EnrichmentService {
  const store = options.store;
  const assets = options.assets;
  const model = options.model ?? null;
  const containers = new Set(options.containerTypes);
  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? 2),
  );
  const maxTextCharacters = Math.max(
    4_000,
    Math.floor(options.maxTextCharacters ?? 120_000),
  );
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  const controllers = new Set<AbortController>();
  const tasks = new Set<Promise<void>>();

  let running = 0;
  let closed = false;

  try {
    store.interruptRunning?.(
      Date.now(),
      "The server restarted before this enrichment finished.",
    );
  } catch (error) {
    report(error);
  }

  function report(error: unknown): void {
    try {
      options.onError?.(error);
    } catch {
      return;
    }
  }

  function read(
    scope: string,
    spaceId: string,
    thingId: string,
  ): Enrichment | undefined {
    try {
      return store.get(scope, spaceId, thingId);
    } catch (error) {
      report(error);
      return undefined;
    }
  }

  function write(scope: string, spaceId: string, value: Enrichment): void {
    try {
      store.put(scope, spaceId, value);
    } catch (error) {
      report(error);
    }
  }

  function base(
    thingId: string,
    previous: Enrichment | undefined,
  ): Enrichment {
    return (
      previous ?? {
        thingId,
        status: "queued",
        summary: null,
        description: null,
        text: null,
        data: null,
        model: model?.id ?? null,
        error: null,
        updatedAt: Date.now(),
      }
    );
  }

  function queued(
    scope: string,
    spaceId: string,
    thingId: string,
    previous: Enrichment | undefined,
  ): void {
    write(scope, spaceId, {
      ...base(thingId, previous),
      status: "queued",
      error: null,
      model: previous?.model ?? model?.id ?? null,
      updatedAt: Date.now(),
    });
  }

  function enqueue(job: Job): void {
    if (closed) return;

    job.queued = true;
    queue.push(job);
    pump();
  }

  function schedule(input: ScheduleInput): void {
    if (closed) return;

    const key = JSON.stringify([input.scope, input.space.id, input.thingId]);
    const previous = read(input.scope, input.space.id, input.thingId);
    let job = jobs.get(key);

    queued(input.scope, input.space.id, input.thingId, previous);

    if (job) {
      job.pending = true;

      if (!job.running && !job.queued) enqueue(job);

      return;
    }

    job = {
      key,
      scope: input.scope,
      space: input.space,
      thingId: input.thingId,
      pending: false,
      queued: false,
      running: false,
    };

    jobs.set(key, job);
    enqueue(job);
  }

  function pump(): void {
    while (!closed && running < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      job.queued = false;
      job.running = true;
      running++;

      const task = (async () => {
        try {
          await run(job);
        } catch (error) {
          report(error);
        } finally {
          running--;
          job.running = false;

          if (!closed && job.pending) {
            job.pending = false;
            enqueue(job);
          } else if (!job.pending) {
            jobs.delete(job.key);
          }

          pump();
        }
      })();

      tasks.add(task);
      void task.then(() => {
        tasks.delete(task);
      });
    }
  }

  async function run(job: Job): Promise<void> {
    job.pending = false;

    const previous = read(job.scope, job.space.id, job.thingId);
    let thing: Thing | undefined;

    try {
      thing = await job.space.get(job.thingId);
    } catch (error) {
      failure(job, previous, error);
      return;
    }

    if (!thing) {
      try {
        store.remove(job.scope, job.space.id, job.thingId);
      } catch (error) {
        report(error);
      }

      return;
    }

    if (closed) return;

    write(job.scope, job.space.id, {
      ...base(job.thingId, previous),
      status: "running",
      error: null,
      model: previous?.model ?? model?.id ?? null,
      updatedAt: Date.now(),
    });

    const controller = new AbortController();
    controllers.add(controller);

    if (closed) controller.abort();

    try {
      const outcome = containers.has(thing.type)
        ? await containerOutcome(job, thing, controller.signal)
        : await itemOutcome(thing, controller.signal);

      if (closed) return;

      write(job.scope, job.space.id, {
        thingId: job.thingId,
        status: outcome.status,
        summary: outcome.summary,
        description: outcome.description,
        text: outcome.text,
        data: outcome.data,
        model: outcome.model,
        error: null,
        updatedAt: Date.now(),
      });

      await parent(job, thing);
    } catch (error) {
      failure(job, previous, error);
    } finally {
      controllers.delete(controller);
    }
  }

  function failure(
    job: Job,
    previous: Enrichment | undefined,
    error: unknown,
  ): void {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "The item could not be enriched";

    write(job.scope, job.space.id, {
      ...base(job.thingId, previous),
      status: "failed",
      model: previous?.model ?? model?.id ?? null,
      error: {
        code:
          error instanceof ProviderError
            ? "MODEL_ERROR"
            : error instanceof Error && error.name === "AbortError"
              ? "CANCELLED"
              : "ENRICHMENT_FAILED",
        message: message.slice(0, 500),
      },
      updatedAt: Date.now(),
    });
  }

  async function parent(job: Job, thing: Thing): Promise<void> {
    if (!thing.parent) return;

    try {
      const parentThing = await job.space.get(thing.parent);

      if (parentThing && containers.has(parentThing.type)) {
        schedule({
          scope: job.scope,
          space: job.space,
          thingId: parentThing.id,
        });
      }
    } catch (error) {
      report(error);
    }
  }

  function localSummary(content: ThingContent): string {
    if (content.kind === "text") {
      const preview = content.text.replace(/\s+/g, " ").trim().slice(0, 160);
      const kind = content.textKind === "structured" ? "structured" : "text";

      return (
        `${content.title} is a ${kind} item. ${preview}`.trim().slice(0, 240)
      );
    }

    if (content.kind === "image") {
      return `${content.title} is an image file.`.slice(0, 240);
    }

    if (content.kind === "audio") {
      return `${content.title} is an audio file.`.slice(0, 240);
    }

    return content.summary;
  }

  async function itemOutcome(
    thing: Thing,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const content = loadThingContent(thing, assets, maxTextCharacters);

    if (content.kind === "unavailable") {
      return {
        status: "skipped",
        summary: content.summary,
        description: null,
        text: null,
        data: null,
        model: null,
      };
    }

    if (!model) {
      return {
        status: "skipped",
        summary: localSummary(content),
        description: null,
        text: null,
        data: null,
        model: null,
      };
    }

    if (content.kind === "image") {
      if (content.bytes.byteLength > MAX_IMAGE_BYTES) {
        return {
          status: "skipped",
          summary: `${content.title} is an image larger than the analysis limit.`,
          description: null,
          text: null,
          data: null,
          model: null,
        };
      }

      const result = await analyzeItem(
        model,
        {
          kind: "image",
          title: content.title,
          mimeType: content.mimeType,
          bytes: content.bytes,
        },
        signal,
      );

      return {
        status: "ready",
        summary: result.summary,
        description: result.description,
        text: result.text,
        data: result.data,
        model: model.id,
      };
    }

    if (content.kind === "audio") {
      if (content.bytes.byteLength > MAX_AUDIO_BYTES) {
        return {
          status: "skipped",
          summary: `${content.title} is an audio file larger than the transcription limit.`,
          description: null,
          text: null,
          data: null,
          model: null,
        };
      }

      const transcript = await model.transcribe(content.bytes, signal);
      const promptText = clipText(transcript, maxTextCharacters);
      const stored = clipText(transcript, 2_000_000);
      const result = await analyzeItem(
        model,
        {
          kind: "text",
          title: content.title,
          mimeType: content.mimeType,
          text: promptText.text,
          truncated: promptText.truncated,
          note: "This is a transcript of an audio file. The transcript is stored separately.",
          hasKnownData: false,
          extraction: "audio-transcript",
        },
        signal,
      );

      return {
        status: "ready",
        summary: result.summary,
        description: result.description,
        text: stored.text,
        data: result.data,
        model: model.id,
      };
    }

    const result = await analyzeItem(
      model,
      {
        kind: "text",
        title: content.title,
        mimeType: content.mimeType,
        text: content.text,
        truncated: content.truncated,
        note: content.note,
        hasKnownData: content.knownData !== null,
        extraction:
          content.textKind === "document"
            ? "pdf-text"
            : content.textKind === "structured"
              ? "structured-data"
              : null,
      },
      signal,
    );

    return {
      status: "ready",
      summary: result.summary,
      description: result.description,
      text:
        content.textKind === "document"
          ? content.text
          : result.text,
      data:
        content.knownData !== null
          ? content.knownData
          : result.data,
      model: model.id,
    };
  }

  async function listChildren(space: Space, parentId: string): Promise<Thing[]> {
    const items: Thing[] = [];
    let after: string | null = null;

    while (items.length < MAX_COLLECTION_MEMBERS) {
      const page = await space.list({
        parent: parentId,
        limit: 200,
        ...(after === null ? {} : { after }),
      });

      items.push(...page.items);

      if (page.next === null) break;

      after = page.next;
    }

    return items.slice(0, MAX_COLLECTION_MEMBERS);
  }

  function collectionSummary(
    title: string,
    members: readonly CollectionMember[],
  ): string {
    if (members.length === 0) {
      return `${title} is an empty collection.`;
    }

    const labels = members
      .slice(0, 6)
      .map((member) => member.title)
      .join(", ");
    const extra = members.length > 6 ? ", and more" : "";
    const suffix = `${labels}${extra}`;

    return `${title} is a collection of ${members.length} ${
      members.length === 1 ? "item" : "items"
    }: ${suffix}.`.slice(0, 240);
  }

  async function containerOutcome(
    job: Job,
    thing: Thing,
    signal: AbortSignal,
  ): Promise<Outcome> {
    const title = thingTitle(thing);
    const children = await listChildren(job.space, thing.id);
    const members: CollectionMember[] = children.map((child) => ({
      title: thingTitle(child),
      type: child.type,
      summary:
        read(job.scope, job.space.id, child.id)?.summary ?? null,
    }));

    if (members.length === 0) {
      return {
        status: "ready",
        summary: collectionSummary(title, members),
        description: null,
        text: null,
        data: null,
        model: null,
      };
    }

    if (!model) {
      return {
        status: "skipped",
        summary: collectionSummary(title, members),
        description: null,
        text: null,
        data: null,
        model: null,
      };
    }

    const summary = await analyzeCollection(
      model,
      { title, members },
      signal,
    );

    return {
      status: "ready",
      summary,
      description: null,
      text: null,
      data: null,
      model: model.id,
    };
  }

  return {
    schedule,

    get(scope, spaceId, thingId): Enrichment | null {
      return read(scope, spaceId, thingId) ?? null;
    },

    remove(scope, spaceId, thingId): void {
      try {
        store.remove(scope, spaceId, thingId);
      } catch (error) {
        report(error);
      }
    },

    async close(): Promise<void> {
      if (closed) return;

      closed = true;

      for (const controller of controllers) {
        controller.abort();
      }

      queue.length = 0;

      await Promise.allSettled([...tasks]);

      jobs.clear();
      controllers.clear();

      try {
        store.close?.();
      } catch (error) {
        report(error);
      }
    },
  };
}