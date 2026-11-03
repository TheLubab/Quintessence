import type { WorkspaceSkillsStatus, WorkspaceSkillStatus, WorkspaceType } from '@/shared/types'

import type { AppletDeclarationFile } from '../applet-engine/declarations'
import { syncAppletDeclarations } from '../applet-engine/declarations'
import { isBehind, skillStatuses } from './version'
import { installBundledSkills } from './template'
import { skillsDirFor } from '../workspaces/init'

export type WorkspaceSkillUpdateResult = {
  before: WorkspaceSkillStatus[]
  status: WorkspaceSkillsStatus
  changedSkills: string[]
  updatedAppletTypes: AppletDeclarationFile[]
}

export function summarizeSkillStatuses(skills: WorkspaceSkillStatus[]): WorkspaceSkillsStatus {
  return {
    skills,
    updateAvailable: skills.some(skill => isBehind(skill.installed, skill.bundled))
  }
}

export async function getWorkspaceSkillsStatus(
  workspaceRoot: string,
  type?: WorkspaceType
): Promise<WorkspaceSkillsStatus> {
  return summarizeSkillStatuses(await skillStatuses(workspaceRoot, type))
}

export async function updateWorkspaceSkills(
  workspaceRoot: string,
  type: WorkspaceType = 'meta'
): Promise<WorkspaceSkillUpdateResult> {
  const before = await skillStatuses(workspaceRoot, type)
  const changedSkills = await installBundledSkills(skillsDirFor(workspaceRoot, type))
  // Applet declarations ship with the CLI, so refresh installed copies along
  // with skills.
  const updatedAppletTypes = await syncAppletDeclarations(workspaceRoot)
  const skills = await skillStatuses(workspaceRoot, type)

  return {
    before,
    status: summarizeSkillStatuses(skills),
    changedSkills,
    updatedAppletTypes
  }
}
