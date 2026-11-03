import { useEffect, useState } from 'react'

import { WorkspaceIdentity, type WorkspaceIdentityProps } from '../workspace-identity'

const greetings = [
  'Welcome to',
  'A new beginning for',
  'A fresh start in',
  'Good to see you in'
]

export type WorkspaceWelcomeStateProps = Omit<
  WorkspaceIdentityProps,
  'onNameChange' | 'onNameCommit' | 'renderIcon'
>

// A one-time handoff from creation to the first visit. Never persisted.
let newlyCreatedWorkspaceId: string | undefined

export function welcomeNewWorkspace(workspaceId: string) {
  newlyCreatedWorkspaceId = workspaceId
}

export function useWorkspaceWelcome(workspaceId: string) {
  const [welcoming, setWelcoming] = useState(() => newlyCreatedWorkspaceId === workspaceId)

  useEffect(() => {
    if (newlyCreatedWorkspaceId === workspaceId) newlyCreatedWorkspaceId = undefined
    if (!welcoming) return
    const timer = setTimeout(() => setWelcoming(false), 3000)
    return () => clearTimeout(timer)
  }, [workspaceId, welcoming])

  return welcoming
}

export function WorkspaceWelcomeState({
  name = 'Workspace',
  icon,
  ...iconProps
}: WorkspaceWelcomeStateProps) {
  const [greeting] = useState(() => greetings[Math.floor(Math.random() * greetings.length)])

  return (
    <div
      aria-label="Workspace welcome"
      className="flex flex-1 items-center justify-center p-6 text-center"
    >
      <div className="flex min-w-0 flex-col items-center gap-1">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <WorkspaceIdentity {...iconProps} name={name} icon={icon} />
      </div>
    </div>
  )
}
