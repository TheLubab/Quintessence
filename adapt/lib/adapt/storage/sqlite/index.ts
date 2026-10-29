import { DatabaseSync } from "node:sqlite";

import type { SpaceInfo, Thing } from "../../core/contracts";

import type {
  StorageAdapter,
  StorageTransaction,
} from "../../storage/contracts";

import { requireSynchronous } from "../../storage/helpers";

/** A dedicated SQLite file. Its parent directory must already exist. */
export function sqliteStorage(options: { filename: string }): StorageAdapter {
  const db = new DatabaseSync(options.filename, {
    timeout: 5000,
  });

  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
    `);

    db.exec("BEGIN IMMEDIATE");

    const version = db.prepare("PRAGMA user_version").get()!;

    if (version.user_version === 0) {
      db.exec(`
        CREATE TABLE adapt_spaces (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL
        ) STRICT;

        CREATE TABLE adapt_things (
          space_id TEXT NOT NULL REFERENCES adapt_spaces(id),
          id TEXT NOT NULL,
          type TEXT NOT NULL,
          parent TEXT,
          data TEXT NOT NULL,
          actions TEXT NOT NULL,
          PRIMARY KEY (space_id, id),
          FOREIGN KEY (space_id, parent)
            REFERENCES adapt_things(space_id, id)
        ) STRICT;

        CREATE INDEX adapt_children
          ON adapt_things(space_id, parent, id);

        PRAGMA user_version = 1;
      `);
    } else if (version.user_version !== 1 && version.user_version !== 2) {
      throw new Error(
        `Unsupported Adapt schema version: ${version.user_version}`,
      );
    }

    if (version.user_version !== 2) {
      db.exec(`
    ALTER TABLE adapt_spaces
      ADD COLUMN scope TEXT NOT NULL DEFAULT 'personal';

    CREATE INDEX adapt_spaces_scope
      ON adapt_spaces(scope, id);

    PRAGMA user_version = 2;
  `);
    }

    db.exec("COMMIT");
  } catch (error) {
    // Closing rolls back an unfinished initialization transaction.
    db.close();
    throw error;
  }

  const statements = {
    getSpace: db.prepare(`
      SELECT id, title
      FROM adapt_spaces
      WHERE scope = ? AND id = ?
    `),

    listSpaces: db.prepare(`
      SELECT id, title
      FROM adapt_spaces
      WHERE scope = ? AND id > ?
      ORDER BY id
      LIMIT ?
    `),

    insertSpace: db.prepare(`
      INSERT INTO adapt_spaces (scope, id, title)
      VALUES (?, ?, ?)
    `),

    getThing: db.prepare(`
      SELECT id, type, parent, data, actions
      FROM adapt_things
      WHERE space_id = ? AND id = ?
    `),

    listThings: db.prepare(`
      SELECT id, type, parent, data, actions
      FROM adapt_things
      WHERE space_id = ? AND parent IS ? AND id > ?
      ORDER BY id
      LIMIT ?
    `),

    insertThing: db.prepare(`
      INSERT INTO adapt_things
        (space_id, id, type, parent, data, actions)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    updateThing: db.prepare(`
      UPDATE adapt_things
      SET type = ?, parent = ?, data = ?, actions = ?
      WHERE space_id = ? AND id = ?
    `),

    deleteThing: db.prepare(`
      DELETE FROM adapt_things
      WHERE space_id = ? AND id = ?
    `),
  };

  // These rows come from our schema.
  type Row = Record<string, unknown>;

  function spaceRow(row: Row): SpaceInfo {
    return {
      id: row.id as string,
      title: row.title as string,
    };
  }

  function thingRow(row: Row): Thing {
    return {
      id: row.id as string,
      type: row.type as string,
      parent: row.parent as string | null,
      data: JSON.parse(row.data as string) as Thing["data"],
      actions: JSON.parse(row.actions as string) as Thing["actions"],
    };
  }

  let closed = false;
  let active = false;

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
    let began = false;

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

        const row = statements.getSpace.get(scope, id);
        return row && spaceRow(row);
      },

      listSpaces(scope, query) {
        guard();

        return statements.listSpaces
          .all(scope, query.after ?? "", query.limit)
          .map(spaceRow);
      },

      getThing(spaceId, id) {
        guard();

        const row = statements.getThing.get(spaceId, id);
        return row && thingRow(row);
      },

      listThings(spaceId, parent, query) {
        guard();

        return statements.listThings
          .all(spaceId, parent, query.after ?? "", query.limit)
          .map(thingRow);
      },

      insertSpace(scope, space) {
        guard(true);

        statements.insertSpace.run(scope, space.id, space.title);
      },

      insertThing(spaceId, thing) {
        guard(true);

        statements.insertThing.run(
          spaceId,
          thing.id,
          thing.type,
          thing.parent,
          JSON.stringify(thing.data),
          JSON.stringify(thing.actions),
        );
      },

      updateThing(spaceId, thing) {
        guard(true);

        const result = statements.updateThing.run(
          thing.type,
          thing.parent,
          JSON.stringify(thing.data),
          JSON.stringify(thing.actions),
          spaceId,
          thing.id,
        );

        if (result.changes !== 1) {
          throw new Error("Thing not found");
        }
      },

      deleteThing(spaceId, id) {
        guard(true);

        statements.deleteThing.run(spaceId, id);
      },
    };

    try {
      db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      began = true;

      const result = requireSynchronous(work(tx));

      db.exec("COMMIT");

      return result;
    } catch (error) {
      if (began) {
        db.exec("ROLLBACK");
      }

      throw error;
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

      if (!closed) {
        db.close();
      }

      closed = true;
    },
  };
}
