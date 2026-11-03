import { useEffect, useRef, useState } from 'react'

import { LoaderIcon } from '@solar-icons/react/linear'
import { useLocation } from 'wouter'

import { useAppConfig } from '@/frontend/api/app-config'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/frontend/components/ui/alert-dialog'
import { Button } from '@/frontend/components/ui/button'
import { Input } from '@/frontend/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/components/ui/popover'
import { WorkspaceIcon } from '@/frontend/components/shared/workspace-icon'
import { useRemoveWorkspace } from '@/frontend/features/home/api'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'

import { useSaveWorkspaceName } from './api'
import { SettingsPage, SettingsRow, SettingsSection } from './settings-layout'
import { WorkspaceIconPicker } from './workspace-icon-picker'

function WorkspaceNameSetting() {
  const { name, workspaceId } = useWorkspaceLayoutCtx()
  const workspaceName = name ?? 'Workspace'
  const saveName = useSaveWorkspaceName(workspaceId)
  const [draft, setDraft] = useState(workspaceName)
  const skipCommit = useRef(false)

  useEffect(() => setDraft(workspaceName), [workspaceName])

  function commit(value: string) {
    const next = value.trim()
    if (next === workspaceName) return
    saveName.mutate(next === '' ? null : next)
  }

  return (
    <SettingsRow
      title="Name"
      description="Shown in the workspace switcher"
      control={
        <Input
          value={draft}
          aria-label="Workspace name"
          onChange={event => setDraft(event.target.value)}
          onBlur={event => {
            if (skipCommit.current) {
              skipCommit.current = false
              return
            }
            commit(event.currentTarget.value)
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              skipCommit.current = true
              setDraft(workspaceName)
              event.currentTarget.blur()
            }
          }}
          className="w-56"
        />
      }
    />
  )
}

function WorkspaceIconSetting() {
  const { layout, name, provider } = useWorkspaceLayoutCtx()

  return (
    <SettingsRow
      title="Icon"
      description="Shown in the workspace switcher"
      control={
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <WorkspaceIcon
              icon={layout.icon}
              name={name ?? 'Workspace'}
              workspaceType={provider}
              workspaceTheme={layout.theme}
              className="size-4 rounded-xs"
            />
            Change
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(32rem,calc(100vw-2rem))] gap-4 rounded-2xl p-6"
          >
            <WorkspaceIconPicker />
          </PopoverContent>
        </Popover>
      }
    />
  )
}

export function GeneralSettings() {
  const { demo } = useAppConfig()
  const { name, cwd, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  const removeWorkspace = useRemoveWorkspace()
  const label = name ?? cwd ?? 'this space'

  const remove = () => {
    removeWorkspace.mutate(workspaceId, { onSuccess: () => navigate('/') })
  }

  return (
    <SettingsPage title="General" description="Basic details for this space">
      <SettingsSection>
        <WorkspaceNameSetting />
        <WorkspaceIconSetting />
        <SettingsRow
          title="Path"
          control={
            <Input
              value={cwd ?? ''}
              aria-label="Workspace path"
              title={cwd ?? undefined}
              className="w-56"
              readOnly
            />
          }
        />
      </SettingsSection>

      {!demo && (
        <SettingsSection label="Danger zone">
          <SettingsRow
            title="Remove space"
            description="Remove this space from Quint. Its folder and sessions stay on disk."
            control={
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button type="button" variant="destructive" size="sm" />}
                  disabled={removeWorkspace.isPending}
                >
                  Remove
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove “{label}” from your workspaces?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This only removes it from your list. The folder and its sessions stay on disk.
                      You can add it back any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {removeWorkspace.isError && (
                    <p className="text-xs text-destructive">{removeWorkspace.error.message}</p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removeWorkspace.isPending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      variant="destructive"
                      onClick={remove}
                      disabled={removeWorkspace.isPending}
                    >
                      {removeWorkspace.isPending && (
                        <LoaderIcon
                          data-icon="inline-start"
                          strokeWidth={1.75}
                          className="animate-spin"
                        />
                      )}
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            }
          />
        </SettingsSection>
      )}
    </SettingsPage>
  )
}
