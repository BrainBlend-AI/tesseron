# Release and the plugin version contract

*Last Updated: 2026-08-20*

Two coupled contracts. Both have a script that owns them. Neither should be edited by hand.

## Nine packages release as one

`.changeset/config.json` puts these in a single `fixed` group, so they share a version and bump
together:

`@tesseron/core`, `/web`, `/server`, `/react`, `/mcp`, `/docs-mcp`, `/svelte`, `/vue`, `/vite`

All at **2.10.1**. You cannot ship one alone, and removing a package from the group is a public API
decision rather than a cleanup.

`ignore` list: `@tesseron/docs` and the six examples. They never get changesets.

Rules:

- Any user-visible change under `packages/` needs `pnpm changeset`.
- **Never hand-edit a `version` field** in `packages/*/package.json`. `changeset version` owns it,
  through `pnpm version-packages`, which also runs the plugin version sync and Biome
  (`package.json:25`).
- `.github/workflows/release.yml` publishes through `changesets/action@v1` with npm trusted
  publishing. Do not publish by hand.

## The plugin version lives in eight places

`plugin/` ships **no bundled gateway**. `plugin/.mcp.json` reaches the published servers through
`npx -y <pkg>@<version>`, pinned to the plugin's own version. Drift on any one surface ships a plugin
that fetches the wrong gateway.

1. `plugin/.claude-plugin/plugin.json#version`
2. `.claude-plugin/marketplace.json#metadata.version`
3. `.claude-plugin/marketplace.json#plugins[0].version`
4. `.agents/plugins/marketplace.json#plugins[0].version`
5. `plugin/.mcp.json#mcpServers.tesseron.args`
6. `plugin/.mcp.json#mcpServers.tesseron-docs.args`
7. every literal `@tesseron/{mcp,docs-mcp}@<semver>` in `README.md`
8. the same in `plugin/README.md`

`scripts/sync-plugin-version.mjs` is the contract. `pnpm sync-plugin-version` fixes drift;
`pnpm sync-plugin-version --check` verifies and is what CI runs (`.github/workflows/ci.yml:40`).

`.claude-plugin/marketplace.json` is the Claude Code listing; `.agents/plugins/marketplace.json` is
the Codex listing for the same plugin source.

**There is no `plugin/server/` directory and no `pnpm build:plugin` script. Do not recreate them.**
The matching `plugin/server/**` entry in `biome.json`'s ignore list has been removed too, so nothing
in the repo still implies that directory exists.

## The docs coupling

`@tesseron/docs-mcp` bakes `docs/src/content/docs/` into `dist/docs-index.json` at build time, and
turbo does **not** invalidate that cache when `docs/` changes. See
[gateway.md](gateway.md#the-build-time-snapshot-and-its-coupling). Stale prose therefore ships to end
users through the published docs server, which is why a public-surface change under `packages/`
requires the matching page update in the same change.
