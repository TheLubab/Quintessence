import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { WorkspaceLayoutContext } from '@/frontend/features/workspace/workspace-layout-context'
import { createDefaultWorkspaceLayout } from '@/shared/workspace-layout'
import type { CompiledQuintlet } from '@/shared/types'

import { QuickAccessWidget } from './quick-access-widget'

const noop = () => {}

function render(quintlets: CompiledQuintlet[], showOnboarding = true): string {
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        WorkspaceLayoutContext.Provider,
        {
          value: {
            layout: createDefaultWorkspaceLayout(),
            setLayout: noop,
            name: null,
            cwd: null,
            provider: 'meta',
            workspaceId: 'workspace',
            isLoading: false
          }
        },
        createElement(QuickAccessWidget, {
          quintlets,
          onOpenQuintlet: noop,
          onCreateQuintlet: noop,
          showOnboarding
        })
      )
    )
  )
}

describe('QuickAccessWidget', () => {
  test('renders quintlet launchers in the supplied order', () => {
    const html = render([
      { id: 'roadmap', status: 'compiled', title: 'Roadmap', icon: 'calendar' },
      { id: 'reports', status: 'compiled', title: 'Reports', icon: 'chart' }
    ])

    expect(html.indexOf('Roadmap')).toBeLessThan(html.indexOf('Reports'))
    expect(html).toContain('>Quick access</h2>')
    expect(html).toContain('aria-label="Open Roadmap"')
    expect(html).toContain('aria-label="Open Reports"')
    expect(html).toContain('aria-label="View actions for Roadmap"')
    expect(html.indexOf('Reports')).toBeLessThan(html.indexOf('New quintlet'))
    expect(html).toContain('aria-label="Create new quintlet"')
    expect(html).not.toContain('Keep quintlets and useful websites close at hand')
  })

  test('offers links and quintlets before a shortcut exists', () => {
    const html = render([])

    expect(html).toContain('New quintlet')
    expect(html).toContain('>Quick access</h2>')
    expect(html).toContain('aria-label="Create new quintlet"')
    expect(html).toContain('aria-label="Add link"')
    expect(html).toContain('Keep quintlets and useful websites close at hand')
  })

  test('hides the empty-state hint outside onboarding', () => {
    const html = render([], false)

    expect(html).toContain('aria-label="Create new quintlet"')
    expect(html).not.toContain('Keep quintlets and useful websites close at hand')
  })
})
