import type { Thing } from "../adapt/core/contracts.ts";

export type ImportDestination = {
  readonly parent: string | null;
  readonly label: string;
};

export type ImportStatus =
  | "queued"
  | "uploading"
  | "saving"
  | "complete"
  | "failed";

export type ImportContext = {
  readonly parent: string | null;
  readonly requestId: string;
  readonly signal: AbortSignal;
  readonly onProgress: (sent: number, total?: number) => void;
};

export type ImportFile = (file: File, context: ImportContext) => Promise<Thing>;

export type PendingImport = {
  readonly id: string;
  readonly requestId: string;
  readonly file: File;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly destination: ImportDestination;
  readonly origin: { readonly x: number; readonly y: number } | null;
  preview: string | null;
  status: ImportStatus;
  progress: number | null;
  error: string | null;
};

type ImportsOptions = {
  host: HTMLElement;
  canvas: HTMLCanvasElement;
  accept?: string;
  destination: () => ImportDestination;
  importFile: ImportFile;
  onChange: () => void;
  onComplete: (item: PendingImport, thing: Thing) => void;
  onDragChange: (destination: ImportDestination | null) => void;
};

const CONCURRENCY = 3;
const THUMBNAIL_BYTES = 1_500_000;
const THUMBNAIL_EDGE = 1024;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function createImports(options: ImportsOptions) {
  const items: PendingImport[] = [];
  const previewUrls = new Set<string>();
  const controllers = new Map<string, AbortController>();

  let active = 0;
  let destroyed = false;
  let pickerDestination: ImportDestination | null = null;
  let dragDestination: ImportDestination | null = null;
  let dragDepth = 0;

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = options.accept ?? "";
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.style.display = "none";

  const live = document.createElement("div");
  // Keep announcements available to assistive technology without a visual layer.
  live.style.cssText =
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");

  options.host.append(input, live);

  function announce(message: string): void {
    if (destroyed) return;
    live.textContent = message;
  }

  function previewFor(file: File): string | null {
    if (!file.type.startsWith("image/")) return null;

    try {
      const url = URL.createObjectURL(file);
      previewUrls.add(url);
      return url;
    } catch {
      return null;
    }
  }

  function releasePreview(preview: string | null, revoke: boolean): void {
    if (!preview) return;

    previewUrls.delete(preview);

    if (revoke) URL.revokeObjectURL(preview);
  }

  function referencesPreview(thing: Thing, preview: string | null): boolean {
    if (!preview) return false;

    const data = thing.data;

    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "src" in data &&
      data.src === preview
    );
  }

  async function thumbnail(item: PendingImport): Promise<void> {
    const original = item.preview;

    if (!original || item.file.size <= THUMBNAIL_BYTES) return;

    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await createImageBitmap(item.file);

      const edge = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, THUMBNAIL_EDGE / Math.max(1, edge));

      if (
        scale >= 1 ||
        destroyed ||
        !items.includes(item) ||
        item.preview !== original
      )
        return;

      const surface = document.createElement("canvas");
      surface.width = Math.max(1, Math.round(bitmap.width * scale));
      surface.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = surface.getContext("2d");
      if (!context) return;

      context.drawImage(bitmap, 0, 0, surface.width, surface.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        surface.toBlob(resolve, "image/jpeg", 0.84),
      );

      if (
        !blob ||
        destroyed ||
        !items.includes(item) ||
        item.preview !== original
      )
        return;

      const preview = URL.createObjectURL(blob);
      previewUrls.add(preview);
      item.preview = preview;
      releasePreview(original, true);
      options.onChange();
    } catch {
      // The original object URL remains a usable preview.
    } finally {
      bitmap?.close();
    }
  }

  function enqueue(
    files: readonly File[],
    destination: ImportDestination,
    origin: { x: number; y: number } | null,
  ): void {
    for (const file of files) {
      const id = crypto.randomUUID();

      const item: PendingImport = {
        id,
        requestId: id,
        file,
        name: file.name || "Untitled",
        type: file.type || "Unknown file",
        size: file.size,
        destination,
        origin,
        preview: previewFor(file),
        status: "queued",
        progress: null,
        error: null,
      };

      items.push(item);
      void thumbnail(item);
    }

    announce(
      files.length === 1
        ? `Adding ${files[0]!.name} to ${destination.label}.`
        : `Adding ${files.length} files to ${destination.label}.`,
    );

    options.onChange();
    startNext();
  }

  function startNext(): void {
    if (destroyed) return;

    while (active < CONCURRENCY) {
      const item = items.find((candidate) => candidate.status === "queued");

      if (!item) return;

      active++;
      void run(item);
    }
  }

  async function run(item: PendingImport): Promise<void> {
    const controller = new AbortController();
    controllers.set(item.id, controller);
    item.status = "uploading";
    item.progress = null;
    item.error = null;
    options.onChange();

    try {
      const thing = await options.importFile(item.file, {
        parent: item.destination.parent,
        requestId: item.requestId,
        signal: controller.signal,
        onProgress(sent, total) {
          if (destroyed) return;

          item.progress =
            total !== undefined && total > 0
              ? clamp(sent / total, 0, 1)
              : null;

          if (total !== undefined && total > 0 && sent >= total)
            item.status = "saving";

          options.onChange();
        },
      });

      if (destroyed || controller.signal.aborted) return;

      item.status = "complete";
      item.progress = 1;

      const keepPreview = referencesPreview(thing, item.preview);

      options.onComplete(item, thing);
      announce(`${item.name} added.`);
      removeItem(item, !keepPreview);
    } catch (error) {
      if (destroyed) return;

      if (controller.signal.aborted) {
        if (items.includes(item)) removeItem(item, true);
        return;
      }

      item.status = "failed";
      item.error =
        error instanceof Error ? error.message : "Could not add this file.";
      item.progress = null;
      announce(
        `${item.name} could not be added. ${item.error} Retry or remove it.`,
      );
    } finally {
      controllers.delete(item.id);
      active = Math.max(0, active - 1);

      if (!destroyed) {
        options.onChange();
        startNext();
      }
    }
  }

  function removeItem(item: PendingImport, revokePreview: boolean): void {
    const index = items.indexOf(item);

    if (index >= 0) items.splice(index, 1);

    controllers.get(item.id)?.abort();
    controllers.delete(item.id);
    releasePreview(item.preview, revokePreview);
    options.onChange();
  }

  function openPicker(): void {
    if (destroyed) return;

    pickerDestination = options.destination();
    input.value = "";

    try {
      input.click();
    } catch {
      pickerDestination = null;
      announce("The file picker could not open.");
    }
  }

  function onFilesChosen(): void {
    const files = Array.from(input.files ?? []);
    const destination = pickerDestination;

    input.value = "";
    pickerDestination = null;

    if (!files.length || !destination) return;

    enqueue(files, destination, null);
  }

  function hasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;

    if (!types) return false;

    for (let index = 0; index < types.length; index++)
      if (types[index] === "Files") return true;

    return false;
  }

  function insideCanvas(event: DragEvent): boolean {
    const rect = options.canvas.getBoundingClientRect();

    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  function setDestination(next: ImportDestination | null): void {
    if (
      dragDestination?.parent === next?.parent &&
      dragDestination?.label === next?.label
    )
      return;

    dragDestination = next;
    options.onDragChange(next);

    if (next) announce(`Drop to add to ${next.label}.`);
  }

  function clearDrag(): void {
    dragDepth = 0;
    setDestination(null);
  }

  function onDragEnter(event: DragEvent): void {
    if (!hasFiles(event) || !insideCanvas(event)) return;

    event.preventDefault();
    dragDepth++;
    setDestination(options.destination());
  }

  function onDragOver(event: DragEvent): void {
    if (!hasFiles(event) || !insideCanvas(event)) return;

    event.preventDefault();

    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";

    if (!dragDestination) dragDepth = Math.max(1, dragDepth);
    setDestination(options.destination());
  }

  function onDragLeave(event: DragEvent): void {
    if (!dragDestination) return;

    dragDepth = Math.max(0, dragDepth - 1);

    if (dragDepth === 0 || !insideCanvas(event)) clearDrag();
  }

  function onDrop(event: DragEvent): void {
    if (!insideCanvas(event)) return;

    const files = Array.from(event.dataTransfer?.files ?? []);

    if (!files.length && !hasFiles(event)) return;

    event.preventDefault();

    const destination = options.destination();
    const origin = { x: event.clientX, y: event.clientY };

    clearDrag();

    if (files.length) enqueue(files, destination, origin);
  }

  function onDragEnd(): void {
    clearDrag();
  }

  input.addEventListener("change", onFilesChosen);
  window.addEventListener("dragenter", onDragEnter, true);
  window.addEventListener("dragover", onDragOver, true);
  window.addEventListener("dragleave", onDragLeave, true);
  window.addEventListener("drop", onDrop, true);
  window.addEventListener("dragend", onDragEnd, true);

  return {
    items: items as readonly PendingImport[],

    openPicker,

    retry(item: PendingImport): void {
      if (destroyed || item.status !== "failed" || !items.includes(item))
        return;

      item.status = "queued";
      item.progress = null;
      item.error = null;
      announce(`Retrying ${item.name}.`);
      options.onChange();
      startNext();
    },

    remove(item: PendingImport): void {
      if (destroyed) return;

      if (!items.includes(item)) return;

      announce(`${item.name} removed.`);
      removeItem(item, true);
    },

    destroy(): void {
      if (destroyed) return;

      destroyed = true;

      input.removeEventListener("change", onFilesChosen);
      window.removeEventListener("dragenter", onDragEnter, true);
      window.removeEventListener("dragover", onDragOver, true);
      window.removeEventListener("dragleave", onDragLeave, true);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("dragend", onDragEnd, true);

      for (const controller of controllers.values()) controller.abort();
      controllers.clear();

      for (const preview of previewUrls) URL.revokeObjectURL(preview);
      previewUrls.clear();
      items.length = 0;

      input.remove();
      live.remove();
    },
  };
}