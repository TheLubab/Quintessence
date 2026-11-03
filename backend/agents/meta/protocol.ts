// Meta wire helpers that the pinned SDK 1.4 typings do not expose yet.
//
// MSP evolves additively: experimental methods are valid on the wire even when
// the TypeScript barrel omits them. Keep the small local shapes here and
// feature-detect `methodNotFound` so an older host degrades instead of failing.
import { MspError, type Connection, type NotificationHandler } from '@muse-code/sdk'

export type MetaNotification = Parameters<NotificationHandler>[0]

export type MetaCapabilities = {
  experimentalApi?: boolean
  requestedCapabilities?: string[]
  userInputDialogs?: boolean
}

export const META_CLIENT_CAPABILITIES: MetaCapabilities = {
  experimentalApi: true,
  requestedCapabilities: ['sessionListStream'],
  userInputDialogs: true
}

export function isMethodNotFound(error: unknown): boolean {
  return error instanceof MspError && error.code === -32601
}

export function tapNotifications(
  connection: Connection,
  onNotification: (notification: MetaNotification) => void
): void {
  const install = connection.onNotification.bind(connection)
  connection.onNotification = handler => {
    install(notification => {
      onNotification(notification)
      handler(notification)
    })
  }
}

export async function requestOptional<T>(
  connection: Connection,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T | undefined> {
  try {
    return (await connection.request(method, params)) as T
  } catch (error) {
    if (isMethodNotFound(error)) return undefined
    throw error
  }
}

export async function commandOptional(
  connection: Connection,
  method: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  try {
    return await connection.command(method, params)
  } catch (error) {
    if (isMethodNotFound(error)) return undefined
    throw error
  }
}
