// Convert Bun's JSONC lock into hash-pinned inputs that Nix can fetch separately.
import { parseConfigFileTextToJson } from 'typescript'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const source = await Bun.file(join(root, 'bun.lock')).text()
const parsed = parseConfigFileTextToJson('bun.lock', source)
if (parsed.error) throw new Error('Could not parse bun.lock')
const lock = parsed.config as { packages: Record<string, unknown[]> }
const packages = Object.values(lock.packages).map(row => {
  const spec = String(row[0])
  const separator = spec.lastIndexOf('@')
  const name = spec.slice(0, separator)
  const version = spec.slice(separator + 1)
  const hash = row.at(-1)
  if (separator <= 0 || typeof hash !== 'string' || !hash.startsWith('sha512-')) {
    throw new Error(`Release packaging requires a registry package with integrity: ${spec}`)
  }
  if (row[1] !== '') throw new Error(`Custom registry URLs need explicit release support: ${spec}`)
  return {
    name,
    version,
    url: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`,
    hash
  }
})
const output =
  JSON.stringify(
    { lockHash: new Bun.CryptoHasher('sha256').update(source).digest('hex'), packages },
    null,
    2
  ) + '\n'
const target = join(root, 'nix', 'release-inputs.json')
if (process.argv.includes('--check')) {
  if ((await Bun.file(target).text()) !== output) {
    throw new Error('Run bun run release:inputs after changing bun.lock')
  }
} else {
  await Bun.write(target, output)
}
