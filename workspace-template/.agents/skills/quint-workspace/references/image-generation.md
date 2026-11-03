# Image generation

When the user asks to generate or edit a photo, illustration, or artwork, use
`quint image generate "<description>"` or
`quint image edit "<change>" --image images/<previous-file>.png`.
These call Meta Muse Image and save a new PNG in the workspace's `images/` folder.
Editing preserves the original. Paths passed to `--image` are relative to the workspace root.
Use SVG for vector graphics or when requested, rather than as a substitute for image generation.

On success, include the returned `markdown` in your reply so the image appears inline in chat.
Use the returned `file` in Quintlets, or run `quint canvas add image <file>` when the user asks
to place the image on Canvas. No new app or tab is needed.

On failure, explain the command's error and its next step. Missing credentials need a Meta Model
API key in workspace Settings → Environment as `MODEL_API_KEY` (`META_API_KEY` also works).
Do not ask the user to paste a key into chat, extract Muse Code login tokens, retry paid requests
automatically, claim an image was generated, or silently substitute SVG or a drawing.

