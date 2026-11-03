# Configuration

Quint starts with defaults and does not require a `.env` file. Muse Code can
authenticate through sign-in or `META_API_KEY`; image generation needs a Meta
Model API key as described in [image generation](image-generation.md#setup).
Set additional environment variables only when the chosen feature needs them.

## Startup settings

Quint reads `config.json` in its [data directory](#data-and-settings). Set
`QUINT_DATA_DIR` before starting Quint to override that directory. Missing files
use defaults; unreadable or invalid JSON produces a warning and uses defaults.
Restart Quint after changing startup settings.

| Setting          | Default             | Environment override     | Behavior                                                                                                                          |
| ---------------- | ------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `demo`           | `false`             | `QUINT_DEMO`             | Disable workspace creation for a public demo. `1`/`true` enables it; `0`/`false` disables it. Other values fall back to the file. |
| `demoInstallUrl` | `https://quint.run` | `QUINT_DEMO_INSTALL_URL` | Installation link shown in demo mode; a nonempty environment value takes precedence.                                              |
| `workspacesDir`  | `~/quint`           | None                     | Directory for workspaces created through the app. The configured value must be an absolute path; relative paths use the default.  |

For example, `config.json` can contain:

```json
{
  "demo": false,
  "workspacesDir": "/absolute/path/to/workspaces"
}
```

The frontend receives `environment: "local"`, `demo`, and `demoInstallUrl` from
`GET /api/config`. `environment` is a server-supplied value, not a configurable
file field. The workspace creation directory stays on the server.

## Data and settings

The default data directory is the platform data location returned by `env-paths`
for `quint` without a suffix. [data-dir.ts](../backend/data-dir.ts) is its owner.
Keep installation binaries, per-installation data, and workspace source separate:

| Data                                      | Owner and location                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Startup settings                          | `DATA_DIR/config.json`, [app-config.ts](../backend/app-config.ts)       |
| App preferences                           | `DATA_DIR/settings.json`, [app-settings.ts](../backend/app-settings.ts) |
| Workspace registry and session metadata   | See [backend storage ownership](../backend/README.md#storage-ownership) |
| Shared workspace layout, theme, and tabs  | `.quint/.workspace.json` inside each workspace                          |
| Browser-specific UI preferences           | [frontend/store/ui.ts](../frontend/store/ui.ts)                         |
| Muse credentials and conversation history | Muse Code, outside Quint's stores                                       |

The app preferences API (`GET`/`PATCH /api/settings`) currently exposes
`autoUpdateSkills`, defaulting to `false`. Use the app or API to change it;
it is separate from startup configuration.

## Workspace environment

Use workspace Settings → Environment or `quint env` to manage workspace
variables. Quint reads `.env` and then `.env.local` from the workspace root when
inheritance is enabled. Custom variables override dotenv values. Metadata is in
`DATA_DIR/workspace-env.json`; custom secret values use the OS keychain when
available or an owner-only `DATA_DIR/workspace-secrets.json` fallback.

The running server owns these stores. CLI environment commands use the control
port, including when an agent runs as an OS user that cannot access Quint's data
directory. That user must use the running server rather than opening the stores.
See [env.ts](../backend/workspaces/env.ts) for resolution and storage behavior.

For Muse runtime variables, see [agent configuration](../backend/agents/README.md#configuration).
Image generation has its own [credential setup](image-generation.md#setup).
Sign-in services capture runtime configuration when installed; reinstall the
service after changing captured variables. Installation and startup commands are
in [installation](distribution.md).
