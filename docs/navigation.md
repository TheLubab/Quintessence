# Workspace navigation

The idea is to give the whole workspace one way to say “open this, showing this state.”

Quint links point to places in the current workspace:
`quint:/quintlets/events?eventId=123` becomes `/workspace/<id>/quintlets/events?eventId=123`.
Quint fills in the workspace ID and server address. Use `quint:/` with one slash.

The browser URL sets the open tab and passes values to quintlets. The app and `quint.resolveUrl`
use the same resolver in `shared/navigation.ts` for workspace links, files, and web addresses.

Where links are used:

- Widgets and quintlets: `resolveUrl()` for links, `navigate()` for button actions.
- Chat messages: Markdown links, such as `[Open event](quint:/quintlets/events?eventId=123)`.
- Tab bar: return to the last page opened in a tab.
- CLI: `quint tabs` lists links; `quint navigate '<address>'` opens one.
- Browser address bar: copy, bookmark, or open a page URL.

## Link types

- **Built-in tabs:** `quint:/dashboard` and `quint:/canvas` open their respective tabs.
  Query values are not passed to widgets or built-in UI.
- **Quintlets:** `quint:/quintlets/events?eventId=123` opens the `events` quintlet. Query values become
  its component's `params` prop: `{ eventId: '123' }`.
- **Chats:** `quint:/chat` reveals or focuses the current chat, preserving selection and pin.
  `quint:/chats/<session-id>` selects an existing chat and reveals the chat panel. Both use
  the workspace's last opened tab, like a bare workspace URL, and restore its remembered
  quintlet parameters. Query values on chat links are ignored.
- **Files:** `quint:/files/clips/video.mp4` opens a file relative to the workspace root through
  `/api/workspaces/<id>/files/clips/video.mp4`. Query strings and fragments stay on the file URL.
- **Web addresses:** `https://example.com` (or HTTP) opens an ordinary web address.
  Its query values go to that destination.

Missing chats restore the last opened tab without changing selection. Opening a different chat
unpins the current chat.
Share the `quint:/chats/<session-id>` link to identify an exact chat; the resulting address bar URL identifies only its tab.

## Quintlet parameters

The host decodes the query and renders `<Quintlet params={...} />`. Values are strings; the first
value wins for repeated keys. Quintlets parse numbers and booleans themselves. Read selection from
`params` and change it by navigating, so links, reload, and Back restore the same state.

```tsx
import { navigate, resolveUrl } from 'quint'

type Props = { params?: Record<string, string> }

export default function Events({ params = {} }: Props) {
  return (
    <>
      <p>Selected event: {params.eventId ?? 'none'}</p>
      <a href={resolveUrl('quint:/quintlets/events?eventId=123')}>Open event 123</a>
      <button onClick={() => navigate('quint:/quintlets/events')}>Clear selection</button>
    </>
  )
}
```

Widgets receive no `params`. Chat messages carry the active quintlet's non-empty params to the
agent as `activeTab.params` in the Quint context.

Workspace pages add browser history; files and web addresses open in the current browser tab.
Modified clicks, downloads, and explicit link targets retain browser behavior.

A tab click restores its last address from browser memory; an explicit link opens exactly the
state it names. Parked quintlets keep their own params. Reload preserves only the active URL.
Saved layouts store tab paths such as `quintlets/events`, tab order, and the default tab, without query strings.

## Implementation

`backend/workspaces/tabs.ts` builds the tab list and validates destinations.
`backend/navigation-relay.ts` waits for browser acknowledgements, with requests
handled by `backend/control.ts`. The CLI entry modules are
`backend/cli/commands/navigate.ts` and `backend/cli/commands/tabs.ts`.
