Bun backend. Read [backend structure and storage](README.md) for ownership and module boundaries, and [agent harness](agents/README.md) before changing Muse integration.

- Keep CLI commands, HTTP routes, and WebSocket handlers thin; put behavior in its owning feature.
- Workspace layout belongs to `workspaces/layout.ts`; per-user session state belongs to `workspace-storage/` and `sessions/`.
- Keep worker and skill-template paths valid in both source and portable installs.
- Never import `react`, `react-dom`, or `tldraw` in backend or shared code. The Canvas writer uses `@tldraw/store` and `@tldraw/tlschema`; `test/backend-react-free.test.ts` enforces this.
- Muse Code owns model execution, permissions, and native conversation history. Quint owns the UI and application metadata.
- API tests live in `http/`; unit tests live beside their modules and integration tests in `test/`.
