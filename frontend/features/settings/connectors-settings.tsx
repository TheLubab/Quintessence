import type { ReactNode } from 'react'

import { SocketIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'
import {
  McpServerCard,
  McpServerCardSkeleton,
  McpServerGrid,
  sortMcpServers
} from '@/frontend/features/connectors/mcp-server-cards'
import { useWorkspaceMcp } from '@/frontend/features/connectors/api'
import { useWorkspaceLayoutCtx } from '@/frontend/features/workspace/workspace-layout-context'

import { SettingsPage } from './settings-layout'

const CONNECTOR_SKELETONS = Array.from({ length: 4 }, (_, index) => index)

type ConnectorsContentProps = {
  connectors: ReturnType<typeof useWorkspaceMcp>
}

function ConnectorsContent({ connectors }: ConnectorsContentProps) {
  if (connectors.isPending) {
    return (
      <div role="status" aria-label="Loading connectors">
        <McpServerGrid>
          {CONNECTOR_SKELETONS.map(index => (
            <McpServerCardSkeleton key={index} />
          ))}
        </McpServerGrid>
      </div>
    )
  }

  if (connectors.isError) {
    return (
      <ConnectorsState>
        <p className="text-sm text-muted-foreground">Could not load connectors</p>
        <Button variant="outline" size="sm" onClick={() => connectors.refetch()}>
          Retry
        </Button>
      </ConnectorsState>
    )
  }

  if (connectors.data.length === 0) {
    return (
      <ConnectorsState>
        <SocketIcon size={24} strokeWidth={1.5} className="text-muted-foreground" />
        <p className="text-sm text-foreground">No connectors configured</p>
      </ConnectorsState>
    )
  }

  return (
    <McpServerGrid>
      {sortMcpServers(connectors.data).map(connector => (
        <McpServerCard key={connector.name} server={connector} />
      ))}
    </McpServerGrid>
  )
}

type ConnectorsStateProps = {
  children: ReactNode
}

function ConnectorsState({ children }: ConnectorsStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 py-12 text-center">
      {children}
    </div>
  )
}

export function ConnectorsSettings() {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const connectors = useWorkspaceMcp(workspaceId, true)

  return (
    <SettingsPage
      title="Connectors"
      description="Connectors available to the agent in this workspace"
    >
      <ConnectorsContent connectors={connectors} />
    </SettingsPage>
  )
}
