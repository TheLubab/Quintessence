import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { COLOR_THEMES, DEFAULT_PRIMARY_COLOR, deriveThemeColors } from '@/shared/themes'

import { WorkspaceIcon, workspaceProviderIcon } from './workspace-icon'

test('workspace icon paints themed glyphs with primary foreground', () => {
  const html = renderToStaticMarkup(
    <WorkspaceIcon
      icon={{ type: 'glyph', value: 'rocket', background: 'theme' }}
      workspaceType="meta"
      workspaceTheme={{ font: 'sans', color: 'rose', radius: 'soft' }}
    />
  )

  expect(html).toContain(`background-color:${COLOR_THEMES.rose.primary}`)
  expect(html).toContain(
    `color:${deriveThemeColors(COLOR_THEMES.rose.primary ?? DEFAULT_PRIMARY_COLOR).primaryForeground}`
  )
  expect(html).toContain('<svg')
})

test('workspace icon uses the name initial when no icon is set', () => {
  const html = renderToStaticMarkup(
    <WorkspaceIcon
      name="atlas"
      workspaceType="meta"
      workspaceTheme={{ font: 'sans', color: 'rose', radius: 'soft' }}
    />
  )

  expect(html).toContain('>A<')
  expect(html).not.toContain('<img')
  expect(html).toContain(`background-color:${COLOR_THEMES.rose.primary}`)
})

test('workspace icon renders uploads and provider fallbacks as images', () => {
  const upload = renderToStaticMarkup(
    <WorkspaceIcon
      icon={{ type: 'upload', value: 'data:image/webp;base64,upload' }}
      workspaceType="meta"
    />
  )
  const provider = renderToStaticMarkup(<WorkspaceIcon workspaceType="meta" />)

  expect(upload).toContain('src="data:image/webp;base64,upload"')
  expect(provider).toContain(`src="${workspaceProviderIcon.meta}"`)
})

test('renders a chosen glyph or emoji without falling back to the provider image', () => {
  const glyph = renderToStaticMarkup(
    <WorkspaceIcon workspaceType="meta" icon={{ type: 'glyph', value: 'leaf' }} />
  )
  const emoji = renderToStaticMarkup(
    <WorkspaceIcon workspaceType="meta" icon={{ type: 'emoji', value: '💡' }} />
  )

  expect(glyph).toContain('<svg')
  expect(glyph).not.toContain('<img')
  expect(emoji).toContain('💡')
  expect(emoji).not.toContain('<img')
})

test('workspace icon scopes the default primary instead of inheriting another workspace', () => {
  const html = renderToStaticMarkup(
    <WorkspaceIcon icon={{ type: 'glyph', value: 'rocket', background: 'theme' }} />
  )

  expect(html).toContain(`background-color:${DEFAULT_PRIMARY_COLOR}`)
})
