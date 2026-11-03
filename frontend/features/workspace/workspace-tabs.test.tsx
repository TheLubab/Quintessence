import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ChatRoundDotsIcon, Widget2Icon } from '@solar-icons/react/linear'
import { describe, expect, test } from 'bun:test'

import { WorkspaceTabs } from '@/frontend/features/workspace/workspace-tabs'

describe('WorkspaceTabs', () => {
  test('renders Dashboard without drag attributes and keeps other tabs reorderable', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        tabs: [
          {
            key: 'quintlets/test',
            Icon: ChatRoundDotsIcon,
            label: 'Test quintlet'
          },
          {
            key: 'dashboard',
            Icon: Widget2Icon,
            label: 'Dashboard',
            reorderable: false,
            loading: true
          },
          {
            key: 'canvas',
            Icon: Widget2Icon,
            label: 'Canvas'
          }
        ],
        active: 'quintlets/test',
        createItems: [],
        onSelect: () => undefined,
        onClose: () => undefined,
        onReorder: () => undefined
      })
    )

    expect(html).toContain('data-slot="spinner"')
    const dashboardButton = html.match(/<button[^>]*aria-label="Dashboard"[^>]*>/)?.[0]
    const quintletButton = html.match(/<button[^>]*aria-label="Test quintlet"[^>]*>/)?.[0]
    expect(dashboardButton).not.toContain('aria-roledescription')
    expect(quintletButton).toContain('aria-roledescription="sortable item"')
  })
})
