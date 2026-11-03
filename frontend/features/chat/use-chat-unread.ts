import { useEffect } from 'react'

import { useUiStore } from '@/frontend/store/ui'
import type { SessionInfo } from '@/shared/types'

type UseChatUnreadOptions = {
  workspaceId: string
  sessions: SessionInfo[] | undefined
  sessionId: string | null | undefined
  open: boolean
}

export function useChatUnread({ workspaceId, sessions, sessionId, open }: UseChatUnreadOptions) {
  const readVersions = useUiStore(state => state.chatReadVersions[workspaceId])
  const markRead = useUiStore(state => state.markChatSessionsRead)

  useEffect(() => {
    if (!sessions) return
    // Establish a baseline on first visit rather than marking all history unread.
    if (!readVersions) {
      markRead(
        workspaceId,
        Object.fromEntries(sessions.map(session => [session.sessionId, session.lastModified]))
      )
      return
    }
    const visible = open ? sessions.find(session => session.sessionId === sessionId) : undefined
    if (visible && visible.lastModified > (readVersions[visible.sessionId] ?? -Infinity)) {
      markRead(workspaceId, { [visible.sessionId]: visible.lastModified })
    }
  }, [workspaceId, sessions, sessionId, open, readVersions, markRead])

  return (
    !!readVersions &&
    !!sessions?.some(
      session =>
        !(open && session.sessionId === sessionId) &&
        session.lastModified > (readVersions[session.sessionId] ?? -Infinity)
    )
  )
}
