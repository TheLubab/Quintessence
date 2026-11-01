import { DatabaseSync } from "node:sqlite";

import type { Enrichment, EnrichmentStore } from "./contracts.ts";

function decode<T>(value: unknown): T {
  return JSON.parse(value as string) as T;
}

export function sqliteEnrichments(options: {
  filename: string;
}): EnrichmentStore {
  const db = new DatabaseSync(options.filename, { timeout: 5000 });

  try {
    db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS adapt_enrichments (
        scope TEXT NOT NULL,
        space_id TEXT NOT NULL,
        thing_id TEXT NOT NULL,
        state TEXT NOT NULL,
        record TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scope, space_id, thing_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS adapt_enrichments_state
        ON adapt_enrichments(state, updated_at);
    `);
  } catch (error) {
    db.close();
    throw error;
  }

  const statements = {
    get: db.prepare(`
      SELECT record FROM adapt_enrichments
      WHERE scope = ? AND space_id = ? AND thing_id = ?
    `),

    put: db.prepare(`
      INSERT INTO adapt_enrichments
        (scope, space_id, thing_id, state, record, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (scope, space_id, thing_id)
      DO UPDATE SET
        state = excluded.state,
        record = excluded.record,
        updated_at = excluded.updated_at
    `),

    remove: db.prepare(`
      DELETE FROM adapt_enrichments
      WHERE scope = ? AND space_id = ? AND thing_id = ?
    `),

    active: db.prepare(`
      SELECT scope, space_id, record FROM adapt_enrichments
      WHERE state IN ('queued', 'running')
    `),
  };

  let closed = false;

  function assertOpen(): void {
    if (closed) throw new Error("Enrichment storage is closed");
  }

  return {
    get(scope, spaceId, thingId): Enrichment | undefined {
      assertOpen();

      const row = statements.get.get(scope, spaceId, thingId) as
        | Record<string, unknown>
        | undefined;

      return row ? decode<Enrichment>(row.record) : undefined;
    },

    put(scope, spaceId, enrichment): void {
      assertOpen();

      statements.put.run(
        scope,
        spaceId,
        enrichment.thingId,
        enrichment.status,
        JSON.stringify(enrichment),
        enrichment.updatedAt,
      );
    },

    remove(scope, spaceId, thingId): void {
      assertOpen();
      statements.remove.run(scope, spaceId, thingId);
    },

    interruptRunning(now, message): number {
      assertOpen();

      const rows = statements.active
        .all()
        .map((row: Record<string, unknown>) => ({
          scope: row.scope as string,
          spaceId: row.space_id as string,
          record: decode<Enrichment>(row.record),
        }));

      for (const row of rows) {
        const enrichment: Enrichment = {
          ...row.record,
          status: "failed",
          error: {
            code: "INTERRUPTED",
            message,
          },
          updatedAt: now,
        };

        statements.put.run(
          row.scope,
          row.spaceId,
          enrichment.thingId,
          enrichment.status,
          JSON.stringify(enrichment),
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

export type SqliteEnrichments = ReturnType<typeof sqliteEnrichments>;