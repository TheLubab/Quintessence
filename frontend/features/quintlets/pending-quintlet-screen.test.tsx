import { afterEach, expect, mock, test } from 'bun:test'
import { PendingQuintletScreen } from './pending-quintlet-screen'
import { renderTestUi } from '@/frontend/test/render'
import type { PendingQuintlet } from '@/shared/types'

let cleanup = async () => {}
afterEach(() => cleanup())

test.each(['draft', 'starting', 'building', 'waiting', 'failed'] as const)(
  '%s only offers recovery actions when the agent is idle or startup failed',
  async state => {
    const openChat = mock(() => {})
    const discard = mock(() => {})
    const pending: PendingQuintlet = {
      id: 'draft-1',
      requirements: '',
      buildSessionId: 'session-1',
      status: state === 'building' || state === 'waiting' ? 'submitted' : state
    }
    const ui = await renderTestUi(
      <PendingQuintletScreen
        active
        pendingQuintlet={pending}
        running={state === 'building'}
        workspaceId="workspace-1"
        onContinueInChat={() => {}}
        onOpenChat={openChat}
        onDiscard={discard}
      />
    )
    cleanup = ui.cleanup
    const recovery = state === 'waiting' || state === 'failed'
    const names = [...ui.document.querySelectorAll('button')].map(button =>
      button.textContent?.trim()
    )
    expect(names.includes('Open chat')).toBe(recovery)
    expect(names.includes('Discard quintlet')).toBe(recovery)
    if (recovery) {
      await ui.click(ui.button('Open chat'))
      await ui.click(ui.button('Discard quintlet'))
      expect(openChat).toHaveBeenCalledTimes(1)
      expect(discard).toHaveBeenCalledTimes(1)
    }
    expect(ui.document.querySelector('canvas')).not.toBeNull()
    // The sketch becomes inert during startup/build/recovery, rather than disappearing.
    const inertSurface = ui.document.querySelector('[inert]')
    expect(Boolean(inertSurface)).toBe(state !== 'draft')
  }
)
