import type { Space, Thing, TypeDefinition } from "./contracts.ts";

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
};

export function createSession(
  space: Space,
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

    const thing = id === null ? null : things.get(id);

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
    const entry = listing(currentListing());

    return {
      focus,

      parent: focus?.parent ? (things.get(focus.parent) ?? null) : null,

      children: !focus || contains(focus) ? entry.items : [],

      siblings: focus
        ? listing(focus.parent).items.filter((thing) => thing.id !== focus.id)
        : [],

      loading: entry.loading,
      error: entry.error,

      hasPrevious: !entry.loading && entry.history.length > 0,

      hasNext: !entry.loading && entry.next !== null,
    };
  }

  return {
    snapshot,
    focus,

    back(): void {
      focus(focusedThing()?.parent ?? null);
    },

    async refresh(): Promise<void> {
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
    },

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
      listeners.clear();
      listings.clear();
      things.clear();
      focusedId = null;
    },
  };
}

export type Session = ReturnType<typeof createSession>;
