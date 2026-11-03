export type WorkerErrorCode =
  | 'timeout'
  | 'cancelled'
  | 'exited'
  | 'transport'
  | 'protocol'
  | 'execution'
  | 'shutdown'
export class WorkerError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WorkerError'
  }
}
export type WorkerCallOptions = { signal?: AbortSignal; timeoutMs?: number }
type WorkerRequestOptions = WorkerCallOptions & {
  label: string
  timeoutMs: number
  onCancel?: (error: WorkerError) => void
  onSettled?: () => void
}

// One settlement path owns timer/listener cleanup. Late IPC, exits and aborts
// are ignored after a result; cancellation also retires the executing process.
export function createWorkerRequest<T>(options: WorkerRequestOptions) {
  const deferred = Promise.withResolvers<T>()
  let settled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = (value: T | undefined, error?: WorkerError) => {
    if (settled) return false
    settled = true
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    options.onSettled?.()
    if (error) deferred.reject(error)
    else deferred.resolve(value as T)
    return true
  }
  const cancel = (error: WorkerError) => {
    if (finish(undefined, error)) options.onCancel?.(error)
  }
  const abort = () => cancel(new WorkerError('cancelled', `${options.label} cancelled`))
  if (options.signal?.aborted) abort()
  else {
    options.signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(
      () => cancel(new WorkerError('timeout', `${options.label} timed out`)),
      options.timeoutMs
    )
  }
  return {
    promise: deferred.promise,
    get settled() {
      return settled
    },
    resolve: (value: T) => finish(value),
    reject: (error: WorkerError) => finish(undefined, error)
  }
}
