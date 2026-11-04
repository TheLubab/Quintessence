// Runs with the private Bun runtime. Keep installation state outside app data.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  openSync,
  closeSync,
  chmodSync
} from 'node:fs'
import { rm, rename } from 'node:fs/promises'
import { join, resolve, dirname, delimiter, sep } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'

const app = resolve(import.meta.dir, '..')
const release = resolve(app, '..')
const root = process.env.QUINT_INSTALL_ROOT
if (!root) throw new Error('Start Quint using its installed launcher')
const windows = process.platform === 'win32'
const museDir = join(root, 'muse')
process.env.PATH = [join(release, 'runtime'), museDir, process.env.PATH]
  .filter(Boolean)
  .join(delimiter)
if (!process.env.MUSE_BIN) {
  if (windows) {
    const version = readFileSync(join(museDir, '.muse-version'), 'utf8').trim()
    if (!/^[\w.-]+$/.test(version))
      throw new Error('Invalid Muse Code version; run the installer again')
    process.env.MUSE_BIN = join(museDir, `muse-bin-${version}.exe`)
  } else {
    process.env.MUSE_BIN = join(museDir, 'muse')
  }
}

const { queryServerInfo, webAddress } = await import('../backend/service.ts')
const { openBrowser } = await import('../backend/open-browser.ts')
const commandFile = join(root, 'command')
const command = existsSync(commandFile)
  ? readFileSync(commandFile, 'utf8').trim()
  : join(root, 'bin', windows ? 'quint.cmd' : 'quint')
const args = process.argv.slice(2)
const action = args[0] || 'open'
const stateFile = join(root, 'launcher.json')

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return undefined
  }
}

async function openQuint() {
  let info = await queryServerInfo(300)
  if (info && info.installRoot !== root)
    throw new Error(
      'Another Quint installation is running; quit it before opening this installation'
    )
  if (!info) {
    const logs = join(root, 'logs')
    mkdirSync(logs, { recursive: true })
    const log = openSync(join(logs, 'server.log'), 'a')
    const child = spawn(process.execPath, [join(app, 'backend', 'cli.ts'), 'start'], {
      cwd: homedir(),
      env: process.env,
      detached: true,
      stdio: ['ignore', log, log],
      windowsHide: true
    })
    const started = new Promise((accept, reject) => {
      child.once('spawn', accept)
      child.once('error', reject)
    })
    closeSync(log)
    await started
    child.unref()
    for (let attempt = 0; attempt < 60; attempt++) {
      info = await queryServerInfo(200)
      if (info) break
      await Bun.sleep(250)
    }
    if (!info) throw new Error(`Quint could not start. See ${join(logs, 'server.log')}`)
    writeFileSync(
      stateFile,
      JSON.stringify({ supervisorPid: child.pid, serverPid: info.pid, version: info.version })
    )
  }
  const url = webAddress(info)
  console.log(`Opening Quint: ${url}`)
  await openBrowser(url)
}

async function quitQuint() {
  const info = await queryServerInfo(300)
  if (!info) return
  const state = readState()
  // After a UI update the supervisor survives and the server PID changes.
  // Check the supervisor still exists before allowing a managed child to stop.
  if (!state?.supervisorPid || info.service || info.installRoot !== root) {
    throw new Error('Stop this Quint using its terminal or quint service before continuing')
  }
  try {
    process.kill(state.supervisorPid, 0)
  } catch {
    throw new Error('This server was started elsewhere; stop it there before continuing')
  }
  process.kill(info.pid, 'SIGTERM')
  for (let attempt = 0; attempt < 40; attempt++) {
    if (!(await queryServerInfo(100))) {
      await rm(stateFile, { force: true })
      console.log('Quint stopped')
      return
    }
    await Bun.sleep(250)
  }
  throw new Error('Quint is still shutting down; try again shortly')
}

async function shortcuts(startup = false, remove = false) {
  if (windows) {
    const child = Bun.spawn(
      [
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(import.meta.dir, 'shortcuts.ps1'),
        ...(startup ? ['-Startup'] : []),
        ...(remove ? ['-Remove'] : [])
      ],
      {
        env: { ...process.env, QUINT_COMMAND: command },
        stdout: 'inherit',
        stderr: 'inherit'
      }
    )
    if ((await child.exited) !== 0) throw new Error('Could not configure the Quint shortcut')
  } else if (process.platform === 'darwin') {
    const bundle = join(homedir(), 'Applications', 'Quint.app', 'Contents')
    if (remove) {
      await rm(dirname(bundle), { recursive: true, force: true })
      return
    }
    mkdirSync(join(bundle, 'MacOS'), { recursive: true })
    writeFileSync(
      join(bundle, 'Info.plist'),
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleName</key><string>Quint</string><key>CFBundleIdentifier</key><string>run.quint.launcher</string><key>CFBundleExecutable</key><string>quint</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>'
    )
    writeFileSync(
      join(bundle, 'MacOS', 'quint'),
      `#!/bin/sh\nexec '${command.replaceAll("'", "'\\''")}' open\n`
    )
    chmodSync(join(bundle, 'MacOS', 'quint'), 0o755)
  } else {
    const directory = join(
      process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
      'applications'
    )
    const file = join(directory, 'quint.desktop')
    if (remove) {
      await rm(file, { force: true })
      return
    }
    mkdirSync(directory, { recursive: true })
    const escaped = command
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('`', '\\`')
      .replaceAll('$', '\\$')
      .replaceAll('%', '%%')
    writeFileSync(
      file,
      `[Desktop Entry]\nType=Application\nName=Quint\nComment=Local AI workspace\nExec="${escaped}" open\nTerminal=false\nCategories=Utility;\n`
    )
  }
}

