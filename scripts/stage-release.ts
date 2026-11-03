import { cp, mkdir, chmod } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const [target, destination, runtime] = process.argv.slice(2)
if (!target || !destination || !runtime) {
  throw new Error('Usage: stage-release.ts <platform-arch> <destination> <portable-bun>')
}
const root = resolve(import.meta.dir, '..')
const output = resolve(destination)
const windows = target.startsWith('windows-')
await mkdir(join(output, 'app'), { recursive: true })
await mkdir(join(output, 'runtime'), { recursive: true })
// Ship only runtime resources, independent of npm publication metadata.
for (const path of [
  'backend',
  'frontend',
  'shared',
  'workspace-template',
  'ui-registry',
  'registry.json',
  'bunfig.toml',
  'tsconfig.json',
  'package.json',
  'dist'
]) {
  await cp(join(root, path), join(output, 'app', path), {
    recursive: true,
    verbatimSymlinks: true,
    filter: source => {
      const path = relative(root, source).split(sep).join('/')
      return (
        !/\.test\.[cm]?[jt]sx?$/.test(path) &&
        !/^backend\/test(?:\/|$)/.test(path) &&
        !/^workspace-template\/\.quint(?:\/|$)/.test(path) &&
        path !== 'workspace-template/.env' &&
        path !== 'workspace-template/.agents/settings.local.json'
      )
    }
  })
}
await cp(join(root, 'node_modules'), join(output, 'app', 'node_modules'), {
  recursive: true,
  verbatimSymlinks: true
})
await cp(join(root, 'packaging'), join(output, 'app', 'packaging'), { recursive: true })
await cp(runtime, join(output, 'runtime', windows ? 'bun.exe' : 'bun'))
if (!windows) await chmod(join(output, 'runtime', 'bun'), 0o755)
const pkg = await Bun.file(join(root, 'package.json')).json()
await Bun.write(
  join(output, 'release.json'),
  JSON.stringify(
    {
      version: pkg.version,
      target,
      bun: pkg.packageManager.slice(4),
      museSdk: pkg.dependencies['@muse-code/sdk'],
      muse: 'official-installer',
      format: 1
    },
    null,
    2
  ) + '\n'
)
