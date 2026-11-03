import type { SessionUsage } from '@/shared/types'

// Subtract the snapshot taken when execution starts, not when a queued message
// is submitted. This includes every model completion in the request.
export function requestUsageSince(before: SessionUsage, after: SessionUsage): SessionUsage {
  const usd =
    after.cost && (before.cost || before.totalTokens === 0)
      ? after.cost.usd - (before.cost?.usd ?? 0)
      : undefined
  return {
    promptTokens: Math.max(0, after.promptTokens - before.promptTokens),
    outputTokens: Math.max(0, after.outputTokens - before.outputTokens),
    totalTokens: Math.max(0, after.totalTokens - before.totalTokens),
    ...(after.cacheReadTokens !== undefined
      ? { cacheReadTokens: Math.max(0, after.cacheReadTokens - (before.cacheReadTokens ?? 0)) }
      : {}),
    ...(after.cacheWriteTokens !== undefined
      ? { cacheWriteTokens: Math.max(0, after.cacheWriteTokens - (before.cacheWriteTokens ?? 0)) }
      : {}),
    // Muse can revise cumulative price estimates. Never turn a negative delta
    // into a fictitious free request, or missing pricing into a zero price.
    ...(usd !== undefined && Number.isFinite(usd) && usd >= 0
      ? { cost: { usd, partial: Boolean(before.cost?.partial || after.cost?.partial) } }
      : {})
  }
}