async function runCli() {
  process.argv = [process.execPath, join(app, 'backend', 'cli.ts'), ...args]
  await import('../backend/cli.ts')
}

async function main() {
  // Help must reach the CLI before launcher commands can change installation state.
  if (args.includes('--help') || args.includes('-h')) return runCli()
  if (action === 'open') return openQuint()
  if (action === 'quit') return quitQuint()
  if (action === 'shortcuts') return shortcuts()
  if (action === 'service' && windows) {
    if (args[1] === 'install') {
      await shortcuts(true)
      return openQuint()
    }
    if (args[1] === 'uninstall') return shortcuts(true, true)
    throw new Error(
      'On Windows, use quint service install or quint service uninstall to manage start at sign-in'
    )
  }
  if (action === 'rollback') {
    if (await queryServerInfo(300)) throw new Error('Quit Quint before rolling back')
    const previous = readFileSync(join(root, 'previous'), 'utf8').trim()
    if (
      !/^v[\w.-]+$/.test(previous) ||
      !existsSync(join(root, 'releases', previous, 'release.json'))
    ) {
      throw new Error('No previous release is available')
    }
    const current = readFileSync(join(root, 'current'), 'utf8')
    writeFileSync(join(root, 'current.new'), previous + '\n')
    await rename(join(root, 'current.new'), join(root, 'current'))
    writeFileSync(join(root, 'previous'), current)
    console.log('Previous release restored. Open Quint from your applications')
    return
  }
  if (action === 'uninstall') {
    if (!release.startsWith(join(resolve(root), 'releases') + sep)) {
      throw new Error(
        'The running application is outside its installation; use the installed Quint command'
      )
    }
    if (!args.includes('--yes'))
      throw new Error(
        'Run quint uninstall --yes to remove the application; workspaces and user data will be preserved'
      )
    if (await queryServerInfo(300))
      throw new Error('Quit Quint and remove its sign-in service before uninstalling')
    await shortcuts(false, true)
    if (windows) await shortcuts(true, true)
    // Do not delete workspaces, the application DATA_DIR, or Muse credentials.
    // Windows cannot delete the currently running Bun executable. Use a separate
    // PowerShell process that waits for us to exit first.
    const uninstall = join(import.meta.dir, 'uninstall.ps1')
    if (windows) {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          uninstall,
          '-InstallRoot',
          root,
          '-CommandPath',
          command,
          '-ParentPid',
          String(process.pid)
        ],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }
      )
      child.unref()
    } else {
      const { serviceUnitPath } = await import('../backend/service.ts')
      if (existsSync(serviceUnitPath()))
        throw new Error('Run quint service uninstall before uninstalling Quint')
      await rm(command, { force: true })
      await rm(root, { recursive: true, force: true })
    }
    console.log('Quint removed. Your workspaces and user data have been preserved')
    return
  }
  if (action === 'doctor') {
    console.log(
      `Quint installation: ${root}\nBun: ${Bun.version}\nMuse: ${process.env.MUSE_BIN}\nLogs: ${join(root, 'logs')}`
    )
    const child = Bun.spawn([process.env.MUSE_BIN, '--version'], {
      stdout: 'inherit',
      stderr: 'inherit'
    })
    process.exit(await child.exited)
  }
  // Keep the full workspace CLI available to people and agent tools.
  return runCli()
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Quint: ${message}`)
  if (action === 'open') {
    try {
      let dialog
      if (windows) {
        dialog = Bun.spawn(
          [
            'powershell.exe',
            '-NoProfile',
            '-Command',
            '$shell = New-Object -ComObject WScript.Shell; $null = $shell.Popup($env:QUINT_LAUNCH_ERROR, 0, "Quint", 16)'
          ],
          {
            env: { ...process.env, QUINT_LAUNCH_ERROR: message },
            stdout: 'ignore',
            stderr: 'ignore'
          }
        )
      } else if (process.platform === 'darwin') {
        dialog = Bun.spawn(
          [
            'osascript',
            '-e',
            'on run argv\ndisplay dialog (item 1 of argv) with title "Quint" buttons {"OK"} default button "OK"\nend run',
            message
          ],
          { stdout: 'ignore', stderr: 'ignore' }
        )
      } else if (Bun.which('zenity')) {
        dialog = Bun.spawn(['zenity', '--error', '--title=Quint', `--text=${message}`], {
          stdout: 'ignore',
          stderr: 'ignore'
        })
      }
      if (dialog) await dialog.exited
    } catch {
      /* stderr remains available when the desktop has no dialog tool */
    }
  }
  process.exitCode = 1
}
