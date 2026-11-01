import type { Thing, Value } from "../adapt/core/contracts.ts";
import type { Enrichment } from "../adapt/enrichment/contracts.ts";
import type {
  Widget,
  WidgetField,
} from "../adapt/widgets/contracts.ts";

export type {
  Widget,
  WidgetActionItem,
  WidgetActionKind,
  WidgetChartItem,
  WidgetChecklistItem,
  WidgetComparisonItem,
  WidgetField,
  WidgetHighlightItem,
  WidgetListItem,
  WidgetStepItem,
  WidgetTimelineItem,
  WidgetVisual,
} from "../adapt/widgets/contracts.ts";

export type WidgetContext = {
  readonly thing: Thing;
  readonly enrichment: Enrichment | null;
  readonly canEdit: boolean;
};

export type WidgetGenerator = {
  readonly id: string;
  generate(
    context: WidgetContext,
  ): readonly Widget[] | Promise<readonly Widget[]>;
};

export type WidgetRuntimeOptions = {
  enrichment?(thingId: string): Promise<Enrichment | null>;
  contextKey?(thing: Thing): string;
  update?(thing: Thing, data: Value): Promise<Thing | void>;
  focus?(thingId: string): void;
  editText?(
    field: WidgetField,
    thing: Thing,
  ): string | null | Promise<string | null>;
  ai?(
    thing: Thing,
    enrichment: Enrichment | null,
  ): Promise<readonly Widget[]>;
  generators?: readonly WidgetGenerator[];
  maxWidgets?: number;
  refreshMs?: number;
  onError?(error: unknown): void;
};

export type WidgetRuntime = {
  get(thing: Thing): readonly Widget[];
  load(thing: Thing): void;
  invoke(thing: Thing, widgetId: string, action: string): Promise<void>;
  dismiss(thing: Thing, widgetId: string): void;
  subscribe(listener: () => void): () => void;
  destroy(): void;
};

type Entry = {
  dataKey: string;
  contextKey: string;
  widgets: readonly Widget[];
  status: "loading" | "ready" | "error";
  request: number;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
};

type RecordValue = Record<string, unknown>;

const INTERNAL_KEYS = new Set(["assetId", "src"]);
const READ_ONLY_KEYS = new Set(["mimeType", "size"]);
const LABELS: Record<string, string> = {
  title: "Title",
  mimeType: "Format",
  size: "Size",
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(
  value: unknown,
): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key]!;

  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

function fieldFor(
  key: string,
  value: string | number | boolean,
  editable: boolean,
): WidgetField {
  return {
    key,
    label: labelFor(key),
    type:
      typeof value === "boolean"
        ? "boolean" as const
        : typeof value === "number"
          ? "number" as const
          : "text" as const,
    value,
    editable,
  };
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.every(isPrimitive)
      ? value.map(textValue).join(", ")
      : `${value.length} items`;
  }

  if (isRecord(value)) {
    const primitive = Object.entries(value)
      .filter(([, item]) => isPrimitive(item))
      .slice(0, 2)
      .map(([key, item]) => `${labelFor(key)}: ${textValue(item)}`)
      .join(" · ");

    return primitive || `${Object.keys(value).length} fields`;
  }

  return "";
}

function flattenRecord(
  value: RecordValue,
  prefix = "",
  depth = 0,
  output: Record<string, string> = {},
): Record<string, string> {
  for (const [key, item] of Object.entries(value)) {
    if (INTERNAL_KEYS.has(key)) continue;

    const label = prefix
      ? `${prefix} · ${labelFor(key)}`
      : labelFor(key);

    if (isPrimitive(item)) {
      output[label] = textValue(item);
    } else if (isRecord(item) && depth < 2) {
      flattenRecord(item, label, depth + 1, output);
    } else if (Array.isArray(item) && item.every(isPrimitive)) {
      output[label] = item.map(textValue).join(", ");
    } else if (Array.isArray(item)) {
      output[label] = `${item.length} items`;
    } else if (isRecord(item)) {
      output[label] = `${Object.keys(item).length} fields`;
    }
  }

  return output;
}

