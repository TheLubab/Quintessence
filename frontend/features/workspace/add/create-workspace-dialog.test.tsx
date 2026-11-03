import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import * as router from 'wouter'
import * as config from '@/frontend/api/app-config'
import { TooltipProvider } from '@/frontend/components/ui/tooltip'
import { renderTestUi } from '@/frontend/test/render'
import { CreateWorkspaceDialog } from './create-workspace-dialog'

let cleanup = async () => {}
afterEach(() => cleanup())

test('creation blocks dismissal and duplicate submissions, then permits retry after failure', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment: 'local',
    demo: false,
    demoInstallUrl: ''
  })
  const destinations: string[] = []
  const locationSpy = spyOn(router, 'useLocation').mockReturnValue([
    '/',
    destination => destinations.push(destination)
  ])
  const firstResponse = Promise.withResolvers<Response>()
  const requests: unknown[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method !== 'POST') return Response.json({ installed: { meta: true } })
        requests.push(JSON.parse(String(init.body)))
        if (requests.length === 1) return firstResponse.promise
        return Response.json({
          id: 'new-workspace',
          path: '/projects/example',
          addedAt: '2026-01-01T00:00:00Z'
        })
      },
      { preconnect: fetch.preconnect }
    )
  )
  notifyManager.setNotifyFunction(callback => act(callback))
  let cleanupUi = async () => {}
  cleanup = async () => {
    await cleanupUi()
    client.clear()
    fetchSpy.mockRestore()
    locationSpy.mockRestore()
    configSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
  }
  const ui = await renderTestUi(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <CreateWorkspaceDialog trigger={<button>Create</button>} />
      </TooltipProvider>
    </QueryClientProvider>
  )
  cleanupUi = ui.cleanup
  await ui.click(ui.button('Create'))
  await ui.type(ui.document.querySelector<HTMLInputElement>('#workspace-name')!, 'Example')
  expect(ui.button('Continue').disabled).toBe(false)
  await ui.click(ui.button('Continue'))
  await ui.click(ui.button('Create workspace'))
  expect(requests).toEqual([{ name: 'Example', type: 'meta' }])
  expect(ui.button('Creating…').disabled).toBe(true)
  expect(
    [...ui.document.querySelectorAll('button')].some(
      button => button.textContent?.trim() === 'Close'
    )
  ).toBe(false)
  await ui.click(ui.button('Creating…'))
  await ui.escape()
  expect(ui.document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(requests).toHaveLength(1)
  await act(async () => {
    firstResponse.resolve(new Response('Creation failed', { status: 500 }))
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  expect(ui.button('Create workspace').disabled).toBe(false)
  await ui.click(ui.button('Close'))
  expect(ui.document.querySelector('[role="dialog"]')).toBeNull()
  await ui.click(ui.button('Create'))
  await ui.type(ui.document.querySelector<HTMLInputElement>('#workspace-name')!, 'Example')
  await ui.click(ui.button('Continue'))
  await ui.click(ui.button('Create workspace'))
  expect(requests).toEqual([
    { name: 'Example', type: 'meta' },
    { name: 'Example', type: 'meta' }
  ])
  expect(destinations).toEqual(['/workspace/new-workspace'])
})
