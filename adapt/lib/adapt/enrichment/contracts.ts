import type { Value } from "../core/contracts.ts";

export type EnrichmentStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "skipped";

export type EnrichmentError = {
  readonly code: string;
  readonly message: string;
};

export type Enrichment = {
  readonly thingId: string;
  readonly status: EnrichmentStatus;
  readonly summary: string | null;
  readonly description: string | null;
  readonly text: string | null;
  readonly data: Value | null;
  readonly model: string | null;
  readonly error: EnrichmentError | null;
  readonly updatedAt: number;
};

export interface EnrichmentStore {
  get(scope: string, spaceId: string, thingId: string): Enrichment | undefined;

  put(scope: string, spaceId: string, enrichment: Enrichment): void;

  remove(scope: string, spaceId: string, thingId: string): void;

  interruptRunning?(now: number, message: string): number;

  close?(): void;
}