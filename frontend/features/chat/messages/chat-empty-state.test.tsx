import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import {
  ChatEmptyState,
  type ChatEmptyStateKind,
  resolveChatEmptyState
} from '@/frontend/features/chat/messages/chat-empty-state'

function renderState(kind: ChatEmptyStateKind, hasWorkspaceApplets = false): string {
  return renderToStaticMarkup(
    createElement(ChatEmptyState, {
      kind,
      hasWorkspaceApplets,
      onSelectPrompt: () => undefined,
      onNavigate: () => undefined
    })
  )
}

describe('resolveChatEmptyState', () => {
  test('gives the welcome state first priority', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'dashboard',
        isQuintletDraft: false,
        hasSentMessageFromQuint: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('welcome')
  })

  test('shows the workspace exploration state for a pending imported workspace', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'dashboard',
        isQuintletDraft: false,
        hasSentMessageFromQuint: true,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('explore-workspace')
  })

  test('uses the dashboard empty state without pending analysis', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'dashboard',
        isQuintletDraft: false,
        hasSentMessageFromQuint: true,
        isWorkspacePendingAnalysis: false
      })
    ).toBe('dashboard-empty')
  })

  test('uses a separate empty state on other tabs', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'canvas',
        isQuintletDraft: false,
        hasSentMessageFromQuint: true,
        isWorkspacePendingAnalysis: false
      })
    ).toBe('tab-empty')
  })

  test('gives the pending quintlet priority', () => {
    expect(
      resolveChatEmptyState({
        tabId: 'quintlets/example',
        isQuintletDraft: true,
        hasSentMessageFromQuint: false,
        isWorkspacePendingAnalysis: true
      })
    ).toBe('quintlet-draft')
  })
})

describe('ChatEmptyState', () => {
  test('renders the selected empty state', () => {
    expect(renderState('welcome')).toContain('Ask your agent anything')
    expect(renderState('welcome')).toContain('Try an example:')
    expect(renderState('explore-workspace')).toContain(
      'Your agent can explore this workspace and suggest useful widgets and quintlets based on'
    )
    expect(renderState('explore-workspace')).toContain('Explore the workspace')
    expect(renderState('dashboard-empty')).toContain('create widgets and quintlets')
    expect(renderState('tab-empty')).toContain('manage the quintlet from here')
  })

  test('renders the focused new-quintlet prompt', () => {
    const html = renderState('quintlet-draft')

    expect(html).toContain('Describe the content, data, and key actions you need in the quintlet')
  })

  test('hides examples when the workspace already has applets', () => {
    const html = renderState('welcome', true)

    expect(html).toContain('Ask your agent anything')
    expect(html).not.toContain('Try an example:')
    expect(html).not.toContain('Check the weather')
    expect(html).not.toContain('Track my finances')
    expect(html).not.toContain('Build a playful synthesizer')
  })
})
