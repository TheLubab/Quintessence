import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  LAUNCHD_LABEL,
  SERVICE_LOG_MAX_BYTES,
  analyzeInstall,
  bunOnSearchPath,
  captureServiceEnv,
  launchdPlist,
  parseLaunchdPrint,
  parseUnitBin,
  parseUnitSearchPath,
  rotateServiceLog,
  systemdUnit,
  type ServiceSpec,
  webAddress
} from '../service'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quint-service-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ---- analyzeInstall ---------------------------------------------------------

describe('analyzeInstall', () => {
  test('refuses a git checkout', () => {
    mkdirSync(join(dir, '.git'))
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    const res = analyzeInstall(dir, () => '/usr/local/bin/quint')
    expect(res.kind).toBe('checkout')
    if (res.kind === 'checkout') expect(res.reason).toContain('git checkout')
  })

  test('refuses a tree without a prebuilt frontend', () => {
    const res = analyzeInstall(dir, () => '/usr/local/bin/quint')
    expect(res.kind).toBe('checkout')
    if (res.kind === 'checkout') expect(res.reason).toContain('dist/')
  })

  test('flags a missing bin separately', () => {
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    expect(analyzeInstall(dir, () => null).kind).toBe('no-bin')
  })

  test('accepts a published global install', () => {
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist', 'index.html'), '<html/>')
    const res = analyzeInstall(dir, () => '/home/u/.bun/bin/quint')
    expect(res).toEqual({ kind: 'global', root: dir, bin: '/home/u/.bun/bin/quint' })
  })
})

// ---- captureServiceEnv ------------------------------------------------------

