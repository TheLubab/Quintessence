import { describe, expect, test } from 'bun:test'

import { renderQuintContext } from '@/shared/quint-context'
import { quintletBuildDirectives } from '@/shared/quintlet-build-directives'

describe('quintlet build directives', () => {
  test('supply quintlet-specific context without repeating the build workflow', () => {
    const context = renderQuintContext({
      activeTab: { id: 'quintlets/garden' },
      directives: quintletBuildDirectives('garden', ['chart', 'calendar'])
    })
    expect(context).toContain('The user is on the "garden" quintlet tab')
    expect(context).toContain('# This message only\nBuild a new quintlet from this message.')
    expect(context).toContain('pending quintlet steps in the quint-workspace skill')
    expect(context).toContain('The quintlet id is `garden`.')
    expect(context).toContain('`.quint/quintlets/garden.tsx`')
    expect(context).toContain('Available quintlet icons: chart, calendar')
    expect(context).toContain('quint quintlets set garden --title "<title>" --icon <icon-id>')
    expect(context).toContain('quint quintlets create --requirements "<complete requirements>"')
    expect(context).not.toContain('--from-session')
    expect(context).toContain('[Open the quintlet](quint:/quintlets/garden)')
    expect(context).not.toContain('quint check')
    expect(context).not.toContain('quint bundle')
  })
})
