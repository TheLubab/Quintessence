import type { SpaceInfo, Thing } from "../../core/contracts";

import type {
  StorageAdapter,
  StorageList,
  StorageTransaction,
} from "../contracts";

import { requireSynchronous } from "../helpers";

/** Volatile storage for small workspaces, demos, and tests. */
export function memoryStorage(): StorageAdapter {
  let spaces = new Map<string, SpaceInfo>();

  let things = new Map<string, { spaceId: string; thing: Thing }>();

  let scopeBySpace = new Map<string, string>();

  let closed = false;
  let active = false;

  const key = (spaceId: string, id: string) => JSON.stringify([spaceId, id]);

  function list<T extends { readonly id: string }>(
    rows: T[],
    query: StorageList,
  ): T[] {
    return rows
      .filter((row) => query.after === null || row.id > query.after)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, query.limit)
      .map((row) => structuredClone(row));
  }

  async function run<T>(
    write: boolean,
    work: (tx: StorageTransaction) => T,
  ): Promise<T> {
    if (closed) {
      throw new Error("Storage is closed");
    }

    if (active) {
      throw new Error("Nested storage transactions are not supported");
    }

    active = true;

    let live = true;

    // Stage map changes. Stored records themselves are never mutated.
    const nextSpaces = write ? new Map(spaces) : spaces;
    const nextThings = write ? new Map(things) : things;
    const nextScopeBySpace = write ? new Map(scopeBySpace) : scopeBySpace;

    function guard(mutation = false): void {
      if (!live) {
        throw new Error("Transaction has ended");
      }

      if (mutation && !write) {
        throw new Error("Read transaction cannot write");
      }
    }

    const tx: StorageTransaction = {
      getSpace(scope, id) {
        guard();

        if (nextScopeBySpace.get(id) !== scope) {
          return undefined;
        }

        return structuredClone(nextSpaces.get(id));
      },

      listSpaces(scope, query) {
        guard();

        const rows = [...nextSpaces.values()].filter(
          (space) => nextScopeBySpace.get(space.id) === scope,
        );

        return list(rows, query);
      },

      getThing(spaceId, id) {
        guard();

        return structuredClone(nextThings.get(key(spaceId, id))?.thing);
      },

      listThings(spaceId, parent, query) {
        guard();

        const rows = [...nextThings.values()]
          .filter(
            (row) => row.spaceId === spaceId && row.thing.parent === parent,
          )
          .map((row) => row.thing);

        return list(rows, query);
      },

      insertSpace(scope, space) {
        guard(true);

        if (nextSpaces.has(space.id)) {
          throw new Error("Space already exists");
        }

        nextSpaces.set(space.id, structuredClone(space));
        nextScopeBySpace.set(space.id, scope);
      },

      insertThing(spaceId, thing) {
        guard(true);

        if (nextThings.has(key(spaceId, thing.id))) {
          throw new Error("Thing already exists");
        }

        if (!nextSpaces.has(spaceId)) {
          throw new Error("Space not found");
        }

        nextThings.set(key(spaceId, thing.id), {
          spaceId,
          thing: structuredClone(thing),
        });
      },

      updateThing(spaceId, thing) {
        guard(true);

        if (!nextThings.has(key(spaceId, thing.id))) {
          throw new Error("Thing not found");
        }

        nextThings.set(key(spaceId, thing.id), {
          spaceId,
          thing: structuredClone(thing),
        });
      },

      deleteThing(spaceId, id) {
        guard(true);
        nextThings.delete(key(spaceId, id));
      },
    };

    try {
      const result = requireSynchronous(work(tx));

      if (write) {
        spaces = nextSpaces;
        things = nextThings;
        scopeBySpace = nextScopeBySpace;
      }

      return result;
    } finally {
      live = false;
      active = false;
    }
  }

  return {
    read: (work) => run(false, work),
    write: (work) => run(true, work),

    async close() {
      if (active) {
        throw new Error("Cannot close storage during a transaction");
      }

      closed = true;
      spaces.clear();
      things.clear();
      scopeBySpace.clear();
    },
  };
}
