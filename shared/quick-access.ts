import type { QuickAccessLink } from './types'

export function normalizeQuickAccessUrl(value: string): string | undefined {
  const input = value.trim()
  if (!input) return undefined
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.href
  } catch {
    return undefined
  }
}

export function normalizeQuickAccessLinks(value: unknown): QuickAccessLink[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const links: QuickAccessLink[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const link = entry as Record<string, unknown>
    if (typeof link.id !== 'string' || !link.id.trim() || seen.has(link.id)) continue
    if (typeof link.url !== 'string') continue
    const url = normalizeQuickAccessUrl(link.url)
    if (!url) continue
    const title = typeof link.title === 'string' ? link.title.trim() : ''
    links.push({ id: link.id, title: title || new URL(url).hostname, url })
    seen.add(link.id)
  }
  return links
}
