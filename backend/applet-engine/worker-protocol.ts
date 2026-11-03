import type { AppletKind, QuintletConfig, WidgetConfig } from '@/shared/types'

export const WORKER_PROTOCOL_VERSION = 1 as const
export type WorkerEnvelope = { version: typeof WORKER_PROTOCOL_VERSION }
export type WorkerShutdown = WorkerEnvelope & { type: 'shutdown' }
export type WorkerReady = WorkerEnvelope & { type: 'ready' }
export type FunctionRequest = WorkerEnvelope &
  (
    | { type: 'call'; id: string; module: string; name: string; args: string }
    | { type: 'reload'; modules: string[] }
    | { type: 'shutdown' }
  )
export type FunctionResponse = WorkerEnvelope &
  (
    | { type: 'ready' }
    | { type: 'loaded'; module: string }
    | { type: 'result'; id: string; data: string }
    | { type: 'error'; id: string; message: string; code: 'execution' | 'protocol' }
  )
export type BuildJob = { name: string; srcPath: string; outDir: string }
export type BuildJobResult = {
  name: string
  status: 'built' | 'failed'
  error?: string
  serverModules?: string[]
  config?: WidgetConfig | QuintletConfig | null
}
export type BuildRequest = WorkerEnvelope & {
  type: 'build'
  id: string
  quintRoot: string
  kind: AppletKind
  jobs: BuildJob[]
}
export type BuildResponse = WorkerEnvelope & {
  type: 'result'
  id: string
  results: BuildJobResult[]
}

function envelope(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'version' in value &&
    value.version === WORKER_PROTOCOL_VERSION
  )
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}
export function isWorkerReady(value: unknown): value is WorkerReady {
  return envelope(value) && value.type === 'ready'
}
export function isWorkerShutdown(value: unknown): value is WorkerShutdown {
  return envelope(value) && value.type === 'shutdown'
}
export function isFunctionRequest(value: unknown): value is FunctionRequest {
  if (!envelope(value)) return false
  switch (value.type) {
    case 'shutdown':
      return true
    case 'reload':
      return strings(value.modules)
    case 'call':
      return (
        typeof value.id === 'string' &&
        value.id.length > 0 &&
        typeof value.module === 'string' &&
        typeof value.name === 'string' &&
        typeof value.args === 'string'
      )
    default:
      return false
  }
}
export function isFunctionResponse(value: unknown): value is FunctionResponse {
  if (!envelope(value)) return false
  switch (value.type) {
    case 'ready':
      return true
    case 'loaded':
      return typeof value.module === 'string'
    case 'result':
      return typeof value.id === 'string' && typeof value.data === 'string'
    case 'error':
      return (
        typeof value.id === 'string' &&
        typeof value.message === 'string' &&
        (value.code === 'execution' || value.code === 'protocol')
      )
    default:
      return false
  }
}
export function isBuildRequest(value: unknown): value is BuildRequest {
  return (
    envelope(value) &&
    value.type === 'build' &&
    typeof value.id === 'string' &&
    typeof value.quintRoot === 'string' &&
    (value.kind === 'widget' || value.kind === 'quintlet') &&
    Array.isArray(value.jobs) &&
    value.jobs.every(
      job =>
        job !== null &&
        typeof job === 'object' &&
        typeof job.name === 'string' &&
        typeof job.srcPath === 'string' &&
        typeof job.outDir === 'string'
    )
  )
}
export function isBuildResponse(value: unknown): value is BuildResponse {
  return (
    envelope(value) &&
    value.type === 'result' &&
    typeof value.id === 'string' &&
    Array.isArray(value.results) &&
    value.results.every(
      result =>
        result !== null &&
        typeof result === 'object' &&
        typeof result.name === 'string' &&
        (result.status === 'built' || result.status === 'failed') &&
        (result.error === undefined || typeof result.error === 'string') &&
        (result.serverModules === undefined || strings(result.serverModules)) &&
        (result.config === undefined ||
          result.config === null ||
          (typeof result.config === 'object' && !Array.isArray(result.config)))
    )
  )
}
