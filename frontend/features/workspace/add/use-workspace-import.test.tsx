import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import { act } from 'react'
import { renderTestUi } from '@/frontend/test/render'
import { workspaceKeys } from '@/frontend/api/workspace-keys'
import type { DiscoveredWorkspace, WorkspaceEntry } from '@/shared/types'
import { useUiStore } from '@/frontend/store/ui'
import { useWorkspaceImport } from './use-workspace-import'

let cleanup = async () => {}
afterEach(() => cleanup())

test.each([{ types: [] }, { types: ['meta'] }] satisfies { types: DiscoveredWorkspace['types'] }[])(
  'imports a discovered workspace with detected types %j and updates the registry',
  async ({ types }) => {
    const workspace: DiscoveredWorkspace = { path: '/projects/imported', types: [...types] }
    const entry: WorkspaceEntry = {
      id: 'imported',
      path: workspace.path,
      addedAt: '2026-01-01T00:00:00Z'
    }
    const requests: unknown[] = []
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    client.setQueryData(workspaceKeys.discover, [workspace])
    const originalUi = useUiStore.getState()
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(JSON.parse(String(init?.body)))
          return Response.json(entry)
        },
        { preconnect: fetch.preconnect }
      )
    )
    const imported: WorkspaceEntry[] = []
    function ImportControls() {
      const flow = useWorkspaceImport({ onSuccess: value => imported.push(value) })
      return (
        <>
          <button onClick={() => flow.startImport(workspace)}>Choose folder</button>
          <button disabled={!flow.choice || flow.isPending} onClick={flow.submit}>
            Import
          </button>
          <button onClick={flow.reset}>Reset</button>
        </>
      )
    }
    notifyManager.setNotifyFunction(callback => act(callback))
    let cleanupUi = async () => {}
    cleanup = async () => {
      await cleanupUi()
      client.clear()
      fetchSpy.mockRestore()
      notifyManager.setNotifyFunction(callback => callback())
      useUiStore.setState(originalUi)
    }
    const ui = await renderTestUi(
      <QueryClientProvider client={client}>
        <ImportControls />
      </QueryClientProvider>
    )
    cleanupUi = ui.cleanup
    expect(ui.button('Import').disabled).toBe(true)
    await ui.click(ui.button('Choose folder'))
    expect(ui.button('Import').disabled).toBe(false)
    await ui.click(ui.button('Reset'))
    expect(ui.button('Import').disabled).toBe(true)
    await ui.click(ui.button('Choose folder'))
    await ui.click(ui.button('Import'))
    expect(requests).toEqual([{ path: workspace.path, type: 'meta' }])
    expect(imported).toEqual([entry])
    expect(client.getQueryData<WorkspaceEntry[]>(workspaceKeys.all)).toEqual([entry])
    expect(client.getQueryData<DiscoveredWorkspace[]>(workspaceKeys.discover)).toEqual([])
  }
)
