import { describe, expect, test } from 'bun:test'

import { CalendarIcon, DocumentTextIcon } from '@solar-icons/react/linear'

import type { CompiledQuintlet, QuintletConfig } from '@/shared/types'

import { getQuintletIcon, getQuintletLabel } from './quintlet-presentation'

const quintlet = (config: QuintletConfig): CompiledQuintlet => ({
  id: 'roadmap',
  status: 'compiled',
  ...config,
  title: config.title || 'roadmap'
})

describe('quintlet presentation', () => {
  test('uses the configured title and icon', () => {
    const configured = quintlet({ title: 'Roadmap', icon: 'calendar' })

    expect(getQuintletLabel(configured)).toBe('Roadmap')
    expect(getQuintletIcon(configured)).toBe(CalendarIcon)
  })

  test('uses generic defaults when config has no title or icon', () => {
    expect(getQuintletLabel(quintlet({}))).toBe('roadmap')
    expect(getQuintletIcon(quintlet({}))).toBe(DocumentTextIcon)
  })
})
