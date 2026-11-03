// Muse Code host configuration.
//
// Quint drives an external `muse serve` host over the Muse Session Protocol
// (MSP). The binary owns the model loop, tools, approvals, and durable session
// history; Quint is the workspace UI and transcript renderer.
import { existsSync } from 'node:fs'

import type { HarnessAvailability } from '@/shared/types'

export type MetaRuntimeConfig = {
  museBin: string
  args: string[]
  apiKey?: string
  shutdownTimeoutMs?: number
}

function parseArgs(raw: string | undefined): string[] {
  // Comma-separated is enough for the common `serve --flag` shape and avoids a
  // shell-quoting dependency. Advanced users can point MUSE_BIN at a wrapper.
  const args = (raw?.trim() || 'serve')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  if (!args.includes('--trust-workspace')) args.push('--trust-workspace')
  // Adding a model or verbose flag must not silently restore Muse's isolated
  // proxy-only network. Preserve an explicitly selected sandbox policy.
  if (
    !args.includes('--disable-sandbox') &&
    !args.some(arg => arg === '--sandbox-network' || arg.startsWith('--sandbox-network='))
  ) {
    args.push('--sandbox-network', 'enabled')
  }
  return args
}

export function readMetaRuntimeConfig(
  env: Record<string, string | undefined> = process.env
): MetaRuntimeConfig {
  const shutdownRaw = Number(env.MUSE_SHUTDOWN_TIMEOUT_MS)
  const shutdownTimeoutMs =
    Number.isInteger(shutdownRaw) && shutdownRaw >= 0 && shutdownRaw <= 2147483647
      ? shutdownRaw
      : undefined

  return {
    museBin: env.MUSE_BIN?.trim() || 'muse',
    args: [
      ...parseArgs(env.MUSE_ARGS),
      // Muse otherwise starts observer model calls alongside every main turn.
      // Keep these opt-in for a workspace UI where even small edits are frequent.
      ...(env.MUSE_BACKGROUND_OBSERVERS === '1' ? [] : ['-c', 'run.reminder_roster={"agents":[]}'])
    ],
    ...(env.META_API_KEY?.trim() ? { apiKey: env.META_API_KEY.trim() } : {}),
    ...(shutdownTimeoutMs !== undefined ? { shutdownTimeoutMs } : {})
  }
}

export function findMuseBinary(config = readMetaRuntimeConfig()): string | null {
  if (config.museBin.includes('/') || config.museBin.includes('\\')) {
    return existsSync(config.museBin) ? config.museBin : null
  }
  const onPath = Bun.which(config.museBin)
  if (onPath) return onPath

  // GUI-launched and service-managed servers often miss the shell PATH where
  // the Muse installer puts the binary.
  const home = process.env.HOME
  const candidates = [
    ...(home ? [`${home}/.local/bin/${config.museBin}`] : []),
    `/usr/local/bin/${config.museBin}`,
    `/opt/homebrew/bin/${config.museBin}`
  ]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}

export function metaAvailability(
  env: Record<string, string | undefined> = process.env
): HarnessAvailability {
  const config = readMetaRuntimeConfig(env)
  if (findMuseBinary(config)) return { status: 'available' }
  return {
    status: 'unavailable',
    reason: `Muse Code was not found (${config.museBin}). Install it from https://dev.meta.ai/products/muse-code or set MUSE_BIN.`
  }
}
