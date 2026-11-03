import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { CONTROL_PORT } from '../../constants'
import { PACKAGE_ROOT } from '../../version'

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

// Agent shells can use a different PATH and drop QUINT_* variables. Bind their
// CLI to this server's installation and endpoint instead of a global install
// or the Nix wrapper's current-directory fallback.
export async function metaCliEnv(
  workspacePath: string,
  path: string | undefined
): Promise<Record<string, string>> {
  const identity = new Bun.CryptoHasher('sha256')
    .update(`${PACKAGE_ROOT}:${process.execPath}:${CONTROL_PORT}`)
    .digest('hex')
    .slice(0, 16)
  const bin = join(workspacePath, '.quint', '.cache', 'agent-bin', identity)
  await mkdir(bin, { recursive: true })
  const windows = process.platform === 'win32'
  const cli = join(bin, windows ? 'quint.cmd' : 'quint')
  if (windows) {
    await writeFile(
      cli,
      [
        '@echo off',
        `set "QUINT_CONTROL_PORT=${CONTROL_PORT}"`,
        'set "QUINT_AGENT=1"',
        `"${process.execPath}" "${join(PACKAGE_ROOT, 'backend', 'cli.ts')}" %*`,
        ''
      ].join('\r\n')
    )
    return { PATH: [bin, path].filter(Boolean).join(delimiter), QUINT_ROOT: PACKAGE_ROOT }
  }
  await writeFile(
    cli,
    [
      '#!/bin/sh',
      `export QUINT_CONTROL_PORT=${quote(String(CONTROL_PORT))}`,
      'export QUINT_AGENT=1',
      `exec ${quote(process.execPath)} ${quote(join(PACKAGE_ROOT, 'backend', 'cli.ts'))} "$@"`,
      ''
    ].join('\n')
  )
  await chmod(cli, 0o755)
  return { PATH: [bin, path].filter(Boolean).join(delimiter), QUINT_ROOT: PACKAGE_ROOT }
}
