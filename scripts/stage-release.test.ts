import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

test('stages runtime resources without a license, tests, or local template state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'quint-release-'))
  roots.push(root)
  const source = join(root, 'source')
  const output = join(root, 'output')
  const fixtures = {
    'scripts/stage-release.ts': await readFile(join(import.meta.dir, 'stage-release.ts'), 'utf8'),
    'backend/cli.ts': '// runtime entry',
    'backend/module.test.ts': '// unit test',
    'backend/test/__fixtures__/fixture.ts': '// integration fixture',
    'frontend/index.html': '<html></html>',
    'shared/types.ts': 'export type Value = string',
    'workspace-template/.agents/skills/example/SKILL.md': '# Workspace skill',
    'workspace-template/.quint/.workspace.json': '{"local":true}',
    'workspace-template/.quint/.cache/thumbnail.png': 'local cache',
    'workspace-template/.env': 'SECRET=local',
    'workspace-template/.agents/settings.local.json': '{"local":true}',
    'ui-registry/button.tsx': '// installable component',
    'registry.json': '{}',
    'bunfig.toml': '',
    'tsconfig.json': '{}',
    'package.json': JSON.stringify({
      version: '1.2.3',
      packageManager: 'bun@1.4.4',
      dependencies: { '@muse-code/sdk': '1.4.12' }
    }),
    'dist/index.html': '<html>prebuilt</html>',
    'node_modules/example/index.js': '// dependency',
    'packaging/launcher.mjs': '// launcher'
  }
  for (const [path, contents] of Object.entries(fixtures)) {
    await Bun.write(join(source, path), contents)
  }
  // Use an inert runtime payload; staging copies it but never executes it.
  const runtime = join(root, 'portable-bun')
  await Bun.write(runtime, 'portable runtime')
  await mkdir(output)
  const result = Bun.spawnSync(
    [process.execPath, join(source, 'scripts/stage-release.ts'), 'windows-x64', output, runtime],
    { cwd: source, stdout: 'pipe', stderr: 'pipe' }
  )
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({
    exitCode: 0,
    stderr: ''
  })
  for (const path of [
    'backend/cli.ts',
    'frontend/index.html',
    'shared/types.ts',
    'workspace-template/.agents/skills/example/SKILL.md',
    'ui-registry/button.tsx',
    'registry.json',
    'dist/index.html',
    'node_modules/example/index.js',
    'packaging/launcher.mjs'
  ]) {
    expect(await Bun.file(join(output, 'app', path)).text()).toBe(
      fixtures[path as keyof typeof fixtures]
    )
  }
  for (const path of [
    'LICENSE',
    'backend/module.test.ts',
    'backend/test',
    'workspace-template/.quint',
    'workspace-template/.env',
    'workspace-template/.agents/settings.local.json'
  ]) {
    expect(
      await access(join(output, 'app', path)).then(
        () => true,
        () => false
      )
    ).toBe(false)
  }
  expect(await Bun.file(join(output, 'runtime/bun.exe')).text()).toBe('portable runtime')
  expect(await Bun.file(join(output, 'release.json')).json()).toEqual({
    version: '1.2.3',
    target: 'windows-x64',
    bun: '1.4.4',
    museSdk: '1.4.12',
    muse: 'official-installer',
    format: 1
  })
})
