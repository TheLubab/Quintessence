// Is the `quint` CLI being run by a coding agent rather than a human at a
// terminal? Two tiers, following the sentry-cli SENTRY_PIPELINE lesson —
// announcement over sniffing:
//
// - QUINT_AGENT=1 is the explicit announcement for agent-owned shells.
// - META_AGENT is the external Meta runtime's marker, when it sets one.
// - CURSOR_TRACE_ID is a third-party marker that remains useful for debugging.
// Best-effort — absence proves nothing.
const AGENT_ENV_MARKERS = ['QUINT_AGENT', 'META_AGENT', 'CURSOR_TRACE_ID']

export function isAgentCaller(env: Record<string, string | undefined> = process.env): boolean {
  return AGENT_ENV_MARKERS.some(marker => !!env[marker])
}
