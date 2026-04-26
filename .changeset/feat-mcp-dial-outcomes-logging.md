---
'@tesseron/mcp': patch
---

Discovery and dial outcomes (connect success, connect failure, stale-manifest tombstone) now reach the connected MCP client via `notifications/message` (`logger: "tesseron.discovery"`). A developer running Claude Code sees these inline rather than having to grep `~/.claude/` for the gateway's stderr stream. Stderr still receives the same lines for grep-ability — the new channel is additive.

Closes the last open thread on tesseron#53 — concern (4) called for "plumbing dial outcomes through the MCP `sendLoggingMessage` channel"; this PR ships exactly that. The bridge now declares the `logging` server capability (which a previous version omitted, silently no-op'ing all `sendLoggingMessage` calls). `TesseronGateway` exposes a `'gateway-log'` event and a `GatewayLogEvent` type so embedders that don't use the bundled `McpAgentBridge` can wire the same forwarding into their own MCP server.
