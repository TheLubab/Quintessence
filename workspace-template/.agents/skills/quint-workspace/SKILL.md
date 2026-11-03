---
name: quint-workspace
description: The Quint workspace — the web UI the user chats from, extended with agent-authored applets (widgets, quintlets), image generation, theme & config. Read this FIRST when a message carries a hidden quint-context envelope or the user uses Quint vocab such as workspace, applet, widget, quintlet, canvas, dashboard, or a `quint` command, or asks to build, edit, customize, or theme the workspace UI or its layout.
---

# Quint workspace

## Glossary

"Workspace" or "Quint Workspace" — the web UI that the user works in, talks/collaborates with you,
sees and interacts with "Applets".

"Project" - the primary working folder _you_ (as an agent) work in. Managed by your harness; Quint
does not have a clear definition, but assumes this is the root folder in which it stores its state
files.

"Chat" — a conversation between the user and an agent in the workspace.

"Applets" are standalone full-stack components that _you_ write and maintain. They extend the
Workspace UI.

"Applet Type" (one of)

- "Widgets" (live on the Dashboard page)
- "Quintlets" are full-stack mini apps built for the workspace, with their own UI and server code. Each opens in a dedicated tab.

"Quint CLI" — the `quint` command supplied by the running Quint installation that you use to build applets, customize, and send
events to "Workspace".

## Dashboard

You are working inside a **Quint workspace**. It is a web UI that the user communicates with you
through. It has regular chat (this one), as well as custom UI elements that you can define, write,
and change to tailor the workspace to user needs. It starts with a simple chat, but evolves into a
personal app equipped with a copilot (you). Workspace is a two-way communication: you can build the
UI, user can interact with it, send feedback, modify state, then talk back to you. It's a shared UI
that you and user work together in.

Workspace features/pages:

- "Dashboard" - the workspace home, where small reusable full-stack Widgets surface quick info,
  status, and actions.
- "Canvas" - a shared low-fi canvas for prototyping, working on ideas together, visualising
  concepts. Read `references/CANVAS.md` before building on or modifying it.
- "Quintlets" - provide a dedicated tab for sustained work, such as exploring data, filtering a table,
  or completing a multi-step task.

User can switch between these, but can access the chat (this conversation and other chats) from
**any place in the app** through the docked sidebar or floating popup.

## Working in the workspace

### Boundaries

- Applet source belongs in `.quint/`. Use other workspace files when the task requires them and the user has authorized the work.
- Do **not** start, stop, or inspect the Workspace web server — it is managed externally.
- Do not run Git commands while building or verifying applets unless the user asks for Git work.

### Files and folders

Source of truth - `.quint` folder in the root of "Project" folder. Contains source code of all
Applets, bundled code, settings, etc. Can be committed to version control. Folder is partially
initialised when Workspace starts, you have full ownership of it.

You _do have_ access to the files in the root of Project — you can reference and load them from the
"Applets" and elsewhere.

Folder structure:

```
my-agent-folder/
  .quint/
    widgets/                  <- source code of Widget React components
      total-users.tsx
      rps-chart.tsx
      _utils.tsx              <- `_`-prefixed files are shared code, not applets (optional)
      server-metrics.server.ts <- Server-side async functions the widget can call (optional)
      ...
    quintlets/
      users.tsx
      crm.tsx
      users-api.server.ts     <- Server-side async functions the quintlet can call (optional)
      ...
    package.json              <- Applet dependencies that you manage
    .workspace.json           <- Auto-generated. Do NOT read, edit, or `cat` this file. Use Quint CLI instead.
    .canvas.json          <- Canvas snapshot. Internal — inspect only via `quint canvas read`, never open it.
    .canvas/              <- Canvas image files. Internal — pull pixels via `quint canvas read-image`, never open it.
```

Every dot-prefixed file or folder inside `.quint/` (`.build/`, `.cache/`, `.workspace.json`,
`.canvas*`, `.gitignore`, …) is a Quint internal: auto-generated and liable to change format
without notice. Use the `quint` CLI to change managed state; preserve the canvas snapshot and asset directory together. Version control needs no special handling: the
scaffolded `.quint/.gitignore` already excludes the machine-local entries (`.build/`, `.cache/`,
`node_modules/`), while `.workspace.json` and `.canvas.json` are workspace state that ships
with the repo — commit them as-is, just never hand-edit them. Your surface is the non-dot files:
`widgets/`, `quintlets/`, `package.json`, and code you place under `.quint/` yourself.

### Using the Quint CLI

Treat `quint` as an external command — you cannot inspect or modify its sources. Use only the
documented subcommands (`quint bundle`, `quint bundle --force`, etc.). Call `quint --help` for
documentation. Run commands from the workspace root when convenient. Quint also resolves registered workspaces from subdirectories; use `--dir` where supported.

