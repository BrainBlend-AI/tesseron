---
inclusion: always
---

Tesseron monorepo — TypeScript SDK + MCP gateway for typed web-app actions over WebSocket (no browser automation).

## Packages (packages/)
- `core` — protocol types, action builder (zero deps)
- `web` / `server` — browser and Node SDKs
- `react` / `svelte` / `vue` — framework adapters
- `vite` — Vite plugin (dev bridge)
- `mcp` — MCP gateway CLI
- `docs-mcp` — docs as MCP server
- `create-tesseron` — scaffolder

## Development (pnpm + Turbo)
- `pnpm install` — install deps
- `pnpm build` — build all packages (tsup; run before tests)
- `pnpm typecheck` — TypeScript check
- `pnpm test` — Vitest
- `pnpm lint` — Biome linter
- `pnpm format` — Biome formatter
- `pnpm build:plugin` — rebuild plugin/server/index.cjs

## Conventions
- TypeScript 5.7, Node 20+
- Biome: 2-space indent, line-width 100, single quotes, trailing commas
- Typed actions only — no browser automation
- Branch: `main`
