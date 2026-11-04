import { useEffect, useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { cn } from '@/frontend/utils/cn'
import { useAppConfig } from '@/frontend/api/app-config'
import { Button, buttonVariants } from '@/frontend/components/ui/button'
import { Textarea } from '@/frontend/components/ui/textarea'
import { workspaceTypeLabel } from '@/frontend/features/workspace/workspace-presentation'
import { Spinner } from '@/frontend/components/ui/spinner'
import {
  startHarnessLogin,
  refreshHarnessAuth,
  submitHarnessLoginCode,
  useHarnessAuth,
  type LoginHarness
} from '@/frontend/features/harness/api'
import { workspaceProviderIcon } from '@/frontend/components/shared/workspace-icon'

import { DeviceLoginSteps } from '@/frontend/features/harness/device-login-steps'
import { ArrowRightIcon } from '@solar-icons/react/linear'

type WorkspaceLoginStateProps = {
  type: LoginHarness
  reason: string
  checking: boolean
  onRecheck: () => void
}

export function WorkspaceLoginState({
  type,
  reason,
  checking,
  onRecheck
}: WorkspaceLoginStateProps) {
  const { environment } = useAppConfig()
  const auth = useHarnessAuth(type)
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [manualLogin, setManualLogin] = useState(false)
  const inputId = useId()
  const name = workspaceTypeLabel[type]
  const login = auth.data?.login
  const pending = login?.state === 'pending' ? login : undefined
  const starting = login?.state === 'starting'
  const waitingForBrowser = environment === 'local' && !manualLogin
  const connected = !starting && !pending && auth.data?.availability.status === 'available'
  useEffect(() => {
    if (connected) onRecheck()
  }, [connected, onRecheck])
  const action = useMutation({
    mutationFn: async (kind: 'start' | 'submit') => {
      if (kind === 'start') {
        setManualLogin(false)
        setCode('')
        await startHarnessLogin(type)
      }
      if (kind === 'submit' && pending) {
        await submitHarnessLoginCode(type, pending.id, code)
        setCode('')
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['harness-auth'] })
  })
  const recheck = useMutation({
    mutationFn: () => refreshHarnessAuth(type),
    onSuccess: result => {
      queryClient.setQueryData(['harness-auth', type], result)
      onRecheck()
    }
  })
  // A transient availability failure must not hide an active device-code flow.
  const checkError =
    !pending && !starting && (auth.isError || auth.data?.availability.status === 'unavailable')
  const checkReason =
    recheck.error?.message ??
    auth.error?.message ??
    (auth.data?.availability.status === 'unavailable' ? auth.data.availability.reason : undefined)
  const failure = action.error?.message ?? (login?.state === 'failed' ? login.reason : undefined)

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-5xl flex-col text-center">
        <img src={workspaceProviderIcon[type]} alt="" className="mb-4 size-10 self-center" />
        <h1 className="mb-6 text-center text-xl font-medium">Approve Muse Code</h1>
        <section
          className={cn('flex w-full flex-col gap-3 self-center', !pending?.userCode && 'max-w-xs')}
          aria-label={name}
        >
          {auth.isPending ? (
            <Spinner className="size-6 self-center text-muted-foreground" strokeWidth={1.5} />
          ) : checkError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p>Could not check agent sign-in status.</p>
              {checkReason && <p className="text-sm text-muted-foreground">{checkReason}</p>}
              <Button
                variant="secondary"
                disabled={recheck.isPending}
                onClick={() => recheck.mutate()}
              >
                Try again
              </Button>
            </div>
          ) : connected ? (
            <div role="status" className="flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {checking
                  ? 'Checking workspace access…'
                  : `Signed in to ${name}, but this workspace still needs attention. ${reason}`}
              </p>
              <Button variant="secondary" disabled={checking} onClick={onRecheck}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              {pending?.userCode ? (
                <DeviceLoginSteps code={pending.userCode} url={pending.url} />
              ) : pending ? (
                <>
                  <p role="status" className="text-sm text-muted-foreground">
                    {pending.codeUrl && !waitingForBrowser
                      ? `Sign in to ${name} to get the authorization code.`
                      : `Sign in to ${name}, then come back to Quint. Your workspace will open once you’re connected.`}
                  </p>
                  <a
                    className={buttonVariants({ variant: 'secondary' })}
                    href={manualLogin ? (pending.codeUrl ?? pending.url) : pending.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open {name}
                  </a>
                  {waitingForBrowser && pending.codeUrl && (
                    <Button variant="ghost" onClick={() => setManualLogin(true)}>
                      Having trouble signing in?
                    </Button>
                  )}
                  {!waitingForBrowser && pending.codeUrl && (
                    <form
                      className="mt-3 flex flex-col gap-3"
                      onSubmit={event => {
                        event.preventDefault()
                        action.mutate('submit')
                      }}
                    >
                      <label htmlFor={inputId} className="text-sm text-muted-foreground">
                        Paste the code here:
                      </label>
                      <Textarea
                        id={inputId}
                        aria-label="Authorization code"
                        rows={3}
                        className="field-sizing-fixed resize-none"
                        value={code}
                        onChange={event => setCode(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Button
                        type="submit"
                        className="mt-3"
                        disabled={!code.trim() || action.isPending}
                      >
                        {action.isPending ? 'Connecting…' : 'Continue'}
                      </Button>
                    </form>
                  )}
                </>
              ) : (
                <Button
                  className="self-center"
                  disabled={action.isPending || starting}
                  onClick={() => action.mutate('start')}
                >
                  Continue
                  <ArrowRightIcon strokeWidth={1.75} data-icon="inline-end" />
                </Button>
              )}
            </>
          )}
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
