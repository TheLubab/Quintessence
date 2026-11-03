// Parsers for the three MCP call shapes — these decide when a row renders as
// the server-branded MCP card instead of a plain tool row.
import type { ToolCall } from '@/shared/types'

import { prettifyShellCommand } from './shell'

export type McpRef = { server: string; tool: string; rest: string }

// Detect a `mcporter call <server>.<tool> [args...]` invocation inside a shell
// command. Accepts any prefix (env VAR=…, `$(which mcporter)`, `npx mcporter`),
// stops at the first command separator so a chained command doesn't bleed into
// `rest`. Returns null for non-`call` invocations.
export function parseMcporterCall(call: ToolCall): McpRef | null {
  const isShell = call.name === 'Bash' || call.name === 'exec' || call.name === 'bash'
  if (!isShell) return null
  const input = (call.input as Record<string, unknown>) ?? {}
  const raw = typeof input.command === 'string' ? input.command : ''
  if (!raw) return null
  // Match against the unwrapped command: providers that hand the script to
  // `/bin/bash -lc "…"` would otherwise leave escaped quotes inside `rest`.
  const command = prettifyShellCommand(raw)
  const m = command.match(
    /(?:^|\s|\$\()mcporter(?:\)?)\s+call\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)((?:\s+(?!&&|\|\||;|\|)\S+)*)/
  )
  if (!m) return null
  return { server: m[1], tool: m[2], rest: (m[3] ?? '').trim() }
}

// Native MCP tool calls arrive as `mcp__<server>__<tool>` (the server is encoded
// in the name; `caller` is `model` and `mcpServer` is unset). Server tokens use
// single underscores, so split on the FIRST `__` after the prefix.
// e.g. `mcp__notion__notion-search` → notion / notion-search.
export function parseNativeMcp(call: ToolCall): McpRef | null {
  const name = call.name
  if (!name.startsWith('mcp__')) return null
  const rest = name.slice(5)
  const i = rest.indexOf('__')
  if (i <= 0) return null
  return { server: rest.slice(0, i), tool: rest.slice(i + 2), rest: '' }
}

// Drop the redundant server prefix many MCP tools repeat — the icon + server name
// already identify it: `notion-search` → `search`, `notion-get-teams` →
// `get-teams`. Tools that don't repeat the server pass through unchanged.
export function formatMcpTool(server: string, tool: string): string {
  const lower = tool.toLowerCase()
  const sep = ['-', '_', '.'].find(s => lower.startsWith(server.toLowerCase() + s))
  return sep ? tool.slice(server.length + 1) : tool
}
