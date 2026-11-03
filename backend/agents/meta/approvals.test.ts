import { expect, test } from 'bun:test'
import type { ApprovalResponse } from '@/shared/types'
import {
  approvalFromParams,
  isApprovalResponse,
  validateApprovalChoice,
  type ApprovalParams
} from './approvals'

// Only the fields read at this boundary are needed; no network or agent runs.
const request = {
  approvalId: 'approval-1',
  currentRequirementId: { approvalId: 'approval-1', sourceIndex: 0 },
  toolName: 'shell',
  rawArgs: '{}',
  subject: { kind: 'shell', command: 'write report' },
  availableChoices: [
    { choiceId: 'allow-once', label: 'Allow once', scope: 'once', decision: 'approved' },
    { choiceId: 'reject', label: 'Reject', scope: 'once', decision: 'denied' }
  ]
} as ApprovalParams
const response: ApprovalResponse = {
  type: 'approval_response',
  workspaceId: 'workspace-1',
  sessionId: 'session-1',
  approvalId: 'approval-1',
  requirementId: { approvalId: 'approval-1', sourceIndex: 0 },
  choiceId: 'allow-once'
}

test('approval rendering preserves the host choices and stage changes', () => {
  const original = approvalFromParams(request)
  expect(original.description).toBe('write report')
  expect(original.choices.map(choice => choice.label)).toEqual(['Allow once', 'Reject'])
  const updated = approvalFromParams(
    {
      ...request,
      currentRequirementId: { approvalId: 'approval-1', sourceIndex: 1 }
    },
    original
  )
  expect(() => validateApprovalChoice(updated, response)).toThrow('approval changed')
  expect(() => validateApprovalChoice(original, response)).not.toThrow()
})

test('rejects stale approvals, invented choices and malformed socket replies', () => {
  expect(() => validateApprovalChoice(undefined, response)).toThrow('no longer available')
  expect(() =>
    validateApprovalChoice(approvalFromParams(request), { ...response, choiceId: 'invented' })
  ).toThrow('available approval options')
  expect(isApprovalResponse(response)).toBe(true)
  for (const bad of [
    null,
    {},
    { ...response, requirementId: null },
    { ...response, requirementId: { approvalId: 'other', sourceIndex: 0 } },
    { ...response, requirementId: { approvalId: 'approval-1', sourceIndex: -1 } }
  ]) {
    expect(isApprovalResponse(bad)).toBe(false)
  }
})
