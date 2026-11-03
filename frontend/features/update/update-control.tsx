import { useEffect } from 'react'

import { DownloadIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { Spinner } from '@/frontend/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import { hasRunningActivity, useLive } from '@/frontend/features/chat/chat-store'
import { UPDATE_ACTIVE_AGENT_MESSAGE } from '@/shared/update'
import type { UpdateStatus } from '@/shared/types'

import { useUpdate, useUpdateStatus } from './api'

export function shouldReloadAfterUpdate(
  status: UpdateStatus | undefined,
  targetVersion: string | null
): boolean {
  return !!targetVersion && status?.runningVersion === targetVersion
}

export function getUpdateButtonState(
  agentRunning: boolean,
  updating: boolean,
  restarting: boolean
) {
  const busy = updating || restarting
  const blocked = agentRunning && !busy
  const label = updating
    ? 'Updating'
    : restarting
      ? 'Restarting'
      : blocked
        ? UPDATE_ACTIVE_AGENT_MESSAGE
        : 'Update'
  return { busy, blocked, label }
}

type UpdateButtonProps = {
  busy: boolean
  blocked: boolean
  label: string
  errorMessage: string | null
  onClick: () => void
}

export type UpdateControl =
  | { status: 'loading' | 'unavailable' }
  | { status: 'available'; button: UpdateButtonProps }

export function useUpdateControl(): UpdateControl {
  const update = useUpdate()
  const statusQuery = useUpdateStatus(update.isSuccess)
  const agentRunning = useLive(state => hasRunningActivity(state.activity))
  const status = statusQuery.data
  const restartTarget = update.data?.installedVersion ?? null

  useEffect(() => {
    if (shouldReloadAfterUpdate(status, restartTarget)) window.location.reload()
  }, [restartTarget, status])

  if (statusQuery.isPending) return { status: 'loading' }
  if (!status?.availableVersion && !update.isSuccess) return { status: 'unavailable' }

  const restarting = update.isSuccess
  const button = getUpdateButtonState(agentRunning, update.isPending, restarting)

  return {
    status: 'available',
    button: {
      ...button,
      errorMessage: update.error?.message ?? null,
      onClick: () => update.mutate()
    }
  }
}

export function UpdateButton({ busy, blocked, label, errorMessage, onClick }: UpdateButtonProps) {
  // The div gives TooltipTrigger an enabled event target when the button is disabled.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div>
            <Button
              type="button"
              size="icon-lg"
              variant={busy ? 'ghost' : 'default'}
              aria-label={label}
              disabled={blocked || busy}
              onClick={onClick}
            >
              {busy ? <Spinner strokeWidth={1.5} /> : <DownloadIcon strokeWidth={1.5} />}
            </Button>
          </div>
        }
      />
      <TooltipContent side="bottom" className={blocked ? 'max-w-56' : undefined}>
        {blocked ? UPDATE_ACTIVE_AGENT_MESSAGE : (errorMessage ?? label)}
      </TooltipContent>
    </Tooltip>
  )
}
