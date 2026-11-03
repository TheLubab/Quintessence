import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { WidgetInfo } from '@/shared/types'

import { listWidgets } from '../applet-engine/widgets'

let workspacePath: string

beforeEach(() => {
  workspacePath = mkdtempSync(join(import.meta.dir, 'quint-wtest-'))
  const buildDir = join(workspacePath, '.quint', '.build', 'widgets')
  mkdirSync(join(buildDir, 'weather'), { recursive: true })
  writeFileSync(join(buildDir, 'weather', 'index.js'), '// weather')
  writeFileSync(
    join(buildDir, 'manifest.json'),
    JSON.stringify({ config: { weather: { rowSpan: 1, colSpan: 2 } } })
  )
})

afterEach(() => {
  rmSync(workspacePath, { recursive: true, force: true })
})

describe('listWidgets', () => {
  test('returns the same bundle revision shape as quintlets', async () => {
    const response = await listWidgets(workspacePath)
    const body = (await response.json()) as { widgets: WidgetInfo[] }
    expect(body.widgets).toEqual([
      {
        id: 'weather',
        revision: expect.any(String),
        config: { rowSpan: 1, colSpan: 2 }
      }
    ])
  })
})
