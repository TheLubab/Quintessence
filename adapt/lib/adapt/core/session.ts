import type { Space, Thing, TypeDefinition } from "./contracts.ts";
import type {
  ActionDescriptor,
  OfferedAction,
  Operation,
  OperationClient,
} from "./actions.ts";

import { actionList } from "./actions.ts";
import { text } from "./validation.ts";

type Listing = {
  items: Thing[];
  cursor: string | null;
  history: Array<string | null>;
  next: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

export type SessionSnapshot = {
  focus: Thing | null;
  parent: Thing | null;
  children: readonly Thing[];
  siblings: readonly Thing[];
  loading: boolean;
  error: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  actions: readonly OfferedAction[];
  operations: readonly Operation[];

  operationErrors: readonly {
    readonly id: string;
    readonly message: string;
  }[];
};

export function createSession(
  space: Space & {
    readonly operations?: OperationClient;
    peek?(id: string): Thing | undefined;
  },
  options: {
    types: readonly Pick<TypeDefinition, "name" | "contains">[];
  },
) {
  const containers = new Set(
    options.types.filter((type) => type.contains).map((type) => type.name),
  );

  const things = new Map<string, Thing>();
  const listings = new Map<string | null, Listing>();
  const listeners = new Set<() => void>();

  let focusedId: string | null = null;
  let destroyed = false;

  const contributions = new Map<
    string,
    Map<string, readonly ActionDescriptor[]>
  >();

  const operations = new Map<string, Operation>();
  const operationErrors = new Map<string, string>();

  // Retained while an offer is being invoked or its operation is tracked.
  const activeInvocations = new Map<string, Promise<Operation>>();
  const operationKeys = new Map<string, string>();

  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Keep returned things visible even when their IDs fall on another page.
  const resultIds = new Set<string>();

  function actionKey(
    contextId: string,
    source: string,
    actionId: string,
  ): string {
    return JSON.stringify([contextId, source, actionId]);
  }

  function offeredActions(contextId: string): OfferedAction[] {
    const sources = contributions.get(contextId);

    if (!sources) return [];

    const result: OfferedAction[] = [];

    for (const [source, actions] of sources) {
      for (const action of actions) {
        result.push({
          ...structuredClone(action),
          source,
          busy: activeInvocations.has(actionKey(contextId, source, action.id)),
        });
      }
    }

    return result;
  }

  function replaceActions(
    contextId: string,
    source: string,
    actions: readonly ActionDescriptor[],
  ): void {
    if (destroyed) return;

    text(contextId, "action context");
    text(source, "action source");

    // Validate and detach before changing existing offers.
    const next = actionList(actions);

    let sources = contributions.get(contextId);

    if (!sources) {
      sources = new Map();
      contributions.set(contextId, sources);
    }

    if (next.length === 0) {
      sources.delete(source);

      if (sources.size === 0) {
        contributions.delete(contextId);
      }
    } else {
      sources.set(source, next);
    }

    notify();
  }

  function visibleItems(parent: string | null): Thing[] {
    const items = new Map<string, Thing>();

    for (const item of listing(parent).items) {
      const current = things.get(item.id) ?? item;

      if (current.parent === parent) {
        items.set(current.id, current);
      }
    }

    for (const id of resultIds) {
      const thing = things.get(id);

      if (thing?.parent === parent) {
        items.set(id, thing);
      }
    }

    return [...items.values()];
  }

  function releaseOperation(id: string): void {
    const key = operationKeys.get(id);

    if (key !== undefined) {
      activeInvocations.delete(key);
      operationKeys.delete(id);
    }
  }

  function scheduleOperation(id: string, delay = 350): void {
    if (destroyed) return;

    const previous = timers.get(id);

    if (previous !== undefined) {
      clearTimeout(previous);
    }

    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        void pollOperation(id);
      }, delay),
    );
  }

  async function synchronizeOperation(operation: Operation): Promise<void> {
    const resultThings =
      operation.status === "succeeded" ? operation.result.things : [];

    const ids = new Set([...operation.targets, ...resultThings]);

    const snapshots = await Promise.all(
      [...ids].map(async (id) => ({
        id,
        thing: await space.get(id),
      })),
    );

    if (destroyed) return;

    for (const { id, thing } of snapshots) {
      if (thing) {
        things.set(id, thing);
      } else {
        things.delete(id);
        resultIds.delete(id);

        // Remove known deleted things from cached listings too.
        for (const entry of listings.values()) {
          entry.items = entry.items.filter((item) => item.id !== id);
        }

        if (focusedId === id) {
          focusedId = null;
        }
      }
    }

    for (const id of resultThings) {
      if (things.has(id)) {
        resultIds.add(id);
      }
    }

    // Results are available immediately, independently of pagination.
    notify();

    await refresh();
  }

  async function pollOperation(id: string): Promise<void> {
    if (destroyed || !space.operations) return;

    try {
      const operation = await space.operations.get(id);

      if (destroyed) return;

      operations.set(id, operation);
      operationErrors.delete(id);

      if (operation.status === "running") {
        notify();
        scheduleOperation(id);
        return;
      }

      // Refresh after failure too: a handler may have made partial changes.
      await synchronizeOperation(operation);

      if (destroyed) return;

      releaseOperation(id);
      notify();
    } catch (error) {
      if (destroyed) return;

      operationErrors.set(
        id,
        error instanceof Error
          ? error.message
          : "Could not track the operation",
      );

      // Lost/unauthorized records cannot be recovered by polling.
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : null;

      if (code === "NOT_FOUND" || code === "UNAUTHORIZED") {
        releaseOperation(id);
      } else {
        // Retry observation only. Never repeat the capability invocation.
        scheduleOperation(id, 1_000);
      }

      notify();
    }
  }

  async function invoke(
    contextId: string,
    actionId: string,
    source?: string,
  ): Promise<Operation> {
    if (destroyed) {
      throw new Error("Session is destroyed");
    }

    if (!space.operations) {
      throw new Error("This space does not provide capability execution");
    }

    const matches = offeredActions(contextId).filter(
      (action) =>
        action.id === actionId &&
        (source === undefined || action.source === source),
    );

    if (matches.length === 0) {
      throw new Error("Action is no longer offered");
    }

    if (matches.length > 1) {
      throw new Error(
        "Action ID is ambiguous; provide its contribution source",
      );
    }

    const action = matches[0]!;
    const key = actionKey(contextId, action.source, action.id);
    const existing = activeInvocations.get(key);

    if (existing) {
      return structuredClone(await existing);
    }

    // Capture the selected offer. Later updates cannot alter this request.
    const request = space.operations.invoke({
      capability: action.capability,
      targets: [...action.targets],
      input: action.input ?? null,
    });

    const accepted = request.then(
      (operation) => {
        if (!destroyed) {
          operations.set(operation.id, operation);
          operationKeys.set(operation.id, key);
          scheduleOperation(operation.id, 0);
          notify();
        }

        return structuredClone(operation);
      },
      (error: unknown) => {
        if (!destroyed) {
          activeInvocations.delete(key);
          notify();
        }

        throw error;
      },
    );

    activeInvocations.set(key, accepted);
    notify();

    return structuredClone(await accepted);
  }

  async function refresh(): Promise<void> {
    if (destroyed) return;

    const current = focusedThing();

    const parents = new Set<string | null>(
      current
        ? [current.parent, ...(contains(current) ? [current.id] : [])]
        : [null],
    );

    await Promise.all(
      [...parents].map((parent) => {
        const entry = listing(parent);

        return load(parent, entry.cursor, [...entry.history]);
      }),
    );
  }

  function listing(parent: string | null): Listing {
    let value = listings.get(parent);

    if (!value) {
      value = {
        items: [],
        cursor: null,
        history: [],
        next: null,
        loaded: false,
        loading: false,
        error: null,
      };

      listings.set(parent, value);
    }

    return value;
  }

  function focusedThing(): Thing | null {
    return focusedId ? (things.get(focusedId) ?? null) : null;
  }

  function contains(thing: Thing): boolean {
    return containers.has(thing.type);
  }

  function currentListing(): string | null {
    const focus = focusedThing();

    if (!focus) return null;

    return contains(focus) ? focus.id : focus.parent;
  }

  function notify(): void {
    if (destroyed) return;

    for (const listener of listeners) {
      listener();
    }
  }

  async function load(
    parent: string | null,
    cursor: string | null,
    history: Array<string | null>,
  ): Promise<void> {
    if (destroyed) return;

    const entry = listing(parent);

    if (entry.loading) return;

    entry.loading = true;
    entry.error = null;
    notify();

    try {
      const result = await space.list({
        parent,
        limit: 8,
        ...(cursor !== null ? { after: cursor } : {}),
      });

      if (destroyed) return;

      for (const thing of result.items) {
        things.set(thing.id, thing);
      }

      entry.items = [...result.items];
      entry.cursor = cursor;
      entry.history = history;
      entry.next = result.next;
      entry.loaded = true;
    } catch (error) {
      if (!destroyed) {
        entry.error =
          error instanceof Error ? error.message : "Could not load things";
      }
    } finally {
      entry.loading = false;
      notify();
    }
  }

  function ensure(parent: string | null): void {
    const entry = listing(parent);

    if (!entry.loaded && !entry.loading) {
      void load(parent, null, []);
    }
  }

  function focus(id: string | null): void {
    if (destroyed || id === focusedId) return;

    const thing = id === null ? null : (things.get(id) ?? space.peek?.(id));

    if (thing) {
      things.set(thing.id, thing);
    }

    if (id !== null && !thing) {
      throw new Error("Focus requires a loaded thing");
    }

    focusedId = id;

    // Attention changes before any request starts.
    notify();

    if (!thing) {
      ensure(null);
      return;
    }

    ensure(thing.parent);

    if (contains(thing)) {
      ensure(thing.id);
    }
  }

  function snapshot(): SessionSnapshot {
    const focus = focusedThing();
    const parent = currentListing();
    const entry = listing(parent);

    return structuredClone({
      focus,

      parent: focus?.parent ? (things.get(focus.parent) ?? null) : null,

      children: !focus || contains(focus) ? visibleItems(parent) : [],

      siblings: focus
        ? visibleItems(focus.parent).filter((thing) => thing.id !== focus.id)
        : [],

      loading: entry.loading,
      error: entry.error,

      hasPrevious: !entry.loading && entry.history.length > 0,
      hasNext: !entry.loading && entry.next !== null,

      actions: focus ? offeredActions(focus.id) : [],

      operations: [...operations.values()],

      operationErrors: [...operationErrors].map(([id, message]) => ({
        id,
        message,
      })),
    });
  }

  return {
    snapshot,
    focus,
    invoke,

    contains(thing: Thing): boolean {
      return contains(thing);
    },

    integrate(thing: Thing): void {
      if (destroyed) return;

      things.set(thing.id, structuredClone(thing));
      resultIds.add(thing.id);
      notify();
    },

    actions: {
      replace: replaceActions,

      list(contextId: string): readonly OfferedAction[] {
        return offeredActions(contextId);
      },
    },

    back(): void {
      focus(focusedThing()?.parent ?? null);
    },

    refresh,

    next(): void {
      const parent = currentListing();
      const entry = listing(parent);

      if (entry.loading || entry.next === null) return;

      void load(parent, entry.next, [...entry.history, entry.cursor]);
    },

    previous(): void {
      const parent = currentListing();
      const entry = listing(parent);

      if (entry.loading || entry.history.length === 0) return;

      const history = [...entry.history];
      const cursor = history.pop() ?? null;

      void load(parent, cursor, history);
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    destroy(): void {
      destroyed = true;

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }

      timers.clear();
      contributions.clear();
      operations.clear();
      operationErrors.clear();
      activeInvocations.clear();
      operationKeys.clear();
      resultIds.clear();

      listeners.clear();
      listings.clear();
      things.clear();

      focusedId = null;
    },
  };
}

export type Session = ReturnType<typeof createSession>;
