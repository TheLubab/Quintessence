# Quint

Quint is a local AI workspace for Meta models, built with Bun, React, and Tailwind.
It includes chat, applets, a canvas, and workspace tools. Meta's Muse Code runtime
owns model inference, tool execution, and durable conversation history.

## Install a release

Portable releases include Bun and install Muse Code automatically. Once a stable
GitHub Release is published and the quint.run installer routes are configured:

```sh
curl -fsSL https://quint.run/install.sh | sh
```

On Windows, use PowerShell 5.1 or newer:

```powershell
irm https://quint.run/install.ps1 | iex
```

Open **Quint** from your applications or Start menu after installation. Sign in
to Muse Code when prompted. Nix and developer tools are not required.

See [distribution](docs/distribution.md) for packaging, release publishing,
quint.run setup, updates, rollback, and uninstall.

## Run locally

Use the Nix development shell, which provides Bun and Muse Code.
Authenticate with `muse` or set `META_API_KEY` for an API-key installation.

From this directory:

```sh
nix develop
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:12345`. Create or import a workspace and sign in to Meta
when prompted. The control server uses port `12346`.

Run CLI commands from the development shell with `quint`, or use
`bun backend/cli.ts <command>` directly.

## Configuration

Muse Code owns inference, tools, permissions, and native conversation history. Quint stores workspace and chat metadata separately. See [configuration](docs/config.md) and [Muse Code integration](backend/agents/README.md).

## Development checks

```sh
bun run typecheck
bun run lint
bun run format:check
bun run registry:validate
bun run check:repo
QUINT_SECRET_BACKEND=file bun test
nix build .#release
```

The test suite uses fake runtime boundaries; it does not make paid inference
requests. Live sign-in and a complete tool-using conversation require an
accessible, authenticated Muse installation.

See the [documentation index](docs/README.md) and [testing](TESTING.md).
