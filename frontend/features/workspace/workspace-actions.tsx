import { PaletteIcon, SettingsIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/frontend/components/ui/tooltip'
import {
  WorkspaceSettingsDialog,
  WorkspaceSettingsDialogTrigger
} from '@/frontend/features/settings/workspace-settings-dialog'

type WorkspaceActionsProps = {
  onOpenTheme: () => void
}

export function WorkspaceActions({ onOpenTheme }: WorkspaceActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Theme"
              onClick={onOpenTheme}
            >
              <PaletteIcon strokeWidth={1.5} />
            </Button>
          }
        />
        <TooltipContent side="bottom">Theme</TooltipContent>
      </Tooltip>

      <WorkspaceSettingsDialog>
        <Tooltip>
          <TooltipTrigger
            render={
              <WorkspaceSettingsDialogTrigger
                render={
                  <Button type="button" variant="ghost" size="icon" aria-label="Settings">
                    <SettingsIcon strokeWidth={1.5} />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </WorkspaceSettingsDialog>
    </div>
  )
}