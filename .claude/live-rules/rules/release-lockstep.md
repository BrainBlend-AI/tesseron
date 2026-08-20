---
description: Nine packages release as one fixed version
globs: ["packages/*/package.json", ".changeset/**"]
prompt: ["release", "publish", "changeset", "version bump", "ship it"]
priority: 60
---
`.changeset/config.json` puts `@tesseron/core`, `/web`, `/server`, `/react`, `/mcp`, `/docs-mcp`,
`/svelte`, `/vue`, and `/vite` in one `fixed` group. They all carry the same version and bump
together; you can't ship one on its own, and dropping a package from the group is a public API
decision, not a cleanup.

- Any user-visible change under `packages/` needs a changeset: `pnpm changeset`.
- Never hand-edit a `version` field in `packages/*/package.json`. `changeset version` owns it, via
  `pnpm version-packages`, which also runs the plugin version sync and Biome.
- Examples and `@tesseron/docs` are in the changesets `ignore` list. They don't get changesets.
- `.github/workflows/release.yml` publishes through `changesets/action@v1`. Don't publish by hand.