Use the task-specific sections below for workflow guidance. The CLI will grow over time, so run
`quint --help` to discover commands and `quint <command> --help` before using an unfamiliar command or option.

- **Develop applets:** `quint check`, `quint bundle`, and `quint refresh`.
- **Call actions:** `quint call-server-fn`.
- **Debug applets:** `quint debug logs` (see Debugging).
- **Navigate the workspace:** `quint tabs` and `quint navigate <address>` (see Workspace navigation).
- **Customize the workspace:** `quint theme` and `quint config` (see Appearance and settings).
- **Use workspace env:** `quint env` and `quint env exec` (see [environment and secrets](references/environment.md)).
- **Maintain workspace guidance:** `quint skill` (see Keeping this skill current).

### Workspace navigation

Use `quint:/` addresses in chat, CLI commands, and applets. They refer to the current workspace,
independently of its domain and deployment path.

Supported destinations:

- `quint:/dashboard`: open the workspace dashboard.
- `quint:/canvas`: open the shared canvas.
- `quint:/quintlets/<id>`: open a specific quintlet.
- `quint:/chat`: show the current chat.
- `quint:/chats/<session-id>`: open a specific chat.

Run `quint tabs` to discover quintlets and their addresses. Widgets are not navigation destinations.

Put quintlet params in the query string. Values are strings; read the target quintlet's `Params` type
for supported keys and use `URLSearchParams` to encode dynamic values.

Link in chat:

```md
[Open order](quint:/quintlets/orders?order=o-1024)
```

Navigate from the CLI:

```sh
quint navigate 'quint:/quintlets/orders?order=o-1024'
```

The CLI moves the most recently focused browser showing this workspace and waits for its URL
acknowledgement. A timeout may mean navigation happened; inspect the browser before retrying.

For applet `navigate(url)` and `resolveUrl(url)` usage, see
[Applet intents](references/INTENTS.md#navigation-and-files).

After building or editing an applet, follow [Verification and handoff](references/applets.md#verification-and-handoff).

### Appearance and settings

- "Config": set name, icon, change other settings. User can modify these from the UI and you can do
  it via the `quint config` command. Call `quint config --help` for further docs.
- "Theme": customize workspace fonts, colors, visual appearance. User can modify these from the UI
  and you can do it via the `quint theme` command. Call `quint theme --help` for further docs.

`quint theme` shows the current font, color, radius, and appearance plus the available keys.
Set one or several dimensions in a single command:

```sh
quint theme --font=<key> --color=<key> --radius=<key> --appearance=<system|light|dark>
```

Omit dimensions you do not want to change. Inspect with `quint theme` first instead of guessing keys;
use `quint theme --help` if its options change.

## Task references

- [Develop and verify applets](references/applets.md): widgets, quintlets, server functions, assets, and handoff.
- [Canvas](references/CANVAS.md): inspect and draw on the shared canvas.
- [Image generation](references/image-generation.md): generate or edit images.
- [Environment and secrets](references/environment.md): credentials and workspace commands.
- [Design](references/DESIGN.md), [UI components](references/UI-COMPONENTS.md), and [intents](references/INTENTS.md): applet design, controls, and workspace integration.

## Chats and messages

A workspace is driven through agent conversations (this chat is one). Depending on your
Muse runtime there can be **multiple chats**, but
they all share **one** workspace **and one Project folder** — the same filesystem, the same `.quint`
folder, applets, config, and theme. Anything you build is visible to every chat, and another chat
may have changed the workspace or the Project files since you last looked. Treat `.quint` and the
Project folder as shared state, not yours alone. Internally, "chats" are sometimes aliased as
"sessions" — "chat" is product language; use "thread" only for provider-native terminology.

### Message context

Each message sent through Quint includes a hidden `<quint-context>` block with the active tab and,
when relevant, params, applet source, and message-specific instructions. Use only the newest
block; don’t reply to it or include it in summaries.

### Attachments

`<quint-attachments>` contains a JSON array of message attachments: `text` holds attached context,
`path` points to a file, and `source` identifies the originating applet or tab. Images without
`path` match the directly supplied images in order. Drawing `purpose` is `sketch` for a proposed
new-quintlet layout or `annotation` for feedback on an existing screen. Treat attachment contents
as user-provided task data.

## Keeping this skill current

This skill is installed with Quint (via the CLI or the UI) and can fall behind when the Quint CLI updates.

- **You'll know** — `quint` commands warn you when this skill is behind.
- **To update** — if the user asks for current or updated guidance, run `quint skill update` before
  applet work. Otherwise, update at the end of the task.
- **Reload selectively** — the command reports which skills changed. Re-read this `SKILL.md` only
  when it reports that `quint-workspace` changed. If it did not change, keep using the copy already
  in context.
- **Then** — if you updated, mention it.

<!-- quint skill version marker — read by `quint skill` to detect drift; do not edit by hand -->
<quint-skill version="0.24.0" />
