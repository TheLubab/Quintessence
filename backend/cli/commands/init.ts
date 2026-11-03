import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { join, resolve } from 'path'
import { PORT } from '../../constants'
import { openBrowser } from '../../open-browser'
import {
  assertWorkspaceIdAvailable,
  liftToWorkspaceRoot,
  registerWorkspace
} from '../../workspaces/registry'
import { serverCwd } from '../../server-cwd'
import { superviseServerUpdates } from '../../update'
import { PACKAGE_ROOT } from '../../version'
import { provisionWorkspace } from '../../workspaces/init'
import { isServerRunning, registerViaControl, waitForServer } from '../control'
import pc from '../pc'
import { spawnServer } from '../server'

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize workspace, copy skills and scaffold folder with widgets'
  },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Target directory (default: current)'
    },
    web: {
      type: 'boolean',
      default: false,
      description: 'Start the web server if not already running'
    },
    id: {
      type: 'string',
      description:
        'Register under this id instead of a generated one — fails if the workspace is already registered'
    }
  },
  async run({ args }) {
    const requested = resolve(args.dir)
    // Locate the workspace root first: if invoked from inside a `.quint/` (or a
    // deeper accidental `.quint/.quint/…`), lift to the directory that owns it
    // instead of scaffolding a nested workspace. This is what stops the
    // `.quint/.quint` bug at the source.
    const target = liftToWorkspaceRoot(requested)
    if (target !== requested) {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ' Ran inside ' +
          pc.bold('.quint') +
          ' — using the workspace root ' +
          pc.bold(target) +
          ' instead (no nested .quint created).'
      )
    }
    // Flag a stray nested `.quint/.quint` left by the old cwd bug — harmless but
    // confusing, and easy to remove.
    const stray = join(target, '.quint', '.quint')
    if (existsSync(stray)) {
      console.log(
        '\n' +
          pc.yellow('⚠') +
          ' Found a stray nested ' +
          pc.bold('.quint/.quint') +
          ' (from an older bug). Safe to remove:\n' +
          pc.dim('  rm -rf ' + stray)
      )
    }

    // A chosen id is only assignable at first registration, so refuse it here —
    // before any skills are copied or `.quint/` is scaffolded.
    if (args.id) {
      try {
        await assertWorkspaceIdAvailable(target, args.id)
      } catch (err) {
        console.error('\n' + pc.red('✗') + ' ' + (err as Error).message + '\n')
        process.exit(1)
      }
    }

    const projectRoot = PACKAGE_ROOT
    const isInteractive = process.stdout.isTTY

    const type = 'meta' as const

    // Provision: bundled skills + the `.quint/` bootstrap (widgets dir +
    // package.json + bun install). An existing `.quint/` is left untouched.
    console.log()
    const { scaffold, skillsDir, installLogPath } = await provisionWorkspace(target, type)
    if (scaffold !== 'exists') {
      if (scaffold === 'installing') {
        console.log(pc.dim('  Widget dependencies still installing in .quint/ (background)'))
        console.log(pc.dim('  Install log: ' + installLogPath))
      } else if (scaffold === 0) {
        console.log(pc.dim('  Installed widget dependencies in .quint/'))
      } else {
        console.warn(
          pc.yellow(`  bun install failed (exit ${scaffold}) — run it manually in .quint/`)
        )
        console.warn(pc.dim('  Install log: ' + installLogPath))
      }
    }

    // Always register the workspace in the persistent registry
    const entry = await registerWorkspace(target, {
      ...(args.id ? { id: args.id } : {}),
      type
    })

    console.log(pc.green('✓') + ' Initialized ' + pc.bold(target) + pc.dim(' (' + type + ')'))
    console.log(
      '  Skills installed to ' +
        pc.dim(skillsDir) +
        ' — ask the Meta runtime to build a widget or a quintlet to get started\n'
    )

    // If --web and server not running, start it (stay alive as wrapper)
    let running = await isServerRunning()

    if (!running && args.web) {
      console.log(pc.dim('  Starting server…'))
      const cwd = serverCwd(projectRoot, false)
      const proc = spawnServer(cwd)
      running = await waitForServer()
      if (!running) {
        console.error(pc.red('  Server failed to start\n'))
        await proc.exited
        process.exit(1)
      }
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      console.log(pc.green('✓') + ' Server started on http://localhost:' + PORT)
      if (isInteractive) console.log('  Opening ' + pc.bold(url))
      console.log(pc.dim('  Press Ctrl+C to stop\n'))
      if (isInteractive) await openBrowser(url)
      process.exit(await superviseServerUpdates(proc, () => spawnServer(cwd)))
    }

    if (running) {
      // Server already running — notify it and open (browser only in interactive mode)
      await registerViaControl(target)
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      if (isInteractive) {
        console.log('  Opening ' + pc.bold(url) + '\n')
        await openBrowser(url)
      } else {
        console.log('  Ready at ' + pc.bold(url) + '\n')
      }
      process.exit(0)
    }

    // Server not running and --web not passed
    console.log('  Run ' + pc.bold('quint start') + ' to open in the browser\n')
  }
})
