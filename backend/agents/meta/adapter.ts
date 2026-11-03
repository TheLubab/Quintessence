// Muse Code item frames -> Quint's shared display format.
//
// The MSP fold already gives us stable item revisions. Each item becomes one
// long-lived Turn keyed by its item id, so a revision replaces the previous
// rendering instead of appending a duplicate row. Consecutive assistant turns
// are grouped by the client (see groupTurns).
import type { FoldedItem } from '@muse-code/sdk'

import type { Part, ToolCall, ToolState, Turn } from '@/shared/format'
import { splitAttachments, attachmentParts } from '@/shared/quint-attachments'
import { stripQuintContext } from '@/shared/quint-context'

type TurnHints = {
  optimisticId?: string
  model?: string
}

function parseArgs(raw: string | undefined): unknown {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function toolState(status: string): ToolState {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
    case 'rejected':
    case 'timedOut':
    case 'cancelled':
      return 'error'
    case 'inProgress':
      return 'running'
    default:
      return 'running'
  }
}

function toolPart(item: FoldedItem): ToolCall {
  return {
    toolCallId: item.callId ?? item.itemId,
    name: item.tool ?? item.displayLabel?.active ?? 'Tool',
    caller: 'model',
    provider: 'meta',
    state: toolState(String(item.status)),
    input: parseArgs(item.args),
    ...(item.visibleOutput !== undefined ? { output: item.visibleOutput } : {}),
    ...(item.failureReason ? { errorText: item.failureReason } : {})
  }
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function userText(item: FoldedItem): string {
  const raw = textOf(item.displayText) ?? textOf(item.text) ?? ''
  return splitAttachments(stripQuintContext(raw)).text
}

function userAttachmentParts(item: FoldedItem): Part[] {
  const nativeImages: Part[] = (item.attachments ?? []).map(attachment => ({
    type: 'file-attachment',
    mediaType: attachment.mediaType,
    label:
      attachment.width && attachment.height
        ? `Image ${attachment.width}×${attachment.height}`
        : 'Image'
  }))
  // displayText omits internal attachment metadata; recover it from the stored input.
  const { attachments } = splitAttachments(stripQuintContext(item.text ?? ''))
  return attachmentParts(attachments, nativeImages)
}

function itemParts(item: FoldedItem): Part[] | null {
  switch (item.kind) {
    case 'userMessage': {
      const text = userText(item)
      const parts = userAttachmentParts(item)
      if (text) parts.push({ type: 'text', text })
      return parts
    }
    case 'agentMessage': {
      const text = textOf(item.text) ?? ''
      return text ? [{ type: 'text', text }] : []
    }
    case 'reasoning': {
      const text = item.summary?.join('\n') ?? textOf(item.text) ?? ''
      return [{ type: 'reasoning', text, ...(text ? {} : { redacted: true }) }]
    }
    case 'toolCall':
      return [{ type: 'tool-call', call: toolPart(item) }]
    case 'userShell':
      return [
        {
          type: 'tool-call',
          call: {
            toolCallId: item.itemId,
            name: 'shell',
            caller: 'model',
            provider: 'meta',
            state: toolState(String(item.status)),
            input: { command: item.commandText ?? '' },
            ...(item.visibleOutput !== undefined ? { output: item.visibleOutput } : {}),
            ...(item.failureReason ? { errorText: item.failureReason } : {})
          }
        }
      ]
    case 'webSearch': {
      const query = textOf(item.text) ?? textOf(item.fallbackText)
      return [
        {
          type: 'tool-call',
          call: {
            toolCallId: item.itemId,
            name: 'web_search',
            caller: 'model',
            provider: 'meta',
            state: toolState(String(item.status)),
            input: query ? { query } : {}
          }
        }
      ]
    }
    case 'subagent':
    case 'workflow': {
      const description =
        textOf(item.fallbackText) ??
        textOf(item.objective) ??
        textOf(item.message) ??
        textOf(item.monitorDescription) ??
        String(item.kind)
      const subagentStatus =
        item.status === 'completed'
          ? 'completed'
          : item.status === 'failed' || item.status === 'rejected'
            ? 'failed'
            : item.status === 'cancelled'
              ? 'stopped'
              : 'running'
      const result = item.result as { summary?: string; text?: string } | undefined
      return [
        {
          type: 'tool-call',
          call: {
            toolCallId: item.itemId,
            name: String(item.kind),
            caller: 'subagent',
            provider: 'meta',
            state: toolState(String(item.status)),
            input: { description },
            ...(result?.summary || result?.text ? { output: result.summary ?? result.text } : {}),
            subagent: {
              taskId: item.subagentId ?? item.itemId,
              description,
              progress: item.statusLine ? [item.statusLine] : [],
              status: subagentStatus,
              ...(item.usage
                ? {
                    usage: {
                      totalTokens: item.usage.inputTokens + item.usage.outputTokens,
                      ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {})
                    }
                  }
                : {}),
              transcript: []
            }
          }
        }
      ]
    }
    case 'sideChat':
    case 'reminderChild':
    case 'monitorFeed':
    case 'compaction':
    case 'hookRun':
    case 'damagedRange':
    case 'earlierHistory':
    case 'scheduledFire':
    case 'backgroundTerminalCompletion':
    case 'overdueNotice':
      return null
    default: {
      const text = textOf(item.fallbackText) ?? String(item.kind)
      return [{ type: 'text', text }]
    }
  }
}

export function itemToTurn(item: FoldedItem, hints: TurnHints = {}): Turn | null {
  const parts = itemParts(item)
  if (!parts || parts.length === 0) return null

  const isUser = item.kind === 'userMessage'

  const usage = item.usage
  return {
    id: `meta:${item.itemId}`,
    role: isUser ? 'user' : 'assistant',
    origin: isUser ? { kind: 'user-input' } : { kind: 'tool-return', toolCallId: item.itemId },
    parts,
    ...(item.recordedAt ? { timestamp: item.recordedAt } : {}),
    meta: {
      provider: 'meta',
      ...(isUser && hints.optimisticId ? { optimisticId: hints.optimisticId } : {}),
      ...(hints.model ? { model: hints.model } : {}),
      ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
      ...(item.kind === 'agentMessage' || item.kind === 'reasoning'
        ? { apiMessageId: item.itemId }
        : {}),
      ...(usage
        ? {
            usage: {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.inputTokens + usage.outputTokens
            }
          }
        : {})
    }
  }
}
