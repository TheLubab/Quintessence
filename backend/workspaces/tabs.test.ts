import { describe, expect, test } from 'bun:test'

import type { QuintletInfo } from '@/shared/types'

import { assembleTabRows, assertNavigableTab } from './tabs'

const quintlets: QuintletInfo[] = [
  { id: 'roadmap', status: 'compiled', title: 'Roadmap' },
  { id: 'orders', status: 'compiled', title: '' }
]

describe('assembleTabRows', () => {
  test('lists static tabs then quintlets, marking the saved default', () => {
    const rows = assembleTabRows(quintlets, 'quintlets/roadmap')
    expect(rows.map(r => r.id)).toEqual([
      'dashboard',
      'canvas',
      'quintlets/roadmap',
      'quintlets/orders'
    ])
    expect(rows.find(r => r.isDefault)?.id).toBe('quintlets/roadmap')
  })

  test('falls back to the quintlet id when the title is empty', () => {
    const rows = assembleTabRows(quintlets, 'dashboard')
    expect(rows.find(r => r.id === 'quintlets/orders')?.title).toBe('orders')
    expect(rows.find(r => r.id === 'quintlets/roadmap')?.title).toBe('Roadmap')
  })

  test('pending quintlets are ordinary navigable rows', () => {
    const pending: QuintletInfo = {
      id: 'draft',
      status: 'draft',
      title: 'Draft quintlet',
      requirements: ''
    }
    const rows = assembleTabRows([...quintlets, pending], 'quintlets/draft')
    expect(rows.find(row => row.id === 'quintlets/draft')).toMatchObject({
      title: 'Draft quintlet',
      isDefault: true,
      href: 'quint:/quintlets/draft'
    })
  })
})

test('every discovered tab has a portable address', () => {
  const rows = assembleTabRows(quintlets, 'dashboard')
  expect(rows.find(row => row.id === 'quintlets/orders')?.href).toBe('quint:/quintlets/orders')
  expect(rows.map(row => row.href)).toEqual([
    'quint:/dashboard',
    'quint:/canvas',
    'quint:/quintlets/roadmap',
    'quint:/quintlets/orders'
  ])
})

describe('assertNavigableTab', () => {
  test('accepts built-in destinations and built quintlets', () => {
    expect(() => assertNavigableTab('dashboard', quintlets)).not.toThrow()
    expect(() => assertNavigableTab('canvas', quintlets)).not.toThrow()
    expect(() => assertNavigableTab('quintlets/orders', quintlets)).not.toThrow()
  })

  test('lists the current addresses when a quintlet is missing', () => {
    expect(() => assertNavigableTab('quintlets/order', quintlets)).toThrow(
      'Unknown destination "quint:/quintlets/order". Valid addresses: quint:/dashboard, quint:/canvas, quint:/quintlets/roadmap, quint:/quintlets/orders'
    )
  })
})
