export function parseDataUrl(src: string): {
  mimeType: string;
  bytes: Uint8Array;
} | null {
  if (!src.startsWith("data:")) return null;

  const comma = src.indexOf(",");
  if (comma < 0) return null;

  const header = src.slice(5, comma);
  const payload = src.slice(comma + 1);
  const parts = header.split(";");
  const mimeType = parts[0] || "application/octet-stream";
  const base64 = parts.includes("base64");

  try {
    const bytes = base64
      ? new Uint8Array(Buffer.from(payload, "base64"))
      : new Uint8Array(Buffer.from(decodeURIComponent(payload), "utf8"));

    return bytes.length === 0 ? null : { mimeType, bytes };
  } catch {
    return null;
  }
}

export function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function assetSource(id: string): string {
  return `/api/adapt/assets/${id}`;
}

export function isAssetSource(src: string): boolean {
  return /^\/api\/adapt\/assets\/[a-f0-9]{64}$/.test(src);
}

export function assetIdFromSource(src: string): string | null {
  const match = /^\/api\/adapt\/assets\/([a-f0-9]{64})$/.exec(src);

  return match ? match[1]! : null;
}