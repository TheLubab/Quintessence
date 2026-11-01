import type { Space } from "../core/contracts.ts";

import type { EnrichmentStore } from "../enrichment/contracts.ts";
import type { MetaModel } from "../enrichment/meta.ts";
import type { AssetStore } from "../assets/filesystem/index.ts";
import type { Widget } from "./contracts.ts";

import { assetSource } from "../assets/url.ts";
import { AdaptError } from "../core/errors.ts";
import { generateWidgets } from "./ai.ts";

export type WidgetService = {
  generate(
    scope: string,
    space: Space,
    thingId: string,
  ): Promise<readonly Widget[]>;
};

type CacheEntry = {
  contentKey: string;
  widgets: readonly Widget[];
};

const MAX_CACHE = 100;

export function createWidgetService(options: {
  model: MetaModel;
  enrichments: EnrichmentStore;
  assets?: AssetStore;
  onError?(error: unknown): void;
}): WidgetService {
  const cache = new Map<string, CacheEntry>();

  async function generate(
    scope: string,
    space: Space,
    thingId: string,
  ): Promise<readonly Widget[]> {
    const thing = await space.get(thingId);

    if (!thing) {
      throw new AdaptError("NOT_FOUND", `Thing not found: ${thingId}`);
    }

    let enrichment = null;

    try {
      enrichment = options.enrichments.get(scope, space.id, thingId) ?? null;
    } catch (error) {
      try {
        options.onError?.(error);
      } catch {
        enrichment = null;
      }
    }

    const key = JSON.stringify([
      scope,
      space.id,
      thingId,
    ]);
    const contentKey = JSON.stringify([
      thing.type,
      thing.data,
      enrichment?.status ?? null,
      enrichment?.updatedAt ?? null,
    ]);
    const cached = cache.get(key);

    if (cached?.contentKey === contentKey) return cached.widgets;

    const signal = new AbortController().signal;
    const generated = await generateWidgets(
      options.model,
      thing,
      enrichment,
      signal,
    );
    const widgets: Widget[] = [];
    let visualGenerated = false;

    for (const widget of generated) {
      if (widget.kind !== "visual") {
        widgets.push(widget);
        continue;
      }

      if (visualGenerated || !options.assets) continue;

      visualGenerated = true;

      try {
        const image = await options.model.generateImage(
          widget.prompt,
          signal,
        );
        const info = options.assets.put(image.bytes, image.mimeType);

        widgets.push({
          ...widget,
          src: assetSource(info.id),
          assetId: info.id,
        });
      } catch (error) {
        try {
          options.onError?.(error);
        } catch {
          continue;
        }
      }
    }

    cache.set(key, { contentKey, widgets });

    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;

      if (oldest !== undefined) cache.delete(oldest);
    }

    return widgets;
  }

  return { generate };
}
