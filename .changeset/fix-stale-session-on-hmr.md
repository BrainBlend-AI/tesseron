---
'@tesseron/core': patch
'@tesseron/mcp': patch
'@tesseron/server': patch
'@tesseron/web': patch
'@tesseron/react': patch
'@tesseron/svelte': patch
'@tesseron/vue': patch
---

Fix `tesseron__read_resource` (and `__invoke_action`) hanging indefinitely
after an HMR-driven reconnect.

Two interlocking bugs:

1. `TesseronClient.connect()` swapped in a new transport without closing the
   previous one, so the old `WebSocket` lingered as a phantom claimed
   session on the gateway side. `connect()` now closes any previously-
   attached transport before swapping, and the per-transport `onClose`
   handler guards against a late close from the prior transport trampling
   the new dispatcher / welcome.
2. `McpAgentBridge` resolved sessions by `Map`-iteration order, so when the
   user reclaimed via a fresh socket the bridge still routed reads and
   action invocations to the older — and now dead — session. The lookup
   now picks the most-recently-claimed session matching the `app.id`.

Closes #40.