function tableWidget(
  id: string,
  title: string,
  columns: readonly string[],
  rows: readonly (readonly string[])[],
): Widget {
  const nextColumns = columns.slice(0, 4);

  return {
    id,
    kind: "table",
    title,
    columns: nextColumns,
    rows: rows
      .slice(0, 5)
      .map((row) => row.slice(0, nextColumns.length)),
  };
}

function recordWidgets(
  id: string,
  title: string,
  value: RecordValue,
): Widget[] {
  if (Array.isArray(value.columns) && Array.isArray(value.rows)) {
    return [
      tableWidget(
        id,
        title,
        value.columns.map(textValue),
        value.rows
          .filter(Array.isArray)
          .map((row) => row.map(textValue)),
      ),
    ];
  }

  const fields: WidgetField[] = [];
  const nested: Widget[] = [];

  for (const [key, item] of Object.entries(value)) {
    if (INTERNAL_KEYS.has(key)) continue;

    if (isPrimitive(item)) {
      if (fields.length < 7) fields.push(fieldFor(key, item, false));
      continue;
    }

    if (nested.length >= 4) continue;

    nested.push(
      ...valueWidgets(`${id}:${key}`, labelFor(key), item as Value)
        .slice(0, 4 - nested.length),
    );
  }

  return [
    ...(fields.length > 0
      ? [{
          id,
          kind: "fields" as const,
          title,
          fields,
        }]
      : []),
    ...nested,
  ];
}

function valueWidgets(
  id: string,
  title: string,
  value: Value,
): readonly Widget[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    if (value.every(isPrimitive)) {
      return [
        {
          id,
          kind: "list",
          title,
          items: value.slice(0, 7).map((item) => ({
            label: textValue(item),
            detail: null,
            target: null,
          })),
        },
      ];
    }

    if (value.every(isRecord)) {
      const records = value.map((item) => flattenRecord(item));
      const keys = [...new Set(records.flatMap((item) => Object.keys(item)))]
        .slice(0, 4);

      if (keys.length > 1) {
        return [
          tableWidget(
            id,
            title,
            keys,
            records.map((item) => keys.map((key) => item[key] ?? "")),
          ),
        ];
      }

      if (keys.length === 1) {
        return [
          {
            id,
            kind: "list",
            title,
            items: records.slice(0, 7).map((item) => ({
              label: item[keys[0]!] ?? "",
              detail: null,
              target: null,
            })),
          },
        ];
      }

      return [];
    }

    if (value.every(Array.isArray)) {
      const columns = Math.min(
        4,
        Math.max(...value.map((row) => row.length)),
      );

      if (columns > 1) {
        return [
          tableWidget(
            id,
            title,
            Array.from({ length: columns }, (_, index) =>
              `Column ${index + 1}`),
            value.map((row) => row.map(textValue)),
          ),
        ];
      }

      return [
        {
          id,
          kind: "list",
          title,
          items: value.slice(0, 7).map((row) => ({
            label: textValue(row[0]),
            detail: null,
            target: null,
          })),
        },
      ];
    }

    return [
      {
        id,
        kind: "list",
        title,
        items: value.slice(0, 7).map((item) => ({
          label: textValue(item),
          detail: null,
          target: null,
        })),
      },
    ];
  }

  if (isRecord(value)) {
    return recordWidgets(id, title, value).slice(0, 4);
  }

  if (isPrimitive(value)) {
    return [
      {
        id,
        kind: "metric",
        title,
        value: textValue(value),
        caption: null,
      },
    ];
  }

  return [];
}

const thingVisual: WidgetGenerator = {
  id: "thing-visual",
  generate({ thing }) {
    if (!isRecord(thing.data)) return [];

    const visual = thing.data.visual;

    if (!isRecord(visual)) return [];

    const src = typeof visual.src === "string" ? visual.src : "";
    const assetId = typeof visual.assetId === "string"
      ? visual.assetId
      : null;
    const caption = typeof visual.caption === "string"
      ? visual.caption
      : null;
    const prompt = typeof visual.prompt === "string"
      ? visual.prompt
      : "";

    if (!src) return [];

    return [
      {
        id: "thing-visual",
        kind: "visual",
        title: "Visual",
        caption,
        prompt,
        src,
        assetId,
      },
    ];
  },
};

const enrichmentSummary: WidgetGenerator = {
  id: "enrichment-summary",
  generate({ enrichment }) {
    if (!enrichment?.summary) return [];

    return [
      {
        id: "ai-summary",
        kind: "text",
        title: "Summary",
        body: enrichment.summary,
      },
    ];
  },
};

const enrichmentData: WidgetGenerator = {
  id: "enrichment-data",
  generate({ enrichment }) {
    if (enrichment?.data === null || enrichment?.data === undefined) {
      return [];
    }

    return valueWidgets("ai-data", "Data", enrichment.data);
  },
};

const enrichmentText: WidgetGenerator = {
  id: "enrichment-text",
  generate({ enrichment }) {
    if (!enrichment?.text) return [];

    return [
      {
        id: "ai-text",
        kind: "text",
        title: "Text",
        body: enrichment.text,
      },
    ];
  },
};

const thingFields: WidgetGenerator = {
  id: "thing-fields",
  generate({ thing, canEdit }) {
    if (!isRecord(thing.data)) return [];

    const fields: WidgetField[] = [];

    for (const [key, value] of Object.entries(thing.data)) {
      if (
        key.startsWith("_") ||
        INTERNAL_KEYS.has(key) ||
        !isPrimitive(value)
      ) {
        continue;
      }

      fields.push(
        fieldFor(
          key,
          value,
          canEdit && !READ_ONLY_KEYS.has(key),
        ),
      );

      if (fields.length >= 7) break;
    }

    if (fields.length === 0) return [];

    return [
      {
        id: "thing-fields",
        kind: "fields",
        title: "Fields",
        fields,
      },
    ];
  },
};

const thingData: WidgetGenerator = {
  id: "thing-data",
  generate({ thing }) {
    const data = thing.data;

    if (Array.isArray(data)) {
      return valueWidgets("thing-data", "Data", data);
    }

    if (
      isRecord(data) &&
      Array.isArray(data.columns) &&
      Array.isArray(data.rows)
    ) {
      return valueWidgets("thing-data", "Data", data);
    }

    return [];
  },
};

const DEFAULT_GENERATORS: readonly WidgetGenerator[] = [
  thingVisual,
  enrichmentSummary,
  enrichmentData,
  enrichmentText,
  thingData,
  thingFields,
];

function withoutMadeVisual(
  widgets: readonly Widget[],
  thing: Thing,
): Widget[] {
  if (!isRecord(thing.data) || thing.data._visualMade !== true) {
    return [...widgets];
  }

  return widgets.filter((widget) => widget.kind !== "visual");
}

function uniqueWidgets(widgets: readonly Widget[]): Widget[] {
  const ids = new Set<string>();
  const result: Widget[] = [];

  for (const widget of widgets) {
    if (ids.has(widget.id)) continue;

    ids.add(widget.id);
    result.push(widget);
  }

  return result;
}

export function createWidgetRuntime(
  options: WidgetRuntimeOptions = {},
): WidgetRuntime {
  const generators = [
    ...DEFAULT_GENERATORS,
    ...(options.generators ?? []),
  ];
  const maxWidgets = Math.max(1, options.maxWidgets ?? 4);
  const refreshMs = Math.max(250, options.refreshMs ?? 1_200);
  const entries = new Map<string, Entry>();
  const dismissed = new Map<string, Set<string>>();
  const listeners = new Set<() => void>();

  let destroyed = false;

  function report(error: unknown): void {
    try {
      options.onError?.(error);
    } catch {
      return;
    }
  }

  function notify(): void {
    if (destroyed) return;

    for (const listener of listeners) {
      listener();
    }
  }

  function dataKey(thing: Thing): string {
    try {
      return JSON.stringify(thing.data);
    } catch {
      return "";
    }
  }

  function contextKey(thing: Thing): string {
    try {
      return options.contextKey?.(thing) ?? "";
    } catch (error) {
      report(error);
      return "";
    }
  }

  function dismissKey(thing: Thing): string {
    return `${thing.id}\u0000${dataKey(thing)}\u0000${contextKey(thing)}`;
  }

  function hiddenWidgets(thing: Thing): Set<string> | undefined {
    return dismissed.get(dismissKey(thing));
  }

  function hasEntry(thing: Thing): Entry | undefined {
    const entry = entries.get(thing.id);

    if (
      !entry ||
      entry.dataKey !== dataKey(thing) ||
      entry.contextKey !== contextKey(thing)
    ) {
      return undefined;
    }

    return entry;
  }

  async function generate(
    entry: Entry,
    thing: Thing,
    request: number,
  ): Promise<void> {
    let enrichment: Enrichment | null = null;

    try {
      enrichment = (await options.enrichment?.(thing.id)) ?? null;
    } catch (error) {
      report(error);
    }

    if (destroyed || entry.request !== request) return;

    const context: WidgetContext = {
      thing,
      enrichment,
      canEdit: options.update !== undefined,
    };
    const results = await Promise.allSettled(
      generators.map((generator) =>
        Promise.resolve(generator.generate(context)),
      ),
    );

    if (destroyed || entry.request !== request) return;

    const widgets: Widget[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        widgets.push(...result.value);
      } else {
        report(result.reason);
      }
    }

    entry.widgets = withoutMadeVisual(
      uniqueWidgets(widgets).slice(0, maxWidgets),
      thing,
    );
    entry.status = "ready";

    const pending =
      options.enrichment !== undefined &&
      (enrichment === null ||
        enrichment.status === "queued" ||
        enrichment.status === "running");

    if (pending) {
      notify();

      if (entry.attempts < 20 && !destroyed) {
        entry.attempts++;
        entry.timer = setTimeout(() => {
          entry.timer = null;

          if (destroyed) return;

          entry.request++;
          entry.status = "loading";
          void generate(entry, thing, entry.request);
        }, refreshMs);
      }

      return;
    }

    notify();

    if (!options.ai) return;

    try {
      const generated = await options.ai(thing, enrichment);

      if (destroyed || entry.request !== request) return;

      if (generated.length > 0) {
        const visuals = entry.widgets.filter(
          (widget) =>
            widget.kind === "visual" &&
            !generated.some((item) => item.kind === "visual"),
        );

        entry.widgets = withoutMadeVisual(
          [...visuals, ...generated].slice(0, maxWidgets),
          thing,
        );
        notify();
      }
    } catch (error) {
      report(error);
    }
  }

  function load(thing: Thing): void {
    if (destroyed) return;

    const data = dataKey(thing);
    const context = contextKey(thing);
    const existing = entries.get(thing.id);

    if (
      existing &&
      existing.dataKey === data &&
      existing.contextKey === context &&
      existing.status !== "error"
    ) {
      return;
    }

    if (existing?.timer) clearTimeout(existing.timer);

    const entry: Entry = {
      dataKey: data,
      contextKey: context,
      widgets: [],
      status: "loading",
      request: (existing?.request ?? 0) + 1,
      attempts: 0,
      timer: null,
    };

    entries.set(thing.id, entry);
    void generate(entry, thing, entry.request);
  }

  async function editField(
    field: WidgetField,
    thing: Thing,
  ): Promise<string | null> {
    if (options.editText) {
      return await options.editText(field, thing);
    }

    if (typeof globalThis.prompt !== "function") return null;

    return globalThis.prompt(field.label, String(field.value));
  }

  async function invoke(
    thing: Thing,
    widgetId: string,
    action: string,
  ): Promise<void> {
    if (destroyed) return;

    if (action.startsWith("focus:")) {
      const target = action.slice(6).trim();

      if (target) options.focus?.(target);

      return;
    }

    const entry = hasEntry(thing);
    const widget = entry?.widgets.find((item) => item.id === widgetId);

    if (!entry || !widget) return;

    if (action.startsWith("action:") && widget.kind === "actions") {
      const index = Number(action.slice(7));
      const item = widget.items[index];

      if (!item || !isRecord(thing.data)) return;

      const current = thing.data[item.key];
      let next: Value;

      if (item.kind === "toggle" && typeof current === "boolean") {
        next = !current;
      } else if (
        item.kind === "increment" &&
        typeof current === "number"
      ) {
        next = current + (
          typeof item.value === "number" ? Math.abs(item.value) : 1
        );
      } else if (
        item.kind === "decrement" &&
        typeof current === "number"
      ) {
        next = current - (
          typeof item.value === "number" ? Math.abs(item.value) : 1
        );
      } else if (
        item.kind === "set" &&
        item.value !== null
      ) {
        next = item.value;
      } else if (
        item.kind === "append" &&
        Array.isArray(current) &&
        item.value !== null
      ) {
        next = [...current, item.value];
      } else {
        return;
      }

      await applyChange(thing, item.key, next);
      return;
    }

    if (action.startsWith("check:") && widget.kind === "checklist") {
      const index = Number(action.slice(6));
      const item = widget.items[index];

      if (
        !item?.field ||
        !isRecord(thing.data) ||
        typeof thing.data[item.field] !== "boolean"
      ) {
        return;
      }

      await applyChange(thing, item.field, !thing.data[item.field]);
      return;
    }

    if (widget.kind !== "fields") return;

    const match = /^field:(.+):(toggle|increment|decrement|edit)$/.exec(
      action,
    );

    if (!match) return;

    const key = match[1]!;
    const operation = match[2]!;
    const field = widget.fields.find(
      (item) => item.key === key && item.editable,
    );

    if (!field || !isRecord(thing.data)) return;

    let next: string | number | boolean | null = null;

    if (operation === "toggle" && typeof field.value === "boolean") {
      next = !field.value;
    } else if (
      operation === "increment" &&
      typeof field.value === "number"
    ) {
      next = field.value + 1;
    } else if (
      operation === "decrement" &&
      typeof field.value === "number"
    ) {
      next = field.value - 1;
    } else if (operation === "edit" && typeof field.value === "string") {
      next = await editField(field, thing);
    }

    if (next === null) return;

    await applyChange(thing, key, next);
  }

  async function applyChange(
    thing: Thing,
    key: string,
    next: Value,
  ): Promise<void> {
    if (!options.update || !isRecord(thing.data)) return;

    const data = { ...thing.data, [key]: next } as Value;

    try {
      const updated = await options.update(thing, data);

      if (destroyed) return;

      const nextThing = updated ?? { ...thing, data };
      const current = entries.get(thing.id);

      if (!current) return;

      if (current.timer) clearTimeout(current.timer);

      const nextEntry: Entry = {
        dataKey: dataKey(nextThing),
        contextKey: contextKey(nextThing),
        widgets: current.widgets.map((item) =>
          item.kind === "fields"
            ? {
                ...item,
                fields: item.fields.map((field) =>
                  field.key === key &&
                  (typeof next === "string" ||
                    typeof next === "number" ||
                    typeof next === "boolean")
                    ? { ...field, value: next }
                    : field,
                ),
              }
            : item.kind === "checklist" &&
                item.items.some((entry) => entry.field === key)
              ? {
                  ...item,
                  items: item.items.map((entry) =>
                    entry.field === key ? { ...entry, done: next === true } : entry,
                  ),
                }
              : item,
        ),
        status: "loading",
        request: current.request + 1,
        attempts: 0,
        timer: null,
      };

      entries.set(thing.id, nextEntry);
      notify();
      void generate(nextEntry, nextThing, nextEntry.request);
    } catch (error) {
      report(error);
    }
  }

  return {
    get(thing): readonly Widget[] {
      const entry = entries.get(thing.id);
      const hidden = hiddenWidgets(thing);

      return entry && entry.dataKey === dataKey(thing)
        ? entry.widgets.filter((widget) => !hidden?.has(widget.id))
        : [];
    },

    load,

    invoke,

    dismiss(thing, widgetId): void {
      const key = dismissKey(thing);
      let hidden = dismissed.get(key);

      if (!hidden) {
        hidden = new Set();
        dismissed.set(key, hidden);
      }

      hidden.add(widgetId);

      const entry = entries.get(thing.id);

      if (entry) {
        entry.widgets = entry.widgets.filter(
          (widget) => widget.id !== widgetId,
        );
      }

      notify();
    },

    subscribe(listener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    destroy(): void {
      destroyed = true;

      for (const entry of entries.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }

      entries.clear();
      dismissed.clear();
      listeners.clear();
    },
  };
}