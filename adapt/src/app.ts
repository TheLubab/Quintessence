import { createSession, type Thing } from "$adapt";
import { sessionTypes, MAX_FILE_BYTES } from "$adapt/catalog";
import { connect } from "$adapt/client";
import {
  canvasView,
  createWidgetRuntime,
  type ImportFile,
} from "$adapt-canvas";

import { createNotice } from "./notice";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
if (!canvas) throw new Error("Missing #canvas");

const adapt = connect({ endpoint: "/api/adapt" });

const existing = (await adapt.spaces.list({ limit: 1 })).items[0];

const space = existing
  ? await adapt.spaces.open(existing.id)
  : await adapt.spaces.create({ title: "Adapt" });

const session = createSession(space, { types: sessionTypes });

const importFile: ImportFile = async (file, context): Promise<Thing> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Files must be 50 MB or smaller.");
  }

  if (context.signal.aborted) throw new Error("Import cancelled.");

  // Persist file bytes with the record; object URLs are only for previews.
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    context.signal.addEventListener("abort", abort, { once: true });
    reader.onloadend = () =>
      context.signal.removeEventListener("abort", abort);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read file."));
    reader.onabort = () => reject(new Error("Import cancelled."));
    reader.readAsDataURL(file);
  });

  if (context.signal.aborted) throw new Error("Import cancelled.");

  const type = file.type.startsWith("image/") ? "image" : "file";
  const data = {
    title: file.name,
    src,
    assetId: context.requestId,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };

  const id = await space.add({
    type,
    parent: context.parent,
    requestId: context.requestId,
    data,
  });

  context.onProgress(file.size, file.size);

  return { id, type, parent: context.parent, data };
};

function titleForText(text: string): string {
  const first = text.trim().split(/\r?\n/)[0]?.trim() ?? "";
  const base = first ? first.slice(0, 48) : "Note";
  return base.toLowerCase().endsWith(".txt") ? base : `${base}.txt`;
}

function thingTitle(thing: Thing): string {
  const data = thing.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    if ("title" in data && typeof data.title === "string") return data.title;
    if ("text" in data && typeof data.text === "string") return data.text;
  }
  return thing.type;
}

function groupTitle(target: Thing): string {
  const base = thingTitle(target).replace(/\.[^.]+$/, "").trim();
  return (base ? `${base} group` : "New group").slice(0, 80);
}

async function submitDraft(input: {
  text: string;
  submit: boolean;
  parent: string | null;
}): Promise<void> {
  try {
    const text = input.text.trim();
    if (!text) return;

    const data = {
      title: titleForText(text),
      src: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
      assetId: crypto.randomUUID(),
      mimeType: "text/plain",
      size: new TextEncoder().encode(text).byteLength,
    };

    await space.add({
      type: "file",
      parent: input.parent,
      data,
    });

    await session.refresh();
  } catch (error) {
    notice.set(
      error instanceof Error ? error.message : "Could not add this text file.",
    );
  }
}

const notice = createNotice();

const widgetRuntime = createWidgetRuntime({
  enrichment: (id) => space.enrichment(id),
  ai: (thing) => space.widgets(thing.id),
  contextKey(thing) {
    const snapshot = session.snapshot();

    if (snapshot.focus?.id !== thing.id) return "";

    return snapshot.children
      .map((child) => `${child.id}:${JSON.stringify(child.data)}`)
      .join("|");
  },
  async update(thing, data) {
    await space.update(thing.id, { data });

    const updated = (await space.get(thing.id)) ?? { ...thing, data };

    session.integrate(updated);
    return updated;
  },
  focus(id) {
    try {
      session.focus(id);
    } catch {
      return;
    }
  },
  onError(error) {
    notice.set(
      error instanceof Error ? error.message : "Widgets could not be generated.",
    );
  },
});

function debugEnrichment(): void {
  const focus = session.snapshot().focus;

  if (!focus) {
    console.log(null);
    return;
  }

  void space.enrichment(focus.id).then(
    (enrichment) => console.log(enrichment),
    (error: unknown) => {
      console.error("Could not load enrichment", error);
      notice.set("Could not load enrichment.");
    },
  );
}

let view: ReturnType<typeof canvasView>;
view = canvasView({
  canvas,
  session,
  backgroundImage: "/bg.jpg",
  backgroundBlur: 48,
  importFile,
  widgets: widgetRuntime,
  onDebug: debugEnrichment,
  async onCommand({ text, thing }) {
    notice.set("Thinking…");

    try {
      const result = await space.command(thing.id, text);

      session.integrate(result.thing);
      await session.refresh();
      notice.set(result.reply);
    } catch (error) {
      notice.set(
        error instanceof Error
          ? error.message
          : "The assistant could not do that.",
      );
    }
  },
  async onMakeThing({ thing, widget }) {
    if (
      widget.kind !== "visual" ||
      !widget.src ||
      !widget.assetId
    ) {
      return;
    }

    try {
      const parent = session.contains(thing) ? thing.id : thing.parent;
      const title = widget.caption || widget.title || "Generated image";
      const data = {
        assetId: widget.assetId,
        src: widget.src,
        title,
      };

      await space.add({
        type: "image",
        parent,
        data,
      });

      if (
        typeof thing.data === "object" &&
        thing.data !== null &&
        !Array.isArray(thing.data)
      ) {
        const source = thing.data as Record<string, unknown>;
        const visual = source.visual;
        const matches =
          typeof visual === "object" &&
          visual !== null &&
          !Array.isArray(visual) &&
          ((visual as Record<string, unknown>).assetId === widget.assetId ||
            (visual as Record<string, unknown>).src === widget.src);
        const next = { ...source };

        if (matches) delete next.visual;

        next._visualMade = true;

        await space.update(thing.id, { data: next as Thing["data"] });

        const updated = await space.get(thing.id);

        if (updated) session.integrate(updated);
      }

      widgetRuntime.dismiss(thing, widget.id);
      await session.refresh();
      notice.set("Made a thing.");
    } catch (error) {
      notice.set(
        error instanceof Error ? error.message : "Could not make a thing.",
      );
    }
  },
  onTextDraft(input) {
    void submitDraft(input);
  },
  async onDelete(thing) {
    await space.remove(thing.id, { recursive: true });
    await session.refresh();
  },
  async onDropThing({ thing, target, kind }) {
    try {
      if (kind === "move") {
        await space.move(thing.id, { parent: target.id });
        session.integrate({ ...thing, parent: target.id });
        await session.refreshListing(target.id);
      } else {
        const data = { title: groupTitle(target) };
        const group = await space.add({
          type: "collection",
          parent: target.parent,
          data,
        });
        session.integrate({
          id: group,
          type: "collection",
          parent: target.parent,
          data,
        });
        await space.move(target.id, { parent: group });
        session.integrate({ ...target, parent: group });
        await space.move(thing.id, { parent: group });
        session.integrate({ ...thing, parent: group });
      }
    } finally {
      await session.refresh();
    }
  },
  async onMoveOut({ thing, parent }) {
    try {
      await space.move(thing.id, { parent });
      session.integrate({ ...thing, parent });
      await session.refreshListing(parent);
    } finally {
      await session.refresh();
    }
  },
});

const seenFailedOperations = new Set<string>();
const seenOperationErrors = new Set<string>();
const unsubscribeFailures = session.subscribe(() => {
  const snapshot = session.snapshot();

  for (const operation of snapshot.operations) {
    if (operation.status !== "failed") continue;
    if (seenFailedOperations.has(operation.id)) continue;
    seenFailedOperations.add(operation.id);
    notice.set(
      operation.error.message || "The operation could not be completed.",
    );
  }

  for (const error of snapshot.operationErrors) {
    if (seenOperationErrors.has(error.id)) continue;
    seenOperationErrors.add(error.id);
    notice.set(error.message);
  }
});

await session.refresh();

let cleaned = false;

function cleanup(): void {
  if (cleaned) return;

  cleaned = true;
  view.destroy();
  widgetRuntime.destroy();
  notice.destroy();
  unsubscribeFailures();
  session.destroy();
  adapt.close();
}

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) cleanup();
});