---
'@tesseron/mcp': minor
'@tesseron/core': minor
'@tesseron/server': minor
'@tesseron/vite': minor
---

Claim-mediated transport binding (tesseron#60). The MCP gateway no longer races other gateways to dial a freshly-opened browser tab and mint the user-pasteable claim code in whichever it wins. Instead the SDK host (Vite plugin / `@tesseron/server`) mints the code itself and writes it into the instance manifest; the gateway only dials when the user's `tesseron__claim_session(code)` call matches a host-minted manifest, and authenticates the dial via a `tesseron-bind.<code>` WebSocket subprotocol element.

**Why.** With one Claude Code session per gateway process, several gateways often watch `~/.tesseron/instances/` simultaneously. The first to dial a new manifest won the bridge, but on multi-session boxes the OS scheduler picked which gateway saw the welcome — and the user-typed code was usable only in that one Claude window. The single-owner-binding fix from #54 made the race deterministic; this PR makes it irrelevant. The user pastes the code into whichever Claude session they're working in; that gateway scans manifests for a match and dials only the right one. No race, no "switch to the Claude that minted this" detour.

**Wire shape.**
- `InstanceManifest` (still `version: 2`) gains two optional fields: `helloHandledByHost: true` and `hostMintedClaim: { code, sessionId, mintedAt, boundAgent }`. v1.1 gateways ignore the new fields and still auto-dial — no regression for old gateways paired with new hosts.
- New WebSocket subprotocol element `tesseron-bind.<code>` carries the host-minted claim code on the gateway's outbound dial, alongside the existing `tesseron-gateway` element. Subprotocol headers don't appear in URL logs, browser history, or crash dumps the way `?claim=CODE` query strings would.
- Constant-time compare (PR #62's `constantTimeEqual`) gates the bind validation in the host's upgrade handler.
- The gateway's welcome to a v3-mode dial omits `claimCode` — the host's synthesized welcome already showed it; repeating would race the SDK's UI.

**`gateway.claimSession()` is now async.** Returns `Promise<Session | null>` rather than `Session | null`. The legacy `pendingClaims` lookup happens first (synchronous in practice), then the host-minted scan dials and waits for the session to register. The `@tesseron/mcp` bridge is the only public caller; embedders calling the method directly need to add `await`.

**Migration matrix.**
- old plugin / old gateway → unchanged
- new plugin / old gateway → old gateway ignores host-mint fields, auto-dials, mints its own code, host's hello goes through unmodified
- old plugin / new gateway → no host-mint fields in manifest, gateway auto-dials as legacy
- new plugin / new gateway → host mints, gateway scans on claim, dials with bind subprotocol, session is born claimed

**Out of scope (follow-up issues).**
- TTL refresh on heartbeat (the host's mint lives until manifest unlink today; a stale code can be claimed if the browser tab outlives the user's intent).
- Rate-limit on bind failures (the constant-time grammar guard plus the 6-char alphabet make brute force expensive but unbounded).
- `@tesseron/server` host-mint mirror — server transports still use the legacy auto-dial path. Tracked separately.
- UDS bind subprotocol equivalent. Tracked separately.

New `@tesseron/core` exports under `/internal`: `formatBindSubprotocol`, `parseBindSubprotocol`, `BIND_SUBPROTOCOL_PREFIX`. `InstanceManifest` and `HostMintedClaim` types extended.
