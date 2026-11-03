import { expect, test } from 'bun:test'
import { shouldPromote, validateRelease } from './publish-cloudflare'

test('stable promotion compares numeric versions and permits safe retries', () => {
  expect(shouldPromote('v1.9.0', 'v1.10.0')).toBe(true)
  expect(shouldPromote('v2.0.0', 'v1.99.0')).toBe(false)
  expect(shouldPromote('v1.2.3', 'v1.2.2')).toBe(false)
  expect(shouldPromote('v1.2.3', 'v1.2.3')).toBe(true)
})

test('release channels must agree with the version tag', () => {
  expect(() => validateRelease('v1.2.3', false)).not.toThrow()
  expect(() => validateRelease('v1.2.3-next.1', true)).not.toThrow()
  expect(() => validateRelease('v1.2.3-next.1', false)).toThrow()
  expect(() => validateRelease('v1.2.3', true)).toThrow()
  expect(() => validateRelease('../install.sh', false)).toThrow()
})
