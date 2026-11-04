import { useQuery } from '@tanstack/react-query'
import { jsonRequest, requestJson, requestVoid } from '@/frontend/api/http'
import type {
  HarnessAvailability,
  HarnessLogin,
  HarnessLoginState,
  WorkspaceType
} from '@/shared/types'

export function startHarnessLogin(type: WorkspaceType): Promise<HarnessLogin> {
  return requestJson(
    `/api/harnesses/${type}/auth/login`,
    { method: 'POST' },
    'Could not start sign-in'
  )
}

export type LoginHarness = WorkspaceType

export type HarnessAuth = {
  availability: HarnessAvailability
  login?: HarnessLoginState
}

export function useHarnessAuth(type: WorkspaceType) {
  return useQuery({
    queryKey: ['harness-auth', type],
    queryFn: () => requestJson<HarnessAuth>(`/api/harnesses/${type}/auth`),
    staleTime: 2_000,
    refetchInterval: 2_000
  })
}

export function refreshHarnessAuth(type: WorkspaceType): Promise<HarnessAuth> {
  return requestJson(`/api/harnesses/${type}/auth?refresh=1`)
}

export function submitHarnessLoginCode(type: WorkspaceType, id: string, code: string) {
  return requestVoid(`/api/harnesses/${type}/auth/login/${id}/code`, jsonRequest('POST', { code }))
}
