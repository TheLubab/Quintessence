import { describe, expect, test } from 'bun:test'
import type { FoldedItem } from '@muse-code/sdk'

import { renderQuintContext } from '@/shared/quint-context'

import { itemToTurn } from './adapter'

function item(overrides: Record<string, unknown>): FoldedItem {
  return {
    itemId: 'item-1',
    kind: 'agentMessage',
    revision: 1,
    status: 'inProgress',
    ...overrides
  } as unknown as FoldedItem
}

describe('Muse item adapter', () => {
  test('keeps the durable user message id and identifies its optimistic echo', () => {
    const turn = itemToTurn(item({ kind: 'userMessage', text: 'hello', displayText: 'hello' }), {
      optimisticId: 'optimistic-1'
    })

    expect(turn).toMatchObject({
      id: 'meta:item-1',
      meta: { optimisticId: 'optimistic-1' },
      role: 'user',
      origin: { kind: 'user-input' }
    })
  })

  test('maps tool calls with parsed args and status', () => {
    const turn = itemToTurn(
      item({
        kind: 'toolCall',
        tool: 'Bash',
        args: '{"command":"ls"}',
        status: 'completed',
        visibleOutput: 'file.txt'
      })
    )

    expect(turn?.parts[0]).toMatchObject({
      type: 'tool-call',
      call: {
        name: 'Bash',
        provider: 'meta',
        state: 'success',
        input: { command: 'ls' },
        output: 'file.txt'
      }
    })
  })

  test('carries the assistant message id for preview reconciliation', () => {
    const turn = itemToTurn(item({ kind: 'agentMessage', text: 'hi' }))
    expect(turn?.meta?.apiMessageId).toBe('item-1')
  })
})

test('hides Muse reminder children from the transcript', () => {
  expect(
    itemToTurn(item({ kind: 'reminderChild', fallbackText: 'Reminder child session' }))
  ).toBeNull()
})

test('strips the quint context envelope from user text when displayText is absent', () => {
  const turn = itemToTurn(
    item({
      kind: 'userMessage',
      text: `hello\n\n${renderQuintContext({ activeTab: { id: 'dashboard' } })}`
    })
  )
  expect(turn?.parts).toEqual([{ type: 'text', text: 'hello' }])
})

test('replays user image attachments as file chips', () => {
  const turn = itemToTurn(
    item({
      kind: 'userMessage',
      text: 'look',
      attachments: [{ type: 'image', mediaType: 'image/png', width: 640, height: 480 }]
    })
  )
  expect(turn?.parts[0]).toEqual({
    type: 'file-attachment',
    mediaType: 'image/png',
    label: 'Image 640×480'
  })
})

test('hides Muse side chats instead of rendering fallback text', () => {
  expect(itemToTurn(item({ kind: 'sideChat', fallbackText: 'side chat' }))).toBeNull()
})

test('keeps web search queries', () => {
  const turn = itemToTurn(item({ kind: 'webSearch', text: 'muse code sdk', status: 'completed' }))
  expect(turn?.parts[0]).toMatchObject({
    type: 'tool-call',
    call: { name: 'web_search', input: { query: 'muse code sdk' } }
  })
})

test('renders subagents as subagent cards with their result', () => {
  const turn = itemToTurn(
    item({
      kind: 'subagent',
      itemId: 'task-1',
      subagentId: 'sub-1',
      objective: 'Inspect the repository',
      status: 'completed',
      result: { summary: 'Found three files' },
      usage: { inputTokens: 10, outputTokens: 5 }
    })
  )
  expect(turn?.parts[0]).toMatchObject({
    type: 'tool-call',
    call: {
      caller: 'subagent',
      name: 'subagent',
      output: 'Found three files',
      subagent: {
        taskId: 'sub-1',
        description: 'Inspect the repository',
        status: 'completed',
        usage: { totalTokens: 15 }
      }
    }
  })
})

test('replays file and text attachment metadata even when displayText hides it', () => {
  const turn = itemToTurn(
    item({
      kind: 'userMessage',
      displayText: 'Review this',
      text: 'Review this\n\n<quint-attachments>\n[{"type":"file","path":"/tmp/report.csv","mediaType":"text/csv"},{"type":"text","label":"Selection","text":"selected text"}]\n</quint-attachments>'
    })
  )
  expect(turn?.parts).toEqual([
    expect.objectContaining({
      type: 'file-attachment',
      label: 'report.csv',
      path: '/tmp/report.csv'
    }),
    expect.objectContaining({ type: 'text-attachment', label: 'Selection', text: 'selected text' }),
    { type: 'text', text: 'Review this' }
  ])
})
