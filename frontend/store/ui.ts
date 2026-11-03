import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

// Per-browser UI preferences and onboarding markers, persisted to localStorage
// so they survive reloads. Server-backed per-user app state belongs in DATA_DIR.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromQuint: boolean
  workspaceIdsPendingAnalysis: string[]
  composerDrafts: Record<string, string>
  popupChatWidth: number
  dockedChatWidth: number
  workspaceChatOpen: Record<string, boolean>
  chatReadVersions: Record<string, Record<string, number>>
  autoOpenedChatWorkspaces: string[]
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromQuint: (workspaceId: string) => void
  markChatAutoOpened: (workspaceId: string) => void
  setComposerDraft: (key: string, value: string | null) => void
  moveComposerDraft: (from: string, to: string) => void
  setPopupChatWidth: (width: number) => void
  setDockedChatWidth: (width: number) => void
  setWorkspaceChatOpen: (workspaceId: string, open: boolean) => void
  markChatSessionsRead: (workspaceId: string, versions: Record<string, number>) => void
}

export const createUiStore = (storage?: StateStorage) =>
  create<UiStore>()(
    persist(
      set => ({
        discoveredWorkspacesOpen: true,
        hasSentMessageFromQuint: false,
        workspaceIdsPendingAnalysis: [],
        composerDrafts: {},
        popupChatWidth: 440,
        dockedChatWidth: 440,
        workspaceChatOpen: {},
        chatReadVersions: {},
        autoOpenedChatWorkspaces: [],
        setDiscoveredWorkspacesOpen: open => set({ discoveredWorkspacesOpen: open }),
        markWorkspacePendingAnalysis: workspaceId =>
          set(state => {
            const workspaceIds = state.workspaceIdsPendingAnalysis ?? []
            return {
              workspaceIdsPendingAnalysis: workspaceIds.includes(workspaceId)
                ? workspaceIds
                : [...workspaceIds, workspaceId]
            }
          }),
        markChatAutoOpened: workspaceId =>
          set(state => {
            const workspaceIds = state.autoOpenedChatWorkspaces ?? []
            return {
              autoOpenedChatWorkspaces: workspaceIds.includes(workspaceId)
                ? workspaceIds
                : [...workspaceIds, workspaceId]
            }
          }),
        markMessageSentFromQuint: workspaceId =>
          set(state => ({
            hasSentMessageFromQuint: true,
            workspaceIdsPendingAnalysis: (state.workspaceIdsPendingAnalysis ?? []).filter(
              id => id !== workspaceId
            )
          })),
        setComposerDraft: (key, value) =>
          set(state => {
            if (
              value === null ? !(key in state.composerDrafts) : state.composerDrafts[key] === value
            )
              return state
            const composerDrafts = { ...state.composerDrafts }
            if (value === null) delete composerDrafts[key]
            else composerDrafts[key] = value
            return { composerDrafts }
          }),
        moveComposerDraft: (from, to) =>
          set(state => {
            if (from === to || !(from in state.composerDrafts)) return state
            const composerDrafts = { ...state.composerDrafts }
            composerDrafts[to] ??= composerDrafts[from]
            delete composerDrafts[from]
            return { composerDrafts }
          }),
        setPopupChatWidth: width => set({ popupChatWidth: width }),
        setDockedChatWidth: width =>
          set(state => {
            if (!Number.isFinite(width)) return state
            const next = Math.round(Math.max(360, Math.min(640, width)))
            return next === state.dockedChatWidth ? state : { dockedChatWidth: next }
          }),
        setWorkspaceChatOpen: (workspaceId, open) =>
          set(state => {
            if (state.workspaceChatOpen[workspaceId] === open) return state
            return { workspaceChatOpen: { ...state.workspaceChatOpen, [workspaceId]: open } }
          }),
        markChatSessionsRead: (workspaceId, versions) =>
          set(state => {
            const previous = state.chatReadVersions[workspaceId]
            const next = { ...previous }
            let changed = previous === undefined
            for (const [sessionId, version] of Object.entries(versions)) {
              if (!Number.isFinite(version) || version <= (next[sessionId] ?? -Infinity)) continue
              next[sessionId] = version
              changed = true
            }
            if (!changed) return state
            return { chatReadVersions: { ...state.chatReadVersions, [workspaceId]: next } }
          })
      }),
      {
        name: 'quint:ui',
        ...(storage ? { storage: createJSONStorage<UiStore>(() => storage) } : {})
      }
    )
  )

export const useUiStore = createUiStore()
