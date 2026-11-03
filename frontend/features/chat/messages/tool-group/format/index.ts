// Formatting utils for tool rows: turn a raw ToolCall into the display name
// and one-line brief. Meta's runtime uses normal tool names; provider-specific
// vocabularies can be layered in here later.
import type { ToolCall } from '@/shared/types'

import { getInputValue, makeShortenPaths, toolInput, type ToolFormatter } from './shared'

export { formatDuration } from './shared'
export { formatMcpTool, parseMcporterCall, parseNativeMcp, type McpRef } from './mcp'

const metaFormatter: ToolFormatter = {
  displayName: call => call.name,
  brief: (call, shorten) => {
    const input = toolInput(call)
    for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']) {
      const value = getInputValue(input, key)
      if (value) return shorten(value)
    }
    return ''
  }
}

// Calls persisted before the provider field existed still render.
function formatterFor(_call: ToolCall): ToolFormatter {
  return metaFormatter
}

export function getToolDisplayName(call: ToolCall): string {
  return formatterFor(call).displayName(call)
}

export function formatInputBrief(call: ToolCall, cwd: string | null): string {
  return formatterFor(call).brief(call, makeShortenPaths(cwd))
}
