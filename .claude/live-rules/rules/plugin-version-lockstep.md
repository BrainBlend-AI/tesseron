---
description: Plugin version moves across eight surfaces at once
globs: ["plugin/**", ".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json", "README.md"]
priority: 60
---
The plugin ships no bundled gateway. `plugin/.mcp.json` reaches `@tesseron/mcp` and
`@tesseron/docs-mcp` through `npx -y <pkg>@<version>`, pinned to the plugin's own version, so a
version that drifts on any one surface ships a plugin that fetches the wrong gateway. Eight places
carry it:

- `plugin/.claude-plugin/plugin.json#version`
- `.claude-plugin/marketplace.json#metadata.version` and `#plugins[0].version`
- `.agents/plugins/marketplace.json#plugins[0].version`
- `plugin/.mcp.json#mcpServers.tesseron.args` and `#mcpServers.tesseron-docs.args`
- every literal `@tesseron/{mcp,docs-mcp}@<semver>` in `README.md` and `plugin/README.md`

Never hand-edit these one at a time. `scripts/sync-plugin-version.mjs` owns them: run
`pnpm sync-plugin-version` to fix drift and `pnpm sync-plugin-version --check` to verify, which is
what CI runs. `pnpm version-packages` chains the sync, so a changesets release keeps them aligned
on its own.

There is no `plugin/server/` directory and no `pnpm build:plugin` script. Don't recreate them.
