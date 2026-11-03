export type MetaAccountState = {
  state?: string
  credentialRequired?: boolean
  label?: string
}

// credentialRequired describes the endpoint, not whether its credential is
// missing. An authenticated endpoint normally still requires a credential.
export function accountReady(account: MetaAccountState | undefined): boolean {
  return (
    !!account &&
    (account.credentialRequired === false ||
      ['envKey', 'apiKey', 'accountLogin'].includes(account.state ?? ''))
  )
}

export function loginCompletionError(params: Record<string, unknown>): Error | undefined {
  if (params.outcome === 'granted') return undefined
  return new Error(
    typeof params.message === 'string' && params.message
      ? params.message
      : 'Muse Code sign-in did not complete'
  )
}
