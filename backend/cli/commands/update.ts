import { defineCommand } from 'citty'
import {
  portableInstall,
  latestPortableVersion,
  installedPortableVersion,
  installPortableVersion
} from '../../portable-release'
import { isNewer } from '../../update'
import { isServerRunning } from '../control'

export const update = defineCommand({
  meta: { name: 'update', description: 'Update Quint to the latest release' },
  args: {
    check: {
      type: 'boolean',
      default: false,
      description: 'Check for an update without installing'
    }
  },
  async run({ args }) {
    const root = portableInstall()
    if (!root) throw new Error('Updates are available for portable Quint installations')
    const current = installedPortableVersion(root)
    const latest = await latestPortableVersion(root)
    if (!isNewer(latest, current)) {
      console.log('Quint is up to date')
      return
    }
    if (args.check) {
      console.log(`Update available: ${latest}`)
      process.exitCode = 1
      return
    }
    if (await isServerRunning())
      throw new Error('Use Update in Quint settings, or quit Quint first')
    await installPortableVersion(root, latest)
    console.log(`Quint ${latest} installed`)
  }
})
