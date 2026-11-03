// Which quintlets the workspace keeps mounted, and for how long.
//
// A quintlet is not remounted on every tab switch. The one on screen is visible,
// recently-visited ones stay mounted but hidden — DOM, component state, and
// styles intact — so coming back inside the retention window is instant. Past
// the window the quintlet is disposed and the next visit re-loads it behind the
// splash. The cap bounds what fast tab-cycling can pin in memory: the least
// recently visited quintlet is dropped first.
//
// The policy is pure so the timing rules stay testable; QuintletManager owns the
// clock and the timers.

export const QUINTLET_RETENTION_MS = 60_000
export const MAX_RESIDENT_QUINTLETS = 4

export type ResidentQuintlet = {
  id: string
  // When the quintlet stopped being the active one — null while it is active. The
  // retention deadline is measured from here, and it is set ONCE per departure:
  // re-running the policy must not restart the clock.
  releasedAt: number | null
}

type ReconcileInput = {
  // The quintlet the active tab names, or null when another tab is on screen —
  // which releases every resident, so parking on the chat expires them too.
  activeId: string | null
  // Quintlet ids that still exist. A deleted quintlet is dropped immediately; its
  // bundle is gone and its parked DOM would only hold dead styles.
  available: ReadonlySet<string>
  now: number
}

// The resident set after promoting the active quintlet and expiring the rest.
// Ordered most-recently-active first, so the cap drops the coldest quintlet.
export function reconcileResidents(
  residents: readonly ResidentQuintlet[],
  { activeId, available, now }: ReconcileInput
): ResidentQuintlet[] {
  const next: ResidentQuintlet[] = []
  if (activeId !== null && available.has(activeId)) next.push({ id: activeId, releasedAt: null })

  for (const resident of residents) {
    if (resident.id === activeId || !available.has(resident.id)) continue
    const releasedAt = resident.releasedAt ?? now
    if (now - releasedAt >= QUINTLET_RETENTION_MS) continue
    if (next.length >= MAX_RESIDENT_QUINTLETS) break
    next.push({ id: resident.id, releasedAt })
  }

  return next
}

// Milliseconds until the next resident falls out of the retention window, or
// null when nothing is on the clock (every resident is active). QuintletManager
// arms a single timer on this instead of one timer per quintlet.
export function nextEvictionDelay(residents: readonly ResidentQuintlet[], now: number): number | null {
  let earliest: number | null = null
  for (const { releasedAt } of residents) {
    if (releasedAt === null) continue
    const deadline = releasedAt + QUINTLET_RETENTION_MS
    if (earliest === null || deadline < earliest) earliest = deadline
  }
  return earliest === null ? null : Math.max(0, earliest - now)
}

// Whether a reconcile changed anything — lets the caller keep the previous
// array identity and skip the re-render (and the timer effect it would rerun).
export function sameResidents(a: readonly ResidentQuintlet[], b: readonly ResidentQuintlet[]): boolean {
  return (
    a.length === b.length &&
    a.every((resident, index) => {
      const other = b[index]
      return resident.id === other.id && resident.releasedAt === other.releasedAt
    })
  )
}
