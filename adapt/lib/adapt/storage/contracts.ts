import type { SpaceInfo, Thing } from "../core/contracts.ts";

/** Already validated by the runtime; limit includes pagination lookahead. */
export type StorageList = {
  limit: number;
  after: string | null;
};

export interface StorageReader {
  getSpace(scope: string, id: string): SpaceInfo | undefined;

  listSpaces(scope: string, options: StorageList): SpaceInfo[];

  getThing(spaceId: string, id: string): Thing | undefined;

  listThings(
    spaceId: string,
    parent: string | null,
    options: StorageList,
  ): Thing[];
}

export interface StorageTransaction extends StorageReader {
  insertSpace(scope: string, space: SpaceInfo): void;

  insertThing(spaceId: string, thing: Thing): void;

  updateThing(spaceId: string, thing: Thing): void;

  deleteThing(spaceId: string, id: string): void;
}

/**
 * Trusted persistence boundary.
 *
 * Callbacks must be synchronous and must not retain their transaction.
 * Reads see a consistent snapshot.
 * Writes commit atomically or roll back on throw.
 * Records returned or retained by adapters must be detached copies.
 */
export interface StorageAdapter {
  read<T>(work: (reader: StorageReader) => T): Promise<T>;

  write<T>(work: (transaction: StorageTransaction) => T): Promise<T>;

  close(): Promise<void>;
}
