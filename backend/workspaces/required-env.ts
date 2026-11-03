// The env "required" quintlet aggregates `config.requiredEnv` declared by both
// widgets and quintlets, each key mapped to the bundle ids that asked for it.
// Shared by the env API (backend/http/index.ts) and control-port handlers.
import { collectQuintletRequiredEnv } from '../applet-engine/quintlets'
import { collectRequiredEnv } from '../applet-engine/widgets'

export async function requiredEnvFor(workspacePath: string): Promise<Record<string, string[]>> {
  const [widgets, quintlets] = await Promise.all([
    collectRequiredEnv(workspacePath),
    collectQuintletRequiredEnv(workspacePath)
  ])
  const out: Record<string, string[]> = {}
  for (const map of [widgets, quintlets]) {
    for (const [key, ids] of Object.entries(map)) {
      out[key] = [...(out[key] ?? []), ...ids]
    }
  }
  return out
}
