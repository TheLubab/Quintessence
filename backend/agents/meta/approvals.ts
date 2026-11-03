import type { PendingApproval } from '@muse-code/sdk'

export type ApprovalParams =
  | PendingApproval['requested']
  | NonNullable<PendingApproval['latestUpdate']>
import type { ApprovalResponse, SessionApproval } from '@/shared/types'

export function approvalFromParams(
  params: ApprovalParams,
  previous?: SessionApproval
): SessionApproval {
  return {
    approvalId: params.approvalId,
    requirementId: { ...params.currentRequirementId },
    toolName: 'toolName' in params ? params.toolName : (previous?.toolName ?? 'tool'),
    description:
      params.subject.command ??
      params.subject.path ??
      params.subject.host ??
      ('rawArgs' in params ? params.rawArgs : (previous?.description ?? params.subject.kind)),
    choices: params.availableChoices.map(choice => ({
      choiceId: choice.choiceId,
      label: choice.label,
      scope: choice.scope,
      ...(choice.rulePreview ? { rulePreview: choice.rulePreview } : {})
    }))
  }
}

export function isApprovalResponse(value: unknown): value is ApprovalResponse {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  const requirement = row.requirementId as Record<string, unknown> | undefined
  return (
    row.type === 'approval_response' &&
    ['workspaceId', 'sessionId', 'approvalId', 'choiceId'].every(
      key => typeof row[key] === 'string' && row[key] !== ''
    ) &&
    !!requirement &&
    typeof requirement === 'object' &&
    requirement.approvalId === row.approvalId &&
    Number.isSafeInteger(requirement.sourceIndex) &&
    Number(requirement.sourceIndex) >= 0
  )
}

export function validateApprovalChoice(
  pending: SessionApproval | undefined,
  response: ApprovalResponse
): void {
  if (!pending) throw new Error('Approval is no longer available')
  if (
    pending.requirementId.approvalId !== response.requirementId.approvalId ||
    pending.requirementId.sourceIndex !== response.requirementId.sourceIndex
  ) {
    throw new Error('The approval changed. Review the current request')
  }
  if (!pending.choices.some(choice => choice.choiceId === response.choiceId)) {
    throw new Error('Choose one of the available approval options')
  }
}
