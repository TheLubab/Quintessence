import { VERSION } from '../version'
import pc from './pc'

// The CLI-vs-server freshness check, shared by `quint status` and `quint update`:
// compares this CLI's version against what the running server reports over the
// control port. Works no matter how the upgrade happened (`quint update` or a
// manual package-manager install) — the comparison reads live state, it does
// not live inside the update command.
export function versionMismatchNotice(serverVersion: string): string | null {
  if (serverVersion === VERSION) return null
  return (
    pc.yellow('⚠') +
    ` Server is running v${serverVersion}, this CLI is v${VERSION}.\n` +
    pc.dim('  Restart to match: `quint service restart` (service) or Ctrl-C + `quint start`.')
  )
}
