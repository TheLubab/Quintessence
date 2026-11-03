// Meta as the only harness.
//
// Muse Code owns the model loop, tools, approvals, and durable session history.
// Quint drives one `muse serve` host per workspace over MSP and maps its item
// stream into the workspace transcript.
import { join } from 'node:path'

import type { Harness } from '../types'
import {
  closeAllMetaRuntimes,
  closeMetaRuntime,
  discoverMetaWorkspaceRoots,
  getMetaDebugInfo,
  listMetaMcpServers,
  readMetaAvailability,
  startMetaLogin
} from './client'
import { getMetaModels } from './models'
import { metaAvailability } from './config'
import {
  archiveMetaSession,
  forgetAllMetaSessions,
  forgetMetaWorkspace,
  forkMetaSession,
  getMetaActiveSessions,
  getMetaSessionEvents,
  getMetaSessionState,
  getMetaWorkspacePreview,
  interruptMetaRun,
  listMetaSessionsForWorkspace,
  metaStatusLines,
  respondMetaQuestion,
  respondMetaApproval,
  sendMetaMessage
} from './session'

export const metaHarness: Harness = {
  id: 'meta',
  capabilities: {
    supportsStreaming: true,
    imagesInline: 'base64',
    liveModelSwitch: true,
    liveEffortSwitch: true,
    nativeUserEcho: true
  },

  sendMessage: (input, lifecycle) => sendMetaMessage(input, lifecycle),
  interrupt: (workspaceId, sessionId) => interruptMetaRun(workspaceId, sessionId),
  archiveSession: (ws, sessionId) => archiveMetaSession(ws, sessionId),
  forkSession: (ws, sessionId) => forkMetaSession(ws, sessionId),
  activeSessions: () => getMetaActiveSessions(),

  listSessions: ws => listMetaSessionsForWorkspace(ws),
  workspacePreview: (ws, includeFirstUserMessage) =>
    getMetaWorkspacePreview(ws, includeFirstUserMessage),
  sessionEvents: (ws, sessionId) => getMetaSessionEvents(ws, sessionId),
  sessionState: (ws, sessionId) => getMetaSessionState(ws, sessionId),
  respondToQuestion: input => respondMetaQuestion(input),
  respondToApproval: input => respondMetaApproval(input),
  listModels: ws => getMetaModels(ws.path),

  mcpStatus: ws => {
    const sessionId = getMetaActiveSessions().find(run => run.workspaceId === ws.id)?.sessionId
    return listMetaMcpServers(ws.path, sessionId).catch(() => [])
  },
  discoverWorkspaces: registeredPaths => discoverMetaWorkspaceRoots(registeredPaths),
  availability: async ws => (ws ? readMetaAvailability(ws.path) : metaAvailability()),
  startLogin: startMetaLogin,
  authStatus: () => readMetaAvailability(process.cwd()),

  onEnvChanged: workspacePath => {
    forgetMetaWorkspace(workspacePath)
    void closeMetaRuntime(workspacePath)
  },
  stopWorkspace: workspacePath => {
    forgetMetaWorkspace(workspacePath)
    void closeMetaRuntime(workspacePath)
  },
  shutdown: async () => {
    forgetAllMetaSessions()
    await closeAllMetaRuntimes()
  },
  skillsDir: workspaceRoot => join(workspaceRoot, '.agents', 'skills'),
  debugInfo: ws => getMetaDebugInfo(ws.path),
  wireScope: ws => ws.path,

  statusLines: () => metaStatusLines()
}
