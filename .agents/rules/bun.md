---
description: Use Bun in the Nix development environment.
globs: '*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json'
alwaysApply: false
---

- Run development commands and checks inside `nix develop`; use the flake for release builds.
- Use Bun for package management, tests, and project scripts; use the existing Bun APIs and Hono server.
- Start development with `bun run dev`; do not run `bun --hot backend/web.ts`.
- Bun loads `.env` automatically. Keep worker environment boundaries and existing secret handling intact.
