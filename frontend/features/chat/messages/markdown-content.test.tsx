import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'
import { Workspace } from '@/frontend/features/workspace/workspace-context'
import { MarkdownContent } from './markdown-content'

test('chat renders portable links as native workspace hrefs with the deployment base', () => {
  const html = renderToStaticMarkup(
    <Router base="/prefix">
      <Workspace id="abc">
        <MarkdownContent content="[Event](quint:/quintlets/events?eventId=123) [Chat](quint:/chats/chat-1) [Current chat](quint:/chat) [Web](https://example.com/)" />
      </Workspace>
    </Router>
  )
  expect(html).toContain('href="/prefix/workspace/abc/quintlets/events?eventId=123"')
  expect(html).toContain('href="https://example.com/"')
  expect(html).toContain('href="/prefix/workspace/abc/chats/chat-1"')
  expect(html).toContain('href="/prefix/workspace/abc/chat"')
})

test('invalid quint links and executable URLs stay sanitized, including images', () => {
  const html = renderToStaticMarkup(
    <Workspace id="abc">
      <MarkdownContent content="[Invalid](quint://quintlets/events) [Script](javascript:alert) ![Image](quint:/quintlets/events)" />
    </Workspace>
  )
  expect(html).not.toContain('href="quint:')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('src="quint:')
})

test('chat resolves workspace file links and sanitizes invalid file paths', () => {
  const html = renderToStaticMarkup(
    <Workspace id="abc">
      <MarkdownContent content="[Video](quint:/files/clips/a%20b.mp4#t=5) [Invalid](quint:/files/../photo.png)" />
    </Workspace>
  )
  expect(html).toContain('href="/api/workspaces/abc/files/clips/a%20b.mp4#t=5"')
  expect(html).not.toContain('href="quint:')
  expect(html).not.toContain('/files/../')
})

test('generated workspace images render inline while invalid image destinations stay blocked', () => {
  const html = renderToStaticMarkup(
    <Router base="/prefix">
      <Workspace id="abc">
        <MarkdownContent content="![Generated image](quint:/files/images/fox.png) ![Bad path](quint:/files/../secret.png) ![Tab](quint:/quintlets/events)" />
      </Workspace>
    </Router>
  )
  expect(html).toContain('src="/api/workspaces/abc/files/images/fox.png"')
  expect(html).toContain('alt="Generated image"')
  expect(html).not.toContain('/files/../')
  expect(html).not.toContain('src="quint:')
  expect(html).not.toContain('src="/prefix/workspace/abc/quintlets/events"')
})
