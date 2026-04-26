---
'@tesseron/core': patch
'@tesseron/mcp': patch
'@tesseron/vite': patch
---

Fix silent hangs when a transport send fails mid-request. Three places used to swallow `transport.send` failures with no signal: the gateway's session-dispatcher wrapper (bare `catch {}`), the SDK client's session-dispatcher wrapper (no try/catch at all), and the Vite plugin's gateway-to-browser bridge (silently dropped frames when `browserWs.readyState !== OPEN`). When a response failed to send, the peer's pending request would wait forever - the user-visible symptom was `tesseron__read_resource` hanging indefinitely after a Vite HMR cycle that left the browser WebSocket in a non-OPEN state.

All three paths now close the channel on send failure so the peer's `transport.onClose` handler fires, `rejectAllPending` rejects every outstanding request with `TransportClosedError`, and the bridge / MCP tool surfaces a real error instead of hanging. Also reverts the 30s `DEFAULT_RESOURCE_READ_TIMEOUT_MS` band-aid added in #47 - it would have papered over genuine hangs by silently failing legitimate slow reads, and the cascade-on-send-failure fix is what actually addresses the root cause.

`JsonRpcDispatcher.receive()` no longer leaves `handleRequest` rejections as unhandled promise rejections - the transport wrappers now handle the recovery, so we attach an empty `.catch` to suppress noise.
