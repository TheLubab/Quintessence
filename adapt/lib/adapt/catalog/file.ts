import type { TypeDefinition } from "../core/contracts.ts";

export const MAX_FILE_BYTES = 50_000_000;

export type FileData = {
  assetId: string;
  title: string;
  src: string;
  mimeType: string;
  size: number;
};

export const file: TypeDefinition<FileData> = {
  name: "file",
  validate(data): data is FileData {
    if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
    const value = data as Record<string, unknown>;
    return typeof value.assetId === "string" &&
      typeof value.title === "string" &&
      typeof value.src === "string" &&
      typeof value.mimeType === "string" &&
      typeof value.size === "number" &&
      Number.isInteger(value.size) && value.size >= 0 && value.size <= MAX_FILE_BYTES;
  },
};
