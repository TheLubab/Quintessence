// Prepare the offline browser runtime from locked dependencies. Called by
// dependency setup, the Nix development shell, and the Nix release build.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

console.log('Preparing browser assets...')
await import('./bundle-react-runtime')

const require = createRequire(import.meta.url)
const source = dirname(require.resolve('emojibase-data/package.json'))
const destination = join(import.meta.dir, '..', 'frontend', '.build', 'vendor', 'emojibase', 'en')
for (const name of ['data.json', 'messages.json']) {
  await Bun.write(join(destination, name), Bun.file(join(source, 'en', name)))
}
