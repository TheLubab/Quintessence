import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { PACKAGE_ROOT } from './version'

export function portableInstall(): string | undefined {
  const root = process.env.QUINT_INSTALL_ROOT
  return root && existsSync(join(PACKAGE_ROOT, '..', 'release.json')) ? root : undefined
}

function repository(root: string): string {
  const repo = readFileSync(join(root, 'repository'), 'utf8').trim()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('The Quint release repository is invalid; run the installer again')
  }
  return repo
}

export async function latestPortableVersion(root: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${repository(root)}/releases/latest`, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response.ok) throw new Error(`Could not check Quint releases (${response.status})`)
  const data = (await response.json()) as { tag_name?: unknown }
  if (typeof data.tag_name !== 'string' || !/^v\d+\.\d+\.\d+$/.test(data.tag_name)) {
    throw new Error('GitHub did not return a stable Quint release')
  }
  return data.tag_name.slice(1)
}

export function installedPortableVersion(root: string): string {
  const id = readFileSync(join(root, 'current'), 'utf8').trim()
  if (!/^v[\w.-]+$/.test(id)) throw new Error('The Quint installation pointer is invalid')
  const data = JSON.parse(readFileSync(join(root, 'releases', id, 'release.json'), 'utf8')) as {
    version: string
  }
  return data.version
}

export async function installPortableVersion(root: string, version: string): Promise<string> {
  if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) throw new Error('Invalid Quint version')
  const windows = process.platform === 'win32'
  const command = windows
    ? [
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(root, 'install.ps1')
      ]
    : ['sh', join(root, 'install.sh')]
  const child = Bun.spawn(command, {
    env: {
      ...process.env,
      QUINT_INSTALL_ROOT: root,
      ...(!windows
        ? { QUINT_BIN_DIR: dirname(readFileSync(join(root, 'command'), 'utf8').trim()) }
        : {}),
      QUINT_RELEASE_REPO: repository(root),
      QUINT_VERSION: `v${version}`,
      QUINT_NO_OPEN: '1'
    },
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit'
  })
  const code = await child.exited
  if (code !== 0)
    throw new Error(`Quint installation exited with code ${code}; run the installer again`)
  const installed = installedPortableVersion(root)
  if (installed !== version) throw new Error(`Expected Quint ${version}, found ${installed}`)
  return installed
}
