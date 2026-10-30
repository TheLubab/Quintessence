/** Routes cross-origin URLs through the dev-only proxy in vite.config.ts. */
export function proxyUrl(url: string): string {
  if (!import.meta.env.DEV) return url;
  return `/__proxy?url=${encodeURIComponent(url)}`;
}