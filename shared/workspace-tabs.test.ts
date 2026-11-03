import { describe, expect, test } from 'bun:test'

import { isParamsRecord, isWorkspaceTabId, quintletIdFromTab, quintletTabId } from './workspace-tabs'

describe('isWorkspaceTabId', () => {
  test('accepts the static tabs', () => {
    expect(isWorkspaceTabId('dashboard')).toBe(true)
    expect(isWorkspaceTabId('canvas')).toBe(true)
  })

  test('accepts quintlet tabs with a non-empty id', () => {
    expect(isWorkspaceTabId('quintlets/roadmap')).toBe(true)
    expect(isWorkspaceTabId('quintlets/')).toBe(false)
    expect(isWorkspaceTabId('quintlet-builders/')).toBe(false)
  })

  test('rejects everything else', () => {
    for (const tab of [
      'quintlet:roadmap',
      'quintlet-builder:abc',
      'quintlets/a/b',
      'quintlets/a?x=1',
      'quintlets/%65vents'
    ]) {
      expect(isWorkspaceTabId(tab)).toBe(false)
    }
    expect(isWorkspaceTabId('')).toBe(false)
    expect(isWorkspaceTabId('widgets')).toBe(false)
    expect(isWorkspaceTabId('settings')).toBe(false)
    expect(isWorkspaceTabId('quintlets:roadmap')).toBe(false)
    expect(isWorkspaceTabId(undefined)).toBe(false)
    expect(isWorkspaceTabId(null)).toBe(false)
    expect(isWorkspaceTabId(42)).toBe(false)
  })
})

describe('tab id round-trips', () => {
  test('quintlet tabs', () => {
    expect(quintletTabId('orders')).toBe('quintlets/orders')
    expect(quintletIdFromTab('quintlets/orders')).toBe('orders')
    expect(quintletIdFromTab('dashboard')).toBeUndefined()
    expect(quintletIdFromTab('canvas')).toBeUndefined()
  })
})

describe('isParamsRecord', () => {
  test('accepts a plain object', () => {
    expect(isParamsRecord({})).toBe(true)
    expect(isParamsRecord({ a: 1, nested: { b: [1, 2] } })).toBe(true)
  })

  test('rejects non-object JSON values', () => {
    expect(isParamsRecord(null)).toBe(false)
    expect(isParamsRecord([1, 2])).toBe(false)
    expect(isParamsRecord('str')).toBe(false)
    expect(isParamsRecord(7)).toBe(false)
    expect(isParamsRecord(undefined)).toBe(false)
  })
})
