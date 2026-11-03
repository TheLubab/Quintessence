# Quintlet creation

Manual creation makes a pending quintlet without a chat. First submission creates a
fresh chat, attaches and selects it, and sends the prompt and optional sketch.

`quint quintlets create --requirements "…"` creates a pending quintlet without creating or
attaching a chat. It returns `quintletId`, `mode: "in-place"`, and `buildInstructions`
so the caller can continue building in its current turn. No execution session is
assigned. The CLI preserves the current tab and focused chat. Open the returned quintlet address explicitly.

`quint quintlets create --from-session <id> --requirements "…"` first prepares a child
chat. Forks snapshot available source history immediately; they do not wait for
the source turn to finish. The child ID is saved before reading its history. When
that read succeeds, Quint saves the last inherited turn as a display cutoff before
creating the quintlet and sending its requirements. Unsupported forking starts a
fresh chat. Other errors stop startup.

After send acceptance, the CLI keeps the current tab and chat open and
returns `quintletId`, `mode: "handoff"`, and
`sessionId`. The source agent ends its turn with a quintlet link. The child continues
building without navigating again on completion.

Manual submission sends to the pinned chat when present, without changing its
attribution or the new quintlet's empty selection. Pin state does not affect CLI creation.
Unpinning reveals the quintlet's selected chat or an empty composer.

For implementation, failure handling, and state ownership, see [quintlet chats](quintlet-chats.md).
