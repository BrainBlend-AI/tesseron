---
'@tesseron/mcp': minor
'@tesseron/core': minor
'@tesseron/server': minor
'@tesseron/vite': minor
---

Complete the tesseron#60 claim-mediated transport binding by extending the host-mint flow to every host shape and tightening the security model:

**`@tesseron/server` host-mint mirror.** `NodeWebSocketServerTransport` and `UnixSocketServerTransport` now mint `claimCode` / `sessionId` / `resumeToken` at construction, write them into the manifest's `hostMintedClaim`, and intercept the SDK's `tesseron/hello` to synthesize the welcome locally so the SDK can show the host-minted code as soon as `connect()` resolves — no waiting for a gateway dial.

**UDS bind handshake.** UDS doesn't have WebSocket subprotocols, so the equivalent of `tesseron-bind.<code>` is the new `tesseron/bind` JSON-RPC request. A v1.2 gateway sends it as the very first NDJSON frame after connect; the host validates the code in constant time and either accepts (bind succeeds, hello replay flows) or returns `Unauthorized` and closes. Same two-gate model as WS: file-mode-based UID enforcement on the socket inode + bind validation.

**Sliding TTL with heartbeat.** Every host-minted claim now carries `expiresAt = mintedAt + 10 minutes`. The host rewrites the manifest every 5 minutes while the SDK is alive and the claim is unbound; the gateway skips manifests whose `expiresAt < now` during scan. A tab forgotten overnight expires its code before someone else can paste it; a live tab's code stays valid forever.

**Bind failure rate-limit.** Hosts track bind-mismatch failures in a 60-second rolling window. After 5 mismatches, the entry is locked out for 60 seconds — every bind upgrade gets HTTP 429 (WS) or `Unauthorized` (UDS) — long enough to make sustained brute force expensive without breaking a legitimate retry loop. Counters reset on a successful bind.

**Legacy auto-dial rejected.** Host transports now require a v1.2-aware gateway. Legacy auto-dials (no bind subprotocol on WS, no `tesseron/bind` on UDS) are rejected with HTTP 426 Upgrade Required and a clear message: upgrade `@tesseron/mcp` to >= 2.4.0. The plugin bundle ships in `plugin/server/index.cjs`, so a Claude Code plugin update brings the user along automatically.

**Workspace package layout.** `@tesseron/{core,web,server,react,vite,svelte,vue,mcp}` packages now point `main` / `module` at `dist/` (built output) instead of `src/index.ts` directly. Without this change, Node ESM's `.js` ↔ `.ts` resolution fails when a Vite plugin loads the workspace package as a transitive dep — fixes the Vite dev-server demo's previously-broken plugin-load. The `types` field still points at `src/index.ts` so editor go-to-definition keeps working.

**Validation parity.** `validateAppId` moved to `@tesseron/core/internal` so the host transports re-apply the same rejection logic the gateway has on its hello handler. The SDK's `connect()` now rejects with `"Invalid app id"` / `"... is reserved"` at hello synthesis time rather than after a successful welcome that the gateway would have refused.

**`tesseron/claimed.agentCapabilities`.** The notification carries the gateway's authoritative sampling/elicitation bits so the SDK can overwrite the host's conservative pre-claim defaults. Action handlers gating on `ctx.agentCapabilities.sampling` see real values rather than the synthesized `false`s.

**Tests:** new `packages/mcp/test/server-host-mint.test.ts` exercises the full ServerTesseronClient ↔ gateway round-trip with a real bind. Existing tests updated to use `dialSdk`'s v3 path. Three legacy-only breadcrumb tests skipped pending a hand-rolled legacy SDK fixture; the breadcrumb code stays in the gateway for v1.1 SDK back-compat.

**End-to-end validation:** ran the `examples/vanilla-todo` demo in a real browser, scraped the host-minted claim code, drove an MCP gateway (in-process) to `tesseron__claim_session(code)`. The gateway dialed with the bind subprotocol, the v3 hello replay flowed, the session was registered as claimed with the host-minted ids, the MCP tool list refreshed to show all 9 vanilla_todo actions, and an MCP-invoked `addTodo` round-tripped back to the browser DOM. All 6 demo apps (vanilla-todo, react-todo, svelte-todo, vue-todo, node-prompts, express-prompts) typecheck and build clean.
