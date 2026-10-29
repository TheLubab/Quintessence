import type {
  ListOptions,
  Space,
  ThingCreate,
  ThingListOptions,
  ThingUpdate,
  TypeDefinition,
} from "../core/contracts.ts";

import type { StorageAdapter } from "../storage/contracts.ts";

import { AdaptError } from "../core/errors.ts";
import { createAdapt } from "./runtime.ts";
import { record, text } from "../core/validation.ts";

// Preserve direct runtime access.
export { createAdapt } from "./runtime.ts";
export type { Adapt } from "./runtime.ts";

export type ServerOptions = {
  types: readonly TypeDefinition[];
  storage: StorageAdapter;

  scope(request: Request): string | null | Promise<string | null>;

  onError?(error: unknown): void;
};

export function createServer(options: ServerOptions) {
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

  async function execute(
    scope: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    // A lightweight request-local runtime, not a cached user session.
    const adapt = createAdapt({
      types: options.types,
      storage: options.storage,
      scope,
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
        const id = await space.add(body.input as ThingCreate);

        return {
          id,
          thing: (await space.get(id)) ?? null,
        };
      }

      case "things.list":
        return space.list(body.options as ThingListOptions | undefined);

      case "things.get":
        return (await space.get(text(body.id, "id"))) ?? null;

      case "things.update": {
        const id = text(body.id, "id");

        await space.update(id, body.input as ThingUpdate);

        return (await space.get(id)) ?? null;
      }

      case "things.move": {
        const id = text(body.id, "id");

        await space.move(id, body.input as { parent: string | null });

        return (await space.get(id)) ?? null;
      }

      case "things.remove": {
        await space.remove(
          text(body.id, "id"),
          body.options as { recursive?: boolean } | undefined,
        );

        return null;
      }

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
        }[error.code];

        return failure(status, error.code, error.message);
      }

      options.onError?.(error);

      return failure(
        500,
        "INTERNAL_ERROR",
        "The request could not be completed",
      );
    }
  }

  return {
    handle,

    // Close once when the application shuts down.
    close: () => options.storage.close(),
  };
}
