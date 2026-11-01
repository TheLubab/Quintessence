import { DatabaseSync } from "node:sqlite";

import type { Operation } from "./core/actions.ts";

function decode<T>(value: unknown): T {
  return JSON.parse(value as string) as T;
}

export function sqliteDataStore(options: { filename: string }) {
  const db = new DatabaseSync(options.filename, { timeout: 5000 });

  try {
    db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS adapt_operations (
        scope TEXT NOT NULL,
        space_id TEXT NOT NULL,
        id TEXT NOT NULL,
        state TEXT NOT NULL,
        record TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope, space_id, id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS adapt_operations_state
        ON adapt_operations(state, updated_at);
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const statements = {
    getOperation: db.prepare(`
      SELECT record FROM adapt_operations
      WHERE scope = ? AND space_id = ? AND id = ?
    `),

    putOperation: db.prepare(`
      INSERT INTO adapt_operations
        (scope, space_id, id, state, record, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (scope, space_id, id)
      DO UPDATE SET
        state = excluded.state,
        record = excluded.record,
        updated_at = excluded.updated_at
    `),

    runningOperations: db.prepare(`
      SELECT scope, space_id, record FROM adapt_operations
      WHERE state = 'running'
    `),
  };

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("Data storage is closed");
  }

  return {
    getOperation(
      scope: string,
      spaceId: string,
      id: string,
    ): Operation | undefined {
      assertOpen();

      const row = statements.getOperation.get(scope, spaceId, id);

      return row ? decode<Operation>(row.record) : undefined;
    },

    putOperation(
      scope: string,
      spaceId: string,
      operation: Operation,
    ): void {
      assertOpen();

      statements.putOperation.run(
        scope,
        spaceId,
        operation.id,
        operation.status,
        JSON.stringify(operation),
        operation.status === "running"
          ? operation.startedAt
          : operation.finishedAt,
      );
    },

    interruptRunning(now: number, message: string): number {
      assertOpen();

      const rows = statements.runningOperations
        .all()
        .map((row: Record<string, unknown>) => ({
          scope: row.scope as string,
          spaceId: row.space_id as string,
          record: decode<Operation>(row.record),
        }));

      for (const row of rows) {
        const operation: Operation = {
          id: row.record.id,
          capability: row.record.capability,
          targets: row.record.targets,
          input: row.record.input,
          startedAt: row.record.startedAt,
          status: "failed",
          finishedAt: now,
          error: {
            code: "INTERRUPTED",
            message,
          },
        };

        statements.putOperation.run(
          row.scope,
          row.spaceId,
          operation.id,
          operation.status,
          JSON.stringify(operation),
          now,
        );
      }

      return rows.length;
    },

    close(): void {
      if (closed) return;

      closed = true;
      db.close();
    },
  };
}

export type DataStore = ReturnType<typeof sqliteDataStore>;