// Skills the project ships, copied into a target workspace by `quint init`.
// The command takes a fresh or existing directory and lays down the bundled
// skill folders for the Meta runtime.
import { cp, lstat, mkdir, readFile, readdir, readlink } from 'node:fs/promises'
import { join } from 'node:path'

// Source directory for shipped templates. Resolved relative to this file so
// symlinked CLI binaries still find the source tree.
export const TEMPLATE_DIR = join(import.meta.dir, '..', '..', 'workspace-template')

// The folder holding the skill packages this CLI ships. Each subdirectory is
// one skill (e.g. `quint-workspace/`) with its own `SKILL.md`. Source of truth
// for what `quint skill update` copies and what versions it compares against.
export const BUNDLED_SKILLS_DIR = join(TEMPLATE_DIR, '.agents', 'skills')

async function matchesBundledPath(source: string, target: string): Promise<boolean> {
  const sourceStat = await lstat(source)
  const targetStat = await lstat(target).catch(() => null)
  if (!targetStat) return false

  if (sourceStat.isDirectory()) {
    if (!targetStat.isDirectory()) return false
    const entries = await readdir(source)
    const matches = await Promise.all(
      entries.map(entry => matchesBundledPath(join(source, entry), join(target, entry)))
    )
    return matches.every(Boolean)
  }

  if (sourceStat.isFile()) {
    if (!targetStat.isFile() || sourceStat.size !== targetStat.size) return false
    const [sourceContents, targetContents] = await Promise.all([readFile(source), readFile(target)])
    return sourceContents.equals(targetContents)
  }

  if (sourceStat.isSymbolicLink()) {
    if (!targetStat.isSymbolicLink()) return false
    const [sourceLink, targetLink] = await Promise.all([readlink(source), readlink(target)])
    return sourceLink === targetLink
  }

  return false
}

// Copy changed shipped skill folders into `targetSkillsDir`. Leaves identical
// skills untouched, along with unrelated directories and extra local files.
// Creates the target if missing and returns the names whose bundled files changed.
//
// UI component guidance ships with the workspace skill for every installation.
export async function installBundledSkills(targetSkillsDir: string): Promise<string[]> {
  await mkdir(targetSkillsDir, { recursive: true })
  const changedSkills: string[] = []
  const skillEntries = await readdir(BUNDLED_SKILLS_DIR, { withFileTypes: true })

  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue
    const source = join(BUNDLED_SKILLS_DIR, entry.name)
    const target = join(targetSkillsDir, entry.name)
    if (await matchesBundledPath(source, target)) continue

    await cp(source, target, { recursive: true, force: true })
    changedSkills.push(entry.name)
  }

  return changedSkills
}
