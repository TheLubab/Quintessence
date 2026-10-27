import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { Op } from "../protocol/ops";
import { SCHEMA_VERSION } from "../protocol/schema";

export interface LogEntry {
  turn: string;
  at: number;
  v: number;
  op: Op;
}

interface AliveDB extends DBSchema {
  ops: {
    key: number;
    value: LogEntry;
    indexes: { by_turn: string };
  };
}

export interface LogOptions {
  dbName?: string;
  persist?: boolean;
}

export class Log {
  private entries: LogEntry[] = [];
  private dbp: Promise<IDBPDatabase<AliveDB> | null> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly dbName: string;
  private readonly persist: boolean;

  constructor(options: LogOptions = {}) {
    this.dbName = options.dbName ?? "alive-v0";
    this.persist = options.persist ?? true;
  }

  all(): readonly LogEntry[] {
    return this.entries;
  }

  append(turn: string, op: Op): LogEntry {
    const entry: LogEntry = {
      turn,
      at: Date.now(),
      v: SCHEMA_VERSION,
      op,
    };
    this.entries.push(entry);
    if (this.persist) {
      this.writes = this.writes
        .then(async () => {
          const db = await this.open();
          if (db) await db.add("ops", entry);
        })
        .catch((err) => {
          console.warn("alive log write failed", err);
        });
    }
    return entry;
  }

  async load(): Promise<LogEntry[]> {
    if (!this.persist) return [...this.entries];
    await this.writes;
    const db = await this.open();
    if (!db) return [...this.entries];
    this.entries = await db.getAll("ops");
    return [...this.entries];
  }

  async clear(): Promise<void> {
    this.entries = [];
    if (!this.persist) return;
    this.writes = this.writes
      .then(async () => {
        const db = await this.open();
        if (db) await db.clear("ops");
      })
      .catch((err) => {
        console.warn("alive log clear failed", err);
      });
    await this.writes;
  }

  async dropLastTurn(): Promise<LogEntry[]> {
    if (!this.persist) {
      if (this.entries.length === 0) return [];
      const turn = this.entries[this.entries.length - 1].turn;
      this.entries = this.entries.filter((entry) => entry.turn !== turn);
      return [...this.entries];
    }

    if (this.entries.length === 0) await this.load();
    if (this.entries.length === 0) return [];

    const turn = this.entries[this.entries.length - 1].turn;
    this.entries = this.entries.filter((entry) => entry.turn !== turn);

    this.writes = this.writes
      .then(async () => {
        const db = await this.open();
        if (!db) return;
        const tx = db.transaction("ops", "readwrite");
        for await (const cursor of tx.store.index("by_turn").iterate(turn)) {
          await cursor.delete();
        }
        await tx.done;
      })
      .catch((err) => {
        console.warn("alive log undo failed", err);
      });

    await this.writes;
    return [...this.entries];
  }

  private open(): Promise<IDBPDatabase<AliveDB> | null> {
    if (!this.persist) return Promise.resolve(null);
    if (!this.dbp) {
      this.dbp = (async () => {
        try {
          if (typeof indexedDB === "undefined") return null;
          return await openDB<AliveDB>(this.dbName, 1, {
            upgrade(db) {
              const store = db.createObjectStore("ops", { autoIncrement: true });
              store.createIndex("by_turn", "turn");
            },
          });
        } catch (err) {
          console.warn("alive log unavailable", err);
          return null;
        }
      })();
    }
    return this.dbp;
  }
}