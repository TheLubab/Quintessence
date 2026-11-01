import type {
  ListOptions,
  Space,
  ThingCreate,
  ThingListOptions,
  ThingUpdate,
  TypeDefinition,
} from "../core/contracts.ts";

import type { StorageAdapter } from "../storage/contracts.ts";
import type { AssetStore } from "../assets/filesystem/index.ts";
import type { EnrichmentService } from "../enrichment/index.ts";
import {
  assetSource,
  parseDataUrl,
} from "../assets/url.ts";

import { AdaptError } from "../core/errors.ts";
import { createAdapt } from "./runtime.ts";
import { record, text } from "../core/validation.ts";
import {
  createCapabilities,
  type OperationPersistence,
} from "./capabilities.ts";

// Preserve direct runtime access.
export { createAdapt } from "./runtime.ts";
export type { Adapt } from "./runtime.ts";
export type { Capability } from "./capabilities.ts";

export type ServerOptions = {
  types: readonly TypeDefinition[];
  storage: StorageAdapter;

  assets?: AssetStore;

  operations?: OperationPersistence;

  enrichment?: EnrichmentService;

  scope(request: Request): string | null | Promise<string | null>;

  onError?(error: unknown): void;
};

export function createServer(options: ServerOptions) {
  const capabilities = createCapabilities(options.onError, options.operations);

  function response(data: unknown): Response {
    return Response.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  function failure(status: number, code: string, message: string): Response {
    return Response.json(
      { error: { code, message } },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  function info(space: Space) {
    return {
      id: space.id,
      title: space.title,
    };
  }

  function assetifyData(data: unknown): unknown {
    if (
      !options.assets ||
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data)
    ) {
      return data;
    }

    const value = data as Record<string, unknown>;
    const src = typeof value.src === "string" ? value.src : null;

    if (!src) return data;

    const parsed = parseDataUrl(src);
    if (!parsed) return data;

    const mimeType =
      typeof value.mimeType === "string" && value.mimeType
        ? value.mimeType
        : parsed.mimeType;
    const info = options.assets.put(parsed.bytes, mimeType);

    return {
      ...value,
      src: assetSource(info.id),
      assetId: info.id,
      mimeType: info.mimeType,
    };
  }

  function assetifyCreate(input: unknown): unknown {
    if (
      !options.assets ||
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    ) {
      return input;
    }

    const fields = input as Record<string, unknown>;

    if (fields.type !== "image" && fields.type !== "file") {
      return input;
    }

    return {
      ...fields,
      data: assetifyData(fields.data),
    };
  }

  async function execute(
    scope: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    // A lightweight request-local runtime, not a cached user session.
    const adapt = createAdapt({
      types: options.types,
      storage: options.storage,
      scope,
      ...(options.enrichment ? { enrichment: options.enrichment } : {}),
      ...(options.onError ? { onError: options.onError } : {}),
    });

    const method = text(body.method, "method");

    switch (method) {
      case "spaces.create":
        return info(await adapt.spaces.create(body.input as { title: string }));

      case "spaces.open":
        return info(await adapt.spaces.open(text(body.spaceId, "spaceId")));

      case "spaces.list":
        return adapt.spaces.list(body.options as ListOptions | undefined);
    }

    const space = await adapt.spaces.open(text(body.spaceId, "spaceId"));

    switch (method) {
      case "things.add": {
        const id = await space.add(
          assetifyCreate(body.input) as ThingCreate,
        );
        const thing = (await space.get(id)) ?? null;

        return {
          id,
          thing,
        };
      }

      case "things.list":
        return space.list(body.options as ThingListOptions | undefined);

      case "things.get":
        return (await space.get(text(body.id, "id"))) ?? null;

      case "things.update": {
        const id = text(body.id, "id");
        const existing = await space.get(id);
        const input =
          existing?.type === "image" || existing?.type === "file"
            ? (() => {
                const patch =
                  typeof body.input === "object" &&
                  body.input !== null &&
                  !Array.isArray(body.input)
                    ? (body.input as Record<string, unknown>)
                    : null;

                return patch && "data" in patch
                  ? { ...patch, data: assetifyData(patch.data) }
                  : body.input;
              })()
            : body.input;

        await space.update(id, input as ThingUpdate);

        return (await space.get(id)) ?? null;
      }

      case "things.move": {
        const id = text(body.id, "id");

        await space.move(id, body.input as { parent: string | null });

        return (await space.get(id)) ?? null;
      }

      case "things.remove": {
        const id = text(body.id, "id");

        await space.remove(
          id,
          body.options as { recursive?: boolean } | undefined,
        );

        return null;
      }

      case "enrichment.get":
        return options.enrichment?.get(
          scope,
          space.id,
          text(body.id, "id"),
        ) ?? null;

      case "operations.invoke":
        return capabilities.invoke(scope, space, body.input);

      case "operations.get":
        return capabilities.get(scope, space.id, text(body.id, "operation id"));

      case "operations.cancel":
        return capabilities.cancel(
          scope,
          space,
          text(body.id, "operation id"),
        );

      default:
        throw new AdaptError("INVALID_INPUT", "Unknown method");
    }
  }

  async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      const result = failure(405, "METHOD_NOT_ALLOWED", "Use POST");

      result.headers.set("Allow", "POST");
      return result;
    }

    const contentType = request.headers
      .get("Content-Type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();

    if (contentType !== "application/json") {
      return failure(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json");
    }

    try {
      const scope = await options.scope(request);

      if (scope === null) {
        return failure(401, "UNAUTHORIZED", "Access denied");
      }

      if (typeof scope !== "string" || scope.trim().length === 0) {
        throw new Error("scope() must return a nonempty string or null");
      }

      const json: unknown = await request.json().catch(() => {
        throw new AdaptError("INVALID_INPUT", "Invalid JSON");
      });

      // Scope is deliberately not an accepted request field.
      const body = record(json, [
        "method",
        "spaceId",
        "id",
        "input",
        "options",
      ]);

      return response(await execute(scope, body));
    } catch (error) {
      if (error instanceof AdaptError) {
        const status = {
          INVALID_INPUT: 400,
          NOT_FOUND: 404,
          CONFLICT: 409,
          UNAVAILABLE: 503,
        }[error.code];

        return failure(status, error.code, error.message);
      }

      options.onError?.(error);

      if (error instanceof Error && error.name === "ProviderError") {
        return failure(502, "MODEL_ERROR", error.message);
      }

      return failure(
        500,
        "INTERNAL_ERROR",
        "The request could not be completed",
      );
    }
  }

  return {
    handle,

    capability: capabilities.register,

    // Close once when the application shuts down.
    async close(): Promise<void> {
      await capabilities.close();
      await options.enrichment?.close();
      await options.operations?.close?.();
      await options.storage.close();
    },
  };
}
