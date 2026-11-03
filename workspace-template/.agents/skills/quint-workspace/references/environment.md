# Environment and secrets

Each workspace has an effective env: keys from the project's `.env` / `.env.local` (when
inheritance is enabled in settings) plus **custom secrets** the user manages in the workspace env
settings. Quint injects this env into:

- applet server functions — read it as `process.env` inside `.server.ts`
- any command run via `quint env exec -- <cmd>`
- commands launched through an agent shell may inherit it; use `quint env exec` when a command
  needs the current workspace values.

Rules:

- **Check before you assume.** Only when a task needs a key or token — an API pull, a widget calling a
  service — run `quint env` first. It lists key names with their source (`.env` / custom) and flags
  declared `requiredEnv` keys that are missing. Values are never shown.
- **Key present** → proceed without asking the user for it. To run a script or one-off command with the workspace env, use
  `quint env exec -- bun script.ts` — it also picks up values changed after your session started.
- **Key missing** → never invent or hardcode a value, and don't edit `.env` yourself. Tell the user
  the exact key name to add in the workspace env settings when it is actually needed. Still build and wire the applet: declare
  the key in `config.requiredEnv` and handle its absence, so it works the moment the user sets it.
  If the user explicitly asks to store a supplied value, `quint env set KEY` accepts it on stdin;
  `quint env unset KEY` removes it.
- **Never print secret values** — not in chat, not in logs. Refer to keys by name only.

Use `quint env exec -- <command> [args...]` for an arbitrary script or tool that needs the effective
workspace env. The `--` separator is required, and the env is resolved again on every invocation,
so this also sees values added or changed during the chat.

```sh
quint env exec -- bun script.ts
quint env exec -- bun test integration.test.ts
```

Use `quint call-server-fn` instead when exercising an exported applet server function through its
real runtime path.

`process.env` is readable **only** inside `.server.ts` (the `.tsx` runs in the browser) — keep API
keys there. Either source may be absent, so always handle a missing key. List expected keys in
`config.requiredEnv` — advisory only (it surfaces a hint in the UI and `quint env`; it's never
enforced).

```ts
// forecast.server.ts
export async function getForecast(city: string) {
  const key = process.env.WEATHER_API_KEY // always current — env changes respawn the worker
  if (!key) return { error: 'Add WEATHER_API_KEY to your env' }
  const res = await fetch(`https://api.example.com/forecast?city=${encodeURIComponent(city)}`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) return { error: `Weather API error ${res.status}` }
  return { data: await res.json() }
}
```