describe('captureServiceEnv', () => {
  const base = {
    PATH: '/usr/bin:/bin',
    // Allowlisted: system basics, quint/agent vars, proxies (either case).
    HOME: '/home/u',
    SHELL: '/bin/zsh',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    XDG_CONFIG_HOME: '/home/u/.config',
    META_API_KEY: 'sk-test',
    QUINT_DATA_DIR: '/home/u/quint-data',
    PUBLIC_TLDRAW_LICENSE_KEY: 'tlkey',
    https_proxy: 'http://proxy:3128',
    NODE_EXTRA_CA_CERTS: '/etc/corp-ca.pem',
    // Not allowlisted: arbitrary shell exports stay out of the unit.
    MY_COMPANY_TOKEN: 'hunter2',
    GOPATH: '/home/u/go',
    // Per-terminal/per-session state.
    TERM: 'xterm-256color',
    PWD: '/somewhere',
    SHLVL: '3',
    TMUX: '/tmp/tmux-1000/default,123,0',
    XDG_SESSION_ID: '42',
    XDG_RUNTIME_DIR: '/run/user/1000',
    SSH_AUTH_SOCK: '/private/tmp/com.apple.launchd.abc/Listeners',
    // Generic names that would redirect the server bind (zsh exports HOST).
    HOST: 'my-laptop.local',
    HOSTNAME: 'my-laptop',
    PORT: '9999',
    // Runtime flags the unit owns.
    QUINT_DEV: '1',
    QUINT_SERVER: '1'
  }

  test('captures the allowlist, drops everything else', () => {
    const env = captureServiceEnv(base, '/home/u/.bun/bin')
    expect(env.HOME).toBe('/home/u')
    expect(env.SHELL).toBe('/bin/zsh')
    expect(env.LC_ALL).toBe('en_US.UTF-8')
    expect(env.XDG_CONFIG_HOME).toBe('/home/u/.config')
    expect(env.META_API_KEY).toBe('sk-test')
    expect(env.QUINT_DATA_DIR).toBe('/home/u/quint-data')
    expect(env.PUBLIC_TLDRAW_LICENSE_KEY).toBe('tlkey')
    expect(env.https_proxy).toBe('http://proxy:3128')
    expect(env.NODE_EXTRA_CA_CERTS).toBe('/etc/corp-ca.pem')
    for (const key of [
      'MY_COMPANY_TOKEN',
      'GOPATH',
      'TERM',
      'PWD',
      'SHLVL',
      'TMUX',
      'XDG_SESSION_ID',
      'XDG_RUNTIME_DIR',
      'SSH_AUTH_SOCK',
      'HOST',
      'HOSTNAME',
      'PORT',
      'QUINT_DEV'
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })

  test('drops Meta runtime session runtime vars (agent-driven installs)', () => {
    const env = captureServiceEnv(
      {
        PATH: '/bin',
        RUNTIME_CHILD_SESSION: '1',
        RUNTIME_ENTRYPOINT: 'cli',
        META_AGENT: '1',
        META_API_KEY: 'sk-keep'
      },
      '/x'
    )
    expect(env).not.toHaveProperty('RUNTIME_CHILD_SESSION')
    expect(env).not.toHaveProperty('RUNTIME_ENTRYPOINT')
    expect(env).not.toHaveProperty('META_AGENT')
    expect(env.META_API_KEY).toBe('sk-keep')
  })

  test('extra keys are captured by name, still filtered for capturability', () => {
    const env = captureServiceEnv(base, '/x', ['MY_COMPANY_TOKEN', 'GOPATH'])
    expect(env.MY_COMPANY_TOKEN).toBe('hunter2')
    expect(env.GOPATH).toBe('/home/u/go')
    // Named but unset or unusable → simply absent (installService errors).
    const withBad = captureServiceEnv({ PATH: '/bin', ESC: '\x1b[1m' }, '/x', ['ESC', 'UNSET'])
    expect(withBad).not.toHaveProperty('ESC')
    expect(withBad).not.toHaveProperty('UNSET')
  })

  test('marks the process as the service-managed server', () => {
    const env = captureServiceEnv(base, '/x')
    expect(env.QUINT_SERVER).toBe('1')
    expect(env.QUINT_SERVICE).toBe('1')
  })

  test('never inherits the agent marker from an agent-run install', () => {
    const env = captureServiceEnv({ PATH: '/bin', QUINT_AGENT: '1' }, '/x')
    expect(env).not.toHaveProperty('QUINT_AGENT')
  })

  test('prepends the running bun dir to PATH and dedupes', () => {
    const env = captureServiceEnv(base, '/home/u/.bun/bin')
    expect(env.PATH).toBe('/home/u/.bun/bin:/usr/bin:/bin')
    expect(captureServiceEnv({ PATH: '/a:/a:/b' }, '/a').PATH).toBe('/a:/b')
  })

  test('drops control-character values even for allowlisted keys', () => {
    const env = captureServiceEnv(
      { PATH: '/bin', META_API_KEY: 'sk\nbroken', LC_COLORS: '\x1b[1m' },
      '/x'
    )
    expect(env).not.toHaveProperty('META_API_KEY')
    expect(env).not.toHaveProperty('LC_COLORS')
  })
})

// ---- unit file generation ---------------------------------------------------

const spec: ServiceSpec = {
  bin: '/home/u/.bun/bin/quint',
  env: {
    PATH: '/home/u/.bun/bin:/usr/bin',
    QUINT_SERVER: '1',
    QUINT_SERVICE: '1',
    TRICKY: 'a"b\\c%d & <e>'
  },
  cwd: '/home/u',
  logPath: '/home/u/.local/share/quint/logs/server.log'
}

describe('launchdPlist', () => {
  const plist = launchdPlist(spec)

  test('execs the quint bin directly — argv[0] names the login item', () => {
    // No /bin/sh wrapper: macOS shows argv[0]'s basename as the login item,
    // and "sh" from an unidentified developer is what users would see.
    expect(plist).toContain(
      '<key>ProgramArguments</key>\n\t<array>\n\t\t<string>/home/u/.bun/bin/quint</string>\n\t\t<string>start</string>\n\t</array>'
    )
    expect(plist).not.toContain('/bin/sh')
  })

  test('restarts on crash but not after a deliberate clean exit', () => {
    expect(plist).toContain('<key>KeepAlive</key>')
    expect(plist).toContain('<key>SuccessfulExit</key>\n\t\t<false/>')
    expect(plist).toContain('<key>RunAtLoad</key>\n\t<true/>')
    // Backstop for crashes that bypass the exit-0 guard: at most one respawn
    // a minute.
    expect(plist).toContain('<key>ThrottleInterval</key>\n\t<integer>60</integer>')
  })

  test('captures env with XML escaping', () => {
    expect(plist).toContain('<key>TRICKY</key>')
    expect(plist).toContain('<string>a"b\\c%d &amp; &lt;e&gt;</string>')
  })

  test('redirects stdout and stderr to the log file', () => {
    expect(plist).toContain(`<key>StandardOutPath</key>\n\t<string>${spec.logPath}</string>`)
    expect(plist).toContain(`<key>StandardErrorPath</key>\n\t<string>${spec.logPath}</string>`)
  })

  test('uses the stable label and a neutral working directory', () => {
    expect(plist).toContain(`<string>${LAUNCHD_LABEL}</string>`)
    expect(plist).toContain('<key>WorkingDirectory</key>\n\t<string>/home/u</string>')
  })
})

describe('systemdUnit', () => {
  const unit = systemdUnit(spec)

  test('execs the quint bin directly with start', () => {
    expect(unit).toContain('ExecStart="/home/u/.bun/bin/quint" start')
  })

  test('restarts on failure with a start limit instead of looping forever', () => {
    expect(unit).toContain('Restart=on-failure')
    expect(unit).toContain('StartLimitIntervalSec=60')
    expect(unit).toContain('StartLimitBurst=5')
    expect(unit).toContain('RestartSec=2')
  })

  test('escapes env values for systemd quoting rules', () => {
    // `\` doubles, `"` escapes, `%` doubles (specifier expansion).
    expect(unit).toContain('Environment="TRICKY=a\\"b\\\\c%%d & <e>"')
  })

  test('starts on login via default.target and stops cleanly', () => {
    expect(unit).toContain('WantedBy=default.target')
    expect(unit).toContain('TimeoutStopSec=10')
  })
})

describe('parseUnitBin', () => {
  test('round-trips the exec path out of both formats', () => {
    expect(parseUnitBin(launchdPlist(spec), 'darwin')).toBe(spec.bin)
    expect(parseUnitBin(systemdUnit(spec), 'linux')).toBe(spec.bin)
  })

  test('round-trips a path needing escaping', () => {
    const odd: ServiceSpec = { ...spec, bin: '/od d/10%/m&oi' }
    expect(parseUnitBin(launchdPlist(odd), 'darwin')).toBe(odd.bin)
    expect(parseUnitBin(systemdUnit(odd), 'linux')).toBe(odd.bin)
  })

  test('returns null on unrecognized content', () => {
    expect(parseUnitBin('not a unit', 'darwin')).toBeNull()
    expect(parseUnitBin('not a unit', 'linux')).toBeNull()
  })
})

describe('parseUnitSearchPath + bunOnSearchPath', () => {
  test('round-trips the captured PATH out of both formats', () => {
    expect(parseUnitSearchPath(launchdPlist(spec), 'darwin')).toBe(spec.env.PATH)
    expect(parseUnitSearchPath(systemdUnit(spec), 'linux')).toBe(spec.env.PATH)
  })

  test('finds bun only when a captured dir still holds it', () => {
    mkdirSync(join(dir, 'has-bun'), { recursive: true })
    writeFileSync(join(dir, 'has-bun', 'bun'), '#!/bin/sh\n')
    expect(bunOnSearchPath(`${join(dir, 'empty')}:${join(dir, 'has-bun')}`)).toBe(true)
    expect(bunOnSearchPath(join(dir, 'empty'))).toBe(false)
    expect(bunOnSearchPath('')).toBe(false)
  })
})

describe('parseLaunchdPrint', () => {
  test('running service with pid', () => {
    const out = 'system info\n\tstate = running\n\tpid = 4242\n'
    expect(parseLaunchdPrint(out)).toEqual({ state: 'running', pid: 4242, detail: null })
  })

  test('multi-word "not running" maps to idle', () => {
    // Real launchctl print emits multi-word states — the exact shape a user
    // sees after a deliberate exit-0 startup failure left the job loaded.
    const out = '\tstate = not running\n\tlast exit code = 0\n'
    expect(parseLaunchdPrint(out)).toEqual({ state: 'idle', pid: null, detail: null })
  })

  test('other multi-word states pass through verbatim', () => {
    expect(parseLaunchdPrint('\tstate = spawn scheduled\n').state).toBe('spawn scheduled')
  })
})

// ---- log rotation -----------------------------------------------------------

describe('rotateServiceLog', () => {
  test('copies then truncates once past the cap', async () => {
    const log = join(dir, 'server.log')
    writeFileSync(log, 'x'.repeat(SERVICE_LOG_MAX_BYTES + 1))
    expect(await rotateServiceLog(log)).toBe(true)
    expect((await Bun.file(log).arrayBuffer()).byteLength).toBe(0)
    expect((await Bun.file(log + '.old').arrayBuffer()).byteLength).toBe(SERVICE_LOG_MAX_BYTES + 1)
  })

  test('leaves a small log alone', async () => {
    const log = join(dir, 'server.log')
    writeFileSync(log, 'small')
    expect(await rotateServiceLog(log)).toBe(false)
    expect(await Bun.file(log).text()).toBe('small')
  })

  test('is a no-op when the log does not exist', async () => {
    expect(await rotateServiceLog(join(dir, 'nope.log'))).toBe(false)
  })
})

// ---- running-server address -------------------------------------------------

describe('webAddress', () => {
  const info = { version: '1.0.0', pid: 1, port: 12345, service: false }

  test('is the local URL when the server listens on a port', () => {
    expect(webAddress(info)).toBe('http://localhost:12345')
  })
})
