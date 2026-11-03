// The one place that knows how to turn a directory into a Quint workspace:
// bundled skills + the `.quint/` scaffold, with the skills location keyed on the
// agent backend. `quint init` and the HTTP API (UI import / create) both
// provision through here, so a workspace set up from the UI is
// indistinguishable from one set up via the CLI.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorkspaceType } from '@/shared/types'
export { validateWorkspaceFolderName } from '@/shared/workspace-name'

import { harnessFor } from '../agents/registry'
import { createDependencyInstallLogPath, scaffoldQuintDir } from './scaffold'
import { installBundledSkills } from '../skills/template'

// Where the workspace runtime loads skills from. The harness owns the answer;
// Meta workspaces use the Agent Skills standard directory.
export function skillsDirFor(workspaceRoot: string, type?: WorkspaceType): string {
  return harnessFor(type).skillsDir?.(workspaceRoot) ?? join(workspaceRoot, '.agents', 'skills')
}

export type ProvisionResult = {
  // Where the skills were installed (backend-dependent, see skillsDirFor).
  skillsDir: string
  // 'exists' when `.quint/` was already bootstrapped, 'installing' when bun
  // install continues in the background, else the install exit code (non-zero
  // means deps are missing — not fatal, the agent installs on demand).
  scaffold: 'exists' | 'installing' | number
  // Unique temporary log for this install attempt; unused when scaffold exists.
  installLogPath: string
}

// Lay down everything a workspace needs: create the folder, copy the bundled
// skills into the backend's skills dir, and bootstrap `.quint/`. Idempotent —
// re-running refreshes skills and leaves an existing `.quint/` untouched.
// Registration in the workspace registry is a separate, caller-owned step.
export async function provisionWorkspace(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<ProvisionResult> {
  const skillsDir = skillsDirFor(workspaceRoot, type)
  await mkdir(workspaceRoot, { recursive: true })
  await installBundledSkills(skillsDir)
  const installLogPath = createDependencyInstallLogPath()
  const scaffold = await scaffoldQuintDir(workspaceRoot, undefined, undefined, installLogPath)
  return { skillsDir, scaffold, installLogPath }
}
