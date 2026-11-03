import type { SessionFork, StreamEvent } from '@/shared/types'
import { applyEvents } from '@/shared/format'

export class ForkUnsupportedError extends Error {}

export function inheritedHistoryBoundary(
  events: StreamEvent[]
): Pick<SessionFork, 'throughMessageId' | 'noticeIds'> {
  const quintlet = applyEvents(events)
  return {
    throughMessageId: quintlet.turns.at(-1)?.id,
    noticeIds: quintlet.notices.map(notice => notice.id)
  }
}
