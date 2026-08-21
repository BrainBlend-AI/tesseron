---
'@tesseron/mcp': patch
---

Move `@tesseron/server` from `dependencies` to `devDependencies`. The gateway's
`src/` never imports it (only the tests do), so it was pulling an extra package
into every consumer's install tree for nothing.
