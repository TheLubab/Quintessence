import { defineCommand } from 'citty'

function launcherCommand(name: string, description: string) {
  return defineCommand({
    meta: { name, description },
    run() {
      throw new Error(`Run quint ${name} using the installed Quint launcher`)
    }
  })
}

export const installationCommands = {
  open: launcherCommand('open', 'Start Quint in the background and open it in your browser'),
  quit: launcherCommand('quit', 'Stop Quint started by the installed launcher'),
  doctor: launcherCommand('doctor', 'Show installation paths and Bun and Muse Code versions'),
  rollback: launcherCommand(
    'rollback',
    'Restore the previous installed release with Quint stopped'
  ),
  uninstall: defineCommand({
    meta: {
      name: 'uninstall',
      description: 'Remove Quint with Quint stopped; preserve workspaces and app data'
    },
    args: {
      yes: {
        type: 'boolean',
        description: 'Confirm removal of the application and its installed releases'
      }
    },
    run() {
      throw new Error('Run quint uninstall --yes using the installed Quint launcher')
    }
  })
}
