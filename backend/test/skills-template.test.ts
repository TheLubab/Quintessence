import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installBundledSkills } from '../skills/template'
import { updateWorkspaceSkills } from '../skills/update'

const SKILL_MD = join('quint-workspace', 'SKILL.md')
const CHEAT_SHEET = join('quint-workspace', 'references', 'UI-COMPONENTS.md')

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'quint-skills-'))
  try {
    await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('installBundledSkills', () => {
  test('installs the applet guidance and cheat sheet for every workspace', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir)

      const skillMd = await Bun.file(join(dir, SKILL_MD)).text()
      expect(skillMd).toContain('### Styling and UI components')
      expect(skillMd).toContain('references/INTENTS.md')
      const intents = await Bun.file(
        join(dir, 'quint-workspace', 'references', 'INTENTS.md')
      ).text()
      expect(intents).toContain('function addChatAttachment(input:')
      expect(intents).toContain('function sendChatMessage(input:')
      expect(intents).toContain('function navigate(url:')
      expect(intents).toContain('function resolveUrl(url:')
      expect(skillMd).toContain("resolveUrl('quint:/files/clips/intro.mp4')")
      expect(intents).not.toContain('focusTab')
      expect(skillMd).toContain('quint ui-components add')
      expect(skillMd).toContain('### Appearance and settings')
      expect(skillMd).toContain('quint theme --font=<key> --color=<key>')
      expect(skillMd).toContain('### Environment and secrets')
      expect(skillMd).toContain('quint env exec -- bun script.ts')
      expect(skillMd).toContain('quint navigate')
      expect(skillMd).not.toContain('quint tabs focus')
      expect(skillMd).not.toContain('quint tab focus')
      expect(skillMd).toContain('quint --help')
      expect(skillMd).not.toContain('quint help')
      expect(await Bun.file(join(dir, CHEAT_SHEET)).exists()).toBe(true)
      // The rest of the skill installs normally.
      expect(skillMd).toContain('# Quint workspace')
    })
  })

  test('leaves identical skill files untouched', async () => {
    await withTempDir(async dir => {
      expect(await installBundledSkills(dir)).toEqual(['quint-workspace'])
      const skillMd = join(dir, SKILL_MD)
      const fixedTime = new Date('2000-01-01T00:00:00.000Z')
      utimesSync(skillMd, fixedTime, fixedTime)
      const before = statSync(skillMd).mtimeMs

      expect(await installBundledSkills(dir)).toEqual([])
      expect(statSync(skillMd).mtimeMs).toBe(before)
    })
  })

  test('quint skill update restores changed guidance and a missing cheat sheet', async () => {
    // Skills live under <workspace>/.agents/skills —
    // updateWorkspaceSkills re-derives that from the workspace root.
    await withTempDir(async workspace => {
      const skillsDir = join(workspace, '.agents', 'skills')
      await installBundledSkills(skillsDir)

      // Simulate a locally changed skill and a missing cheat sheet.
      const skillMd = join(skillsDir, SKILL_MD)
      const stripped = (await Bun.file(skillMd).text()).replace(/### Styling and UI components/, '')
      await Bun.write(skillMd, stripped)
      rmSync(join(skillsDir, CHEAT_SHEET), { force: true })
      const result = await updateWorkspaceSkills(workspace)

      expect(result.changedSkills).toEqual(['quint-workspace'])
      expect(await Bun.file(skillMd).text()).toContain('### Styling and UI components')
      expect(await Bun.file(join(skillsDir, CHEAT_SHEET)).exists()).toBe(true)
    })
  })
})
