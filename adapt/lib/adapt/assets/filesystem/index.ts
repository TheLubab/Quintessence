import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export type StoredAsset = {
  id: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type AssetInfo = {
  id: string;
  mimeType: string;
  size: number;
};

export type AssetStore = {
  put(bytes: Uint8Array, mimeType: string): AssetInfo;
  get(id: string): StoredAsset | null;
  remove(id: string): void;
};

const ASSET_ID = /^[a-f0-9]{64}$/;
const MAX_ASSET_BYTES = 64_000_000;

function safeMime(value: string): string {
  const mime = value.trim().toLowerCase();

  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(
    mime,
  )
    ? mime
    : "application/octet-stream";
}

export function filesystemAssets(options: {
  directory: string;
}): AssetStore {
  const directory = options.directory;
  mkdirSync(directory, { recursive: true });

  function assetPath(id: string): string {
    return join(directory, id);
  }

  function metaPath(id: string): string {
    return join(directory, `${id}.json`);
  }

  return {
    put(bytes: Uint8Array, mimeType: string): AssetInfo {
      if (bytes.length === 0) {
        throw new Error("Cannot store an empty asset");
      }

      if (bytes.length > MAX_ASSET_BYTES) {
        throw new Error("The asset is larger than the 64 MB limit");
      }

      const id = createHash("sha256").update(bytes).digest("hex");
      const mime = safeMime(mimeType);
      const path = assetPath(id);
      const meta = metaPath(id);

      if (!existsSync(path) || !existsSync(meta)) {
        const temporary = `${path}.${process.pid}.tmp`;

        try {
          writeFileSync(temporary, bytes);
          renameSync(temporary, path);
          writeFileSync(meta, JSON.stringify({ mimeType: mime, size: bytes.length }));
        } catch (error) {
          rmSync(temporary, { force: true });
          throw error;
        }
      }

      return { id, mimeType: mime, size: bytes.length };
    },

    get(id: string): StoredAsset | null {
      if (!ASSET_ID.test(id)) return null;

      try {
        const bytes = new Uint8Array(readFileSync(assetPath(id)));
        const meta = JSON.parse(readFileSync(metaPath(id), "utf8")) as {
          mimeType?: unknown;
        };

        if (bytes.length === 0) return null;

        return {
          id,
          bytes,
          mimeType:
            typeof meta.mimeType === "string"
              ? safeMime(meta.mimeType)
              : "application/octet-stream",
        };
      } catch {
        return null;
      }
    },

    remove(id: string): void {
      if (!ASSET_ID.test(id)) return;

      rmSync(assetPath(id), { force: true });
      rmSync(metaPath(id), { force: true });
    },
  };
}