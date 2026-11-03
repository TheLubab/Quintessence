# Development

Use `nix develop` for the development environment. Install dependencies with `bun install --frozen-lockfile`, then run `bun run dev`.

No `.env` file or API key is required to start Quint. Sign in to Muse Code when
using chat, or configure `META_API_KEY` if using API-key authentication. Image
generation has a separate [credential requirement](image-generation.md#setup).
The Nix shell provides Bun and Muse Code; its `MUSE_BIN` points at that Muse
binary. See [configuration](config.md) for optional settings.

## Dev mode

Use the Bun version provided by the Nix flake, keeping it aligned with `package.json`'s `packageManager` field.

`bun run dev` starts a small supervisor that runs the server **without `bun --hot`**:

- **Frontend (`frontend/`)** — changes refresh components or reload the page automatically. No server restart needed.
- **Backend (`backend/`, `shared/`)** — the supervisor watches these and does a **full process restart** on change (graceful `SIGTERM` → close servers, kill function workers, respawn). Module state is rebuilt cleanly each time.

Do **not** use `bun --hot backend/web.ts`; it can leave the browser serving stale frontend bundles. `quint start --dev` uses the same supervisor as `bun run dev`.

Only one server runs at a time — it binds port 12345 (HTTP) and 12346 (control). To restart, kill the existing `bun run dev` process and start it again; a second instance fails on the control port.
