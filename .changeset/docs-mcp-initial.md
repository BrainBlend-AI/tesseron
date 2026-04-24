---
'@tesseron/docs-mcp': minor
---

Initial release of `@tesseron/docs-mcp`: a stdio MCP server that exposes the Tesseron documentation as three tools (`list_docs`, `search_docs`, `read_doc`) and `tesseron-docs://<slug>` resources. The docs snapshot (37 pages) is bundled in the package at publish time; search runs locally via minisearch BM25. Distribute via `npx @tesseron/docs-mcp`.
