import { defineCommand, runMain, showUsage } from 'citty'
import { isAgentCaller } from '../agent-caller'
import { getAppConfig } from '../app-config'
import { canUseDataDir } from '../data-dir'
import { portableInstall } from '../portable-release'
import { versionWithCommit } from '../version'
import { bundle } from './commands/bundle'
import { callServerFn } from './commands/call-server-fn'
import { check } from './commands/check'
import { config, printConfigHelp } from './commands/config'
import { debug } from './commands/debug'
import { env } from './commands/env'
import { init } from './commands/init'
import { installationCommands } from './commands/installation'
import { navigate } from './commands/navigate'
import { refresh } from './commands/refresh'
import { canvas } from './commands/canvas'
import { service } from './commands/service'
import { skill } from './commands/skill'
import { start } from './commands/start'
import { status } from './commands/status'
import { tabs } from './commands/tabs'
import { theme } from './commands/theme'
import { uiComponents } from './commands/ui-components'
import { update } from './commands/update'
import { version } from './commands/version'
import { quintlets } from './commands/quintlets'
import { image } from './commands/image'
import pc from './pc'

// The root help splits the surface by audience: workspace commands are the
// agent's day-to-day toolkit (skills tell it to run them); system commands
// manage Quint itself and are for the human at the keyboard.
const workspaceCommands = {
  image,
  bundle,
  check,
  refresh,
  quintlets,
  'call-server-fn': callServerFn,
  debug,
  theme,
  config,
  env,
  canvas,
  // Existing workspaces may still have an older skill that invokes this name.
  scratch: canvas,
  skill,
  tabs,
  navigate,
  'ui-components': uiComponents
}

const systemCommands = {
  ...(portableInstall() ? installationCommands : {}),
  init,
  start,
  status,
  service,
  update,
  version
}

const main = defineCommand({
  // A function so the git lookup runs only for `quint --version` / `--help`, not on
  // every command. citty resolves a function meta (used for --version + usage).
  meta: () => ({
    name: 'quint',
    description: 'Quint — local AI workspace',
    version: versionWithCommit()
  }),
  subCommands: { ...workspaceCommands, ...systemCommands }
})

// Cloud demo: system commands manage Quint itself (service, updates, agent
// runtimes) — in a demo container the instance is provisioned, not managed,
// so they print a pointer to the real thing instead of running. Two stay:
// `start`, because it is how the demo (container or a local test run) boots
// at all — against an already-running server it just reports and exits — and
// `version`, which is harmless and useful in bug reports.
function exitIfDemoBlocked(): void {
  const invoked = process.argv[2]
  if (!invoked || invoked === 'version' || invoked === 'start') return
  if (!(invoked in systemCommands)) return
  // The agent on a managed machine can't read the config (see below).
  if (!canUseDataDir()) return
  const config = getAppConfig()
  if (!config.demo) return
  console.log(
    '\n' +
      pc.yellow('◆') +
      ` quint ${invoked} is not available in the demo.\n` +
      pc.dim('  Get Quint on your computer: ') +
      pc.bold(config.demoInstallUrl) +
      '\n'
  )
  process.exit(1)
}

// Managed machines run the agent as its own OS user, which can't open quint's
// data folder (docs/config.md). The system commands that set up or
// run quint belong to the user that runs quint; `version` and `status` only read.
function exitIfNotQuintUser(): void {
  const invoked = process.argv[2]
  if (!invoked || invoked === 'version' || invoked === 'status') return
  if (!(invoked in systemCommands)) return
  if (canUseDataDir()) return
  console.log(
    '\n' + pc.yellow('◆') + ` quint ${invoked} is only available to the user that runs quint.\n`
  )
  process.exit(1)
}

exitIfNotQuintUser()

exitIfDemoBlocked()

type HelpCommand = { meta?: unknown }

async function commandDescription(cmd: HelpCommand): Promise<string> {
  const meta = typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta
  return (meta as { description?: string })?.description ?? ''
}

// Two-section root help (replaces citty's flat list). For a human, the
// system section carries an explicit note that agents should leave those
// commands alone; for a detected agent caller, the section is omitted
// entirely — an agent's `quint --help` shows only the workspace toolkit.
async function printMainHelp() {
  const pad =
    Math.max(...Object.keys({ ...workspaceCommands, ...systemCommands }).map(n => n.length)) + 4
  const row = async (name: string, cmd: HelpCommand) =>
    '  ' + pc.cyan(name.padEnd(pad)) + pc.dim(await commandDescription(cmd))
  console.log()
  console.log(
    pc.bold('Quint') + pc.dim(' — local AI workspace  ') + pc.dim(`v${versionWithCommit()}`)
  )
  console.log()
  console.log(pc.dim('USAGE  ') + 'quint <command> [options]')
  console.log()
  console.log(pc.bold('Workspace commands:') + pc.dim(' for agents and humans alike'))
  console.log()
  for (const [name, cmd] of Object.entries(workspaceCommands)) console.log(await row(name, cmd))
  console.log()
  if (!isAgentCaller()) {
    console.log(
      pc.bold('System commands:') + pc.dim(' manage Quint itself (server, service, updates)')
    )
    console.log(pc.yellow('  AGENTS: do not run these unless explicitly asked!'))
    console.log()
    for (const [name, cmd] of Object.entries(systemCommands)) console.log(await row(name, cmd))
    console.log()
  }
  console.log(pc.dim('Use quint <command> --help for more information about a command.'))
  console.log()
}

// Route `quint --help` (and bare `quint`) to the two-section help, and
// `quint config --help` to its terse cheat sheet; every other command keeps
// citty's default usage renderer.
runMain(main, {
  async showUsage(cmd, parent) {
    const meta = typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta
    if (meta?.name === 'quint') {
      await printMainHelp()
      return
    }
    if (meta?.name === 'config') {
      printConfigHelp()
      return
    }
    await showUsage(cmd, parent)
  }
})
