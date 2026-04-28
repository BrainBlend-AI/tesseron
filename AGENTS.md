# Tesseron Monorepo

Tesseron is a protocol SDK and MCP gateway that lets any web app expose typed actions to AI agents (Claude, Cursor, etc.) over WebSocket — no browser automation, no scraping, no Playwright.

## How it works
- Client apps register typed actions via an SDK package (`@tesseron/web`, `/react`, `/svelte`, `/vue`, `/server`)
- The MCP gateway (`@tesseron/mcp`) runs locally, discovers registered apps via `~/.tesseron/tabs/`, and exposes their actions as MCP tools
- Reverse-connection architecture: the gateway is a pure WebSocket client — no fixed ports, no env vars required

## Packages (`packages/`)
- `core` — protocol types, action builder (zero deps)
- `web` — browser SDK
- `server` — Node SDK
- `react` / `svelte` / `vue` — framework adapters (hooks/runes/composables)
- `vite` — Vite plugin, bridges browser tabs to the gateway in dev
- `mcp` — MCP gateway CLI
- `docs-mcp` — Tesseron docs as an MCP server
- `create-tesseron` — project scaffolder (`npm create tesseron@latest`)

## Development
- Package manager: pnpm (workspace) + Turbo
- `pnpm install` — install deps
- `pnpm build` — build all packages (tsup, Turbo-orchestrated; `^build` must run before tests)
- `pnpm typecheck` — TypeScript check across all packages
- `pnpm test` — Vitest (65 tests across core + mcp)
- `pnpm lint` — Biome linter
- `pnpm format` — Biome formatter
- `pnpm build:plugin` — rebuild `plugin/server/index.cjs` after gateway changes

## Conventions
- TypeScript 5.7, Node 20+
- Biome for lint + format: 2-space indent, line-width 100, single quotes, trailing commas, semicolons
- Zod-style action schemas for all typed actions (`z.object({...})`)
- No browser automation — typed actions via SDK only
- Branch: `main`

## Plugin (`plugin/`)
Distributable AI coding assistant plugin. Contains skills (`framework`, `tesseron-dev`, `tesseron-docs`), subagents (`tesseron-explorer`, `tesseron-reviewer`), and a pre-built MCP server binary (`plugin/server/index.cjs`). Rebuild with `pnpm build:plugin` after gateway changes.
