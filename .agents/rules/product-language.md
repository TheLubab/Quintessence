---
description: Product language and copy conventions for repo prose and the main app.
alwaysApply: true
---

- Write the product name as `Quint` in all prose and user-facing copy. Preserve lowercase only for technical identifiers and `quint` CLI.
- Use Quintlet for a full-stack mini app inside a workspace; use `quintlet`/`quintlets` in technical identifiers and paths.
- Use sentence case for headings, labels, actions, navigation, and messages.
- Omit trailing periods in labels, tooltips, captions, and short standalone messages, including errors and validation messages. Use normal punctuation for paragraphs and multiple sentences.
- Prefer the product nouns workspace, chat, agent, model, widget, quintlet, connector, session, and run.
- Use agent in UI copy for supported coding tools, such as “Connect an agent”.
- Use harness for internal integration and authentication names, including types, functions, files, API routes, and events: `HarnessLoginState`, `startHarnessLogin`, `/api/harnesses/:type/auth`.
- Use chat for user-facing language and UI concepts.
- Use session for internal identifiers, state, persistence, protocols, and hooks that expose session state.
- Use thread only when matching terminology from an external provider or SDK.
- Apply the same boundary to code names and filenames. Session metadata uses names such as `sessionTitle`, `generateSessionTitle`, and `session-title.ts`. Use `chatTitle` and `chat-title.ts` only for frontend or UI label formatting.
- Translate provider-native thread terminology to session terminology at the adapter boundary. Keep thread naming only in native wire types, RPC methods, and provider-facing variables.
- Name actions precisely, such as `Remove workspace` or `Start new chat`.
- Avoid generic confirmations, hype, “please,” and “successfully.”

- Display the native agent as **Meta** and its runtime as **Muse Code**. Preserve exact model names from the eligible runtime catalog.
