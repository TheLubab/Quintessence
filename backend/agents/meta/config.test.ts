import { describe, expect, test } from 'bun:test'

import { findMuseBinary, metaAvailability, readMetaRuntimeConfig } from './config'

describe('Muse Code config', () => {
  test('defaults to the muse binary and serve mode', () => {
    expect(readMetaRuntimeConfig({})).toEqual({
      museBin: 'muse',
      args: [
        'serve',
        '--trust-workspace',
        '--sandbox-network',
        'enabled',
        '-c',
        'run.reminder_roster={"agents":[]}'
      ]
    })
  })

  test('forwards the binary, API key, args, and shutdown budget', () => {
    expect(
      readMetaRuntimeConfig({
        MUSE_BIN: '/opt/muse',
        META_API_KEY: ' secret ',
        MUSE_ARGS: 'serve, --verbose',
        MUSE_SHUTDOWN_TIMEOUT_MS: '5000'
      })
    ).toEqual({
      museBin: '/opt/muse',
      args: [
        'serve',
        '--verbose',
        '--trust-workspace',
        '--sandbox-network',
        'enabled',
        '-c',
        'run.reminder_roster={"agents":[]}'
      ],
      apiKey: 'secret',
      shutdownTimeoutMs: 5000
    })
  })

  test('allows explicitly opting back into background observers', () => {
    expect(readMetaRuntimeConfig({ MUSE_BACKGROUND_OBSERVERS: '1' }).args).not.toContain(
      'run.reminder_roster={"agents":[]}'
    )
  })

  test('preserves an explicit network policy without adding conflicting flags', () => {
    for (const policy of [
      '--sandbox-network, restricted',
      '--sandbox-network=proxy-only',
      '--disable-sandbox'
    ]) {
      const args = readMetaRuntimeConfig({ MUSE_ARGS: `serve, ${policy}` }).args
      expect(args).not.toContain('enabled')
      expect(args).toContain('--trust-workspace')
    }
  })

  test('finds an executable binary and reports availability', () => {
    const bin = process.execPath
    expect(
      findMuseBinary({
        museBin: bin,
        args: ['serve', '--trust-workspace', '--sandbox-network', 'enabled']
      })
    ).toBe(bin)
    expect(metaAvailability({ MUSE_BIN: bin })).toEqual({ status: 'available' })
    expect(metaAvailability({ MUSE_BIN: '/definitely/missing/muse' })).toMatchObject({
      status: 'unavailable'
    })
  })
})
