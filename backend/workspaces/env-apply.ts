// The one place an env change takes effect. Env is frozen at spawn, so after
// any write — the settings UI's PUT /env or a CLI `quint env set`/`unset`
// relayed over the control port — the workspace's processes must be reaped and
// every connected client told to refetch. Both entry points call this so the
// side effects can never drift apart.
import { harnessStore } from '../agents/auth'
import { publishEvent } from '../events'
import { restartWorker } from '../applet-engine/functions'
import { allHarnesses } from '../agents/registry'

export function applyEnvChanged(workspace: { id: string; path: string }): void {
  // Kill the cached widget worker (next RPC respawns with fresh env) and tear
  // down idle agent sessions (busy ones keep their snapshot until turn end).
  restartWorker(workspace.path)
  for (const h of allHarnesses()) h.onEnvChanged?.(workspace.path)
  harnessStore.invalidate(workspace)
  publishEvent({ type: 'env:updated', workspaceId: workspace.id })
}
