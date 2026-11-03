import { describe, expect, test } from 'bun:test'

import { appletSelectorMatches, parseAppletSelector } from './applet-selector'

describe('applet selectors', () => {
  test('parses a kind or one applet with the same grammar', () => {
    expect(parseAppletSelector('quintlets')).toEqual({ segment: 'quintlets' })
    expect(parseAppletSelector('widgets/weather')).toEqual({
      segment: 'widgets',
      id: 'weather'
    })
  })

  test('rejects invalid kinds, ids, and extra path segments', () => {
    for (const value of [
      'quintlet',
      'quintlets/',
      'quintlets/WordCards',
      'quintlets/word cards',
      'quintlets/a/b'
    ]) {
      expect(parseAppletSelector(value)).toBeNull()
    }
  })

  test('matches a whole kind or one id', () => {
    expect(appletSelectorMatches('quintlets', 'quintlets', 'orders')).toBe(true)
    expect(appletSelectorMatches('quintlets/orders', 'quintlets', 'orders')).toBe(true)
    expect(appletSelectorMatches('quintlets/orders', 'quintlets', 'other')).toBe(false)
    expect(appletSelectorMatches('quintlets/orders', 'widgets', 'orders')).toBe(false)
  })
})
