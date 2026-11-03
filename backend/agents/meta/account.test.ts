import { expect, test } from 'bun:test'
import { accountReady, loginCompletionError } from './account'

test('recognizes each authenticated credential lane and credential-free endpoints', () => {
  for (const state of ['envKey', 'apiKey', 'accountLogin']) {
    expect(accountReady({ state, credentialRequired: true })).toBe(true)
  }
  expect(accountReady({ state: 'loggedOut', credentialRequired: false })).toBe(true)
  expect(accountReady({ state: 'loggedOut', credentialRequired: true })).toBe(false)
  expect(accountReady({ state: 'unknown', credentialRequired: true })).toBe(false)
  expect(accountReady(undefined)).toBe(false)
})

test('denied or expired sign-in notifications never count as a successful login', () => {
  expect(loginCompletionError({ outcome: 'granted' })).toBeUndefined()
  for (const outcome of ['denied', 'expired', 'cancelled', 'failed', 'unknown']) {
    expect(loginCompletionError({ outcome })).toBeInstanceOf(Error)
  }
  expect(loginCompletionError({ outcome: 'denied', message: 'Access denied' })?.message).toBe(
    'Access denied'
  )
})
