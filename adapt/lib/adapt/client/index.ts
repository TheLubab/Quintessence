import type {
  ListOptions,
  Page,
  Space,
  SpaceInfo,
  Thing,
} from "../core/contracts.ts";
import { dataValue } from "../core/validation.ts";
import type { Operation, OperationClient } from "../core/actions.ts";

export interface ClientSpace extends Space {
  readonly operations: OperationClient;

  peek(id: string): Thing | undefined;
}

export interface Client {
  readonly spaces: {
    create(input: { title: string }): Promise<ClientSpace>;

    open(id: string): Promise<ClientSpace>;

    list(options?: ListOptions): Promise<Page<SpaceInfo>>;
  };

  close(): void;
}

export class RequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);

    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

export function connect(options: {
  endpoint: string;
  fetch?: typeof globalThis.fetch;
}): Client {
  const fetcher = options.fetch ?? globalThis.fetch;
  const controller = new AbortController();

  const caches = new Map<string, Map<string, Thing>>();

  let closed = false;
  let pending: Promise<void> = Promise.resolve();

  function assertOpen(): void {
    if (closed) {
      throw new Error("Adapt client is closed");
    }
  }

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = pending.then(() => {
      assertOpen();
      return work();
    });

    // One failed request must not block subsequent requests.
    pending = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  async function request<T, R>(
    body: object,
    receive: (value: T) => R,
  ): Promise<R> {
    assertOpen();

    // Capture input before it enters the queue.
    // Reject undefined, functions, and other non-JSON values.
    const encoded = JSON.stringify(dataValue(body));

    return enqueue(async () => {
      const response = await fetcher(options.endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: encoded,
        signal: controller.signal,
      });

      const payload = (await response.json()) as {
        data?: T;
        error?: {
          code: string;
          message: string;
        };
      };

      assertOpen();

      if (!response.ok) {
        throw new RequestError(
          response.status,
          payload.error?.code ?? "REQUEST_FAILED",
          payload.error?.message ?? "Adapt request failed",
        );
      }

      if (!payload || !("data" in payload)) {
        throw new Error("Invalid Adapt response");
      }

      // Cache updates happen inside the queue too.
      return receive(payload.data as T);
    });
  }

  function openSpace(info: SpaceInfo): ClientSpace {
    let cache = caches.get(info.id);

    if (!cache) {
      cache = new Map<string, Thing>();
      caches.set(info.id, cache);
    }

    const things = cache;

    function remember(id: string, thing: Thing | null): void {
      if (thing === null) {
        things.delete(id);
      } else {
        things.set(id, structuredClone(thing));
      }
    }

    return {
      ...info,

      operations: {
        invoke(input) {
          return request(
            {
              method: "operations.invoke",
              spaceId: info.id,
              input,
            },
            (operation: Operation) => operation,
          );
        },

        get(id) {
          return request(
            {
              method: "operations.get",
              spaceId: info.id,
              id,
            },
            (operation: Operation) => operation,
          );
        },
      },

      peek(id) {
        assertOpen();
        return structuredClone(things.get(id));
      },

      add(input) {
        return request(
          {
            method: "things.add",
            spaceId: info.id,
            input,
          },
          (result: { id: string; thing: Thing | null }) => {
            remember(result.id, result.thing);
            return result.id;
          },
        );
      },

      get(id) {
        return request(
          {
            method: "things.get",
            spaceId: info.id,
            id,
          },
          (thing: Thing | null) => {
            remember(id, thing);
            return thing ?? undefined;
          },
        );
      },

      list(options = {}) {
        return request(
          {
            method: "things.list",
            spaceId: info.id,
            options,
          },
          (result: Page<Thing>) => {
            for (const thing of result.items) {
              remember(thing.id, thing);
            }

            return result;
          },
        );
      },

      update(id, input) {
        return request(
          {
            method: "things.update",
            spaceId: info.id,
            id,
            input,
          },
          (thing: Thing | null) => {
            remember(id, thing);
          },
        );
      },

      move(id, input) {
        return request(
          {
            method: "things.move",
            spaceId: info.id,
            id,
            input,
          },
          (thing: Thing | null) => {
            remember(id, thing);
          },
        );
      },

      remove(id, options = {}) {
        return request(
          {
            method: "things.remove",
            spaceId: info.id,
            id,
            options,
          },
          (_result: null) => {
            // Descendants may also have been removed.
            // Clear this space's cache rather than guessing.
            things.clear();
          },
        );
      },
    };
  }

  return {
    spaces: {
      create(input) {
        return request({ method: "spaces.create", input }, (info: SpaceInfo) =>
          openSpace(info),
        );
      },

      open(spaceId) {
        return request({ method: "spaces.open", spaceId }, (info: SpaceInfo) =>
          openSpace(info),
        );
      },

      list(options = {}) {
        return request(
          { method: "spaces.list", options },
          (result: Page<SpaceInfo>) => result,
        );
      },
    },

    close() {
      closed = true;
      controller.abort();

      for (const cache of caches.values()) {
        cache.clear();
      }

      caches.clear();
    },
  };
}
