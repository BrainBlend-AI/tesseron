---
"@tesseron/core": minor
"@tesseron/mcp": minor
"@tesseron/server": minor
"@tesseron/web": minor
---

Add session resume: SDKs can rejoin a previously-claimed session after a
transport drop (tab refresh, network blip, HMR) without going through the
6-character claim-code dance again.

**Protocol** (`@tesseron/core`)

- `WelcomeResult.resumeToken` now carries an opaque, cryptographically-random
  token the caller can stash to rejoin this session later.
- New `tesseron/resume` method with `{ sessionId, resumeToken }` params plus
  the same manifest fields as `tesseron/hello` (a fresh app build may have
  added, removed, or changed actions/resources since last connect).
- New `TesseronErrorCode.ResumeFailed` (`-32011`) covers unknown session,
  expired zombie, unclaimed zombie, and bad-token failures.

**Gateway** (`@tesseron/mcp`)

- New `GatewayOptions.resumeTtlMs` (default 90 s). Closed sessions are
  retained as zombies for this window and can be resumed via
  `tesseron/resume`. Set to `0` to disable resume entirely.
- Constant-time token compare via `crypto.timingSafeEqual` with a length
  pre-check.
- Tokens are one-shot: every successful resume rotates the token.

**SDK** (`@tesseron/core`, `@tesseron/server`, `@tesseron/web`)

- `TesseronClient.connect(transport, options?)` and the URL-string overloads
  on `ServerTesseronClient` / `WebTesseronClient` accept a new optional
  `{ resume: { sessionId, resumeToken } }` argument. When present, the SDK
  sends `tesseron/resume` instead of `tesseron/hello`.
- `ConnectOptions` and `ResumeCredentials` exported from `@tesseron/core`.

**Storage policy**

Storage of the `{ sessionId, resumeToken }` pair is the implementer's
responsibility. The SDK exposes the primitive; apps decide where the token
lives (localStorage, cookie, Electron store, OS keychain, etc). A four-line
recipe for the browser sits in `docs/protocol/resume`; it is intentionally
not a shipped feature of `@tesseron/web`.

Backwards-compatible: older gateways that never populated `resumeToken`
continue to work, and SDKs that don't pass `{ resume }` send `tesseron/hello`
exactly as before.
