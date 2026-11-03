# Image generation

Quint's agent can generate and edit images through Meta Muse Image without a
separate page. The agent invokes the internal CLI, then embeds the saved image
in chat. Files can also be used in Quintlets or added to Canvas.

## Setup

Add a Meta Model API key as `MODEL_API_KEY` in workspace Settings → Environment.
`META_API_KEY` is also accepted. Workspace variables take precedence over the
server environment; within each source, `MODEL_API_KEY` takes precedence.
The key is resolved for each request, so changing it needs no restart.
Muse Code browser sign-in is separate and its login tokens are not read.
The API project must have access to `muse-image-1.0` and available credit/quota.

Existing workspaces receive the updated agent instructions through the normal
workspace skill update (`quint skill update`). The chat context also advertises
the command so existing conversations can discover it.

## Commands

```sh
quint image generate "A watercolor fox in a snowy forest"
quint image edit "Add a red scarf" --image images/<previous-file>.png
```

Run from a registered workspace or its subdirectories. `--dir` selects another
workspace. Reference paths are relative to the workspace root and must be PNG,
JPEG, or WebP files inside it, up to 32 MB. An edit saves a new image and preserves
the original.

Commands print JSON with `file`, `url`, `markdown`, dimensions, and model. The
agent includes `markdown` in its reply to display the image inline. Images are
saved to `images/<uuid>.png` as ordinary workspace files. To place one on Canvas:

```sh
quint canvas add image images/<uuid>.png
```

The server calls Meta's [generation and editing endpoints](https://dev.meta.ai/docs/image-generation)
with one image per request. Credentials stay on the server and are never returned
to chat or the CLI.

## Failures

Missing/invalid keys, denied model access, exhausted quota, rate limits, content
policy blocks, unavailable service, network failures, timeouts, invalid image
responses, and storage failures produce actionable errors and a nonzero CLI exit.
Requests have a three-minute network deadline and are never retried automatically:
a timeout or disconnected response may still correspond to a billable generation.
The agent reports errors rather than silently replacing the image with SVG.
