---
title: WebSocket binding
description: URL, framing, subprotocol, origin enforcement, and reconnection rules for the WebSocket transport binding.
related:
  - protocol/transport
  - protocol/transport-bindings/uds
  - protocol/handshake
  - protocol/wire-format
  - sdk/typescript/server
  - sdk/typescript/web
---

The WebSocket binding is the default Tesseron transport. Browser apps use it via the `@tesseron/vite` plugin, Node apps via `@tesseron/server`'s `NodeWebSocketServerTransport`. The MCP gateway dials with the `tesseron-gateway` subprotocol.

This page is the wire spec for that binding. The [transport overview](/protocol/transport/) covers the binding-neutral contract - reliable, ordered, single-connection-per-session, etc. - that this binding satisfies.

## Manifest discriminant

```jsonc
{
  "version": 2,
  "instanceId": "inst-...",
  "appName": "...",
  "addedAt": 1777038462692,
  "transport": { "kind": "ws", "url": "ws://127.0.0.1:64872/" }
}
```

The `url` is what the gateway dials. Apps **MUST** bind to loopback (`127.0.0.1` or `::1`) - the threat model assumes same-host-same-user access.

## Framing

- One JSON-RPC envelope per WebSocket text frame.
- `JSON.stringify` on send, `JSON.parse` on receive.
- Binary frames are coerced to UTF-8 text and parsed anyway (defensive — gateway compatibility with non-conforming relays).
- No fragmentation, no batching, no compression.

## Subprotocol handshake

The gateway sends `Sec-WebSocket-Protocol: tesseron-gateway` on its upgrade request. Apps that host a Tesseron WS server **MUST** advertise this subprotocol in their handshake response and **MUST** reject upgrade requests that don't carry it - the app's WebSocket endpoint is only for the gateway, not for arbitrary clients.

The Vite plugin is the documented exception: it accepts plain (no-subprotocol) connections from the browser tab AND a separate `tesseron-gateway` connection from the gateway, and bridges them.

## Bind subprotocol (host-minted claims)

When the app minted its own claim code (`helloHandledByHost: true` in the manifest — see [Host-minted claims](/protocol/handshake/#host-minted-claims-and-the-bind-handshake)), the gateway carries a second subprotocol element on the upgrade:

```http
Sec-WebSocket-Protocol: tesseron-gateway, tesseron-bind.7Q4K-M2
```

The code element is `tesseron-bind.` followed by the claim code, which must match `[A-Za-z0-9_-]{1,64}`. A request carrying **more than one** `tesseron-bind.` element is rejected outright: two codes in one header is a header-injection signal, not an ambiguity to resolve.

The host compares the code against its in-memory `hostMintedClaim.code` in constant time and answers on the upgrade, before any WebSocket frame is exchanged:

| Condition | Response | Notes |
|---|---|---|
| No `tesseron-gateway` element | Socket destroyed, no HTTP response | Not a Tesseron dial. |
| Host is in bind lockout | `429 Too Many Requests` | Distinguishable from a mismatch on purpose. |
| Code does not match | `403 Forbidden` | Counts toward the rate limit. |
| Claim already spent (`boundAgent !== null`) | `409 Conflict` | One-shot. Mint a fresh session. |
| A valid bind is already in flight | `409 Conflict` | Closes the concurrent-bind race before `handleUpgrade` attaches. |
| Malformed `tesseron-bind.` element | `400 Bad Request` | Body names the grammar violation. |
| No bind element at all | `426 Upgrade Required` | A pre-1.2 gateway. See below. |
| Valid bind, host already attached | Socket destroyed | Duplicate. |

Only the `426` deserves explanation. A host that minted its own claim has **already** answered the app's `tesseron/hello` with a synthesized welcome. A gateway that auto-dials without binding would produce a second welcome against a hello promise that has already resolved, so the host refuses the upgrade instead of corrupting the session. Hosts that do not set `helloHandledByHost` never reach this path and keep accepting plain `tesseron-gateway` dials.

Mismatches are rate-limited: 5 within a 60-second rolling window trip a 60-second lockout, and a successful bind resets the window.

## Origin enforcement

WS upgrades carry an `Origin` header. The gateway treats whatever the upgrade request advertised as the authoritative origin for the lifetime of the session. SDK-declared `app.origin` values that disagree are overwritten with the upgrade-time value at `tesseron/hello` and `tesseron/resume`.

Apps that want stronger gating can install an `origin allowlist` in their HTTP server before the WS upgrade fires. The reference SDK leaves this to the app.

## Reconnection

Same as the binding-neutral [transport rules](/protocol/transport/#reconnection): close kills the session, the SDK rejects pending requests with `TransportClosedError`, and reconnection is the app's job. Use [`tesseron/resume`](/protocol/resume/) to rejoin a zombified session within its TTL.

## Failure matrix (WS-specific)

| Event | Code observed | Notes |
|---|---|---|
| Gateway shuts down cleanly | `1001 Going Away` | Standard WS close code. |
| Bad subprotocol | Upgrade fails before WS open | Gateway gives up on this manifest until next watcher event. |
| App rejects gateway origin | App's choice — typically 4xx | Any non-101 response means no session. |
| Browser tab close (Vite) | Plugin tears down both sides | Manifest deleted, gateway sees normal `close`. |

## SDK-side reference implementations

- [`@tesseron/server` `NodeWebSocketServerTransport`](/sdk/typescript/server/) - Node apps host a loopback `ws://...` and write `instances/`.
- [`@tesseron/web` `BrowserWebSocketTransport`](/sdk/typescript/web/) - browser apps dial `/@tesseron/ws` (served by `@tesseron/vite`).
- [`@tesseron/vite`](/sdk/typescript/vite/) - dev-server bridge between the browser tab and the gateway.

## Porting another language?

Implement a WS server that:

1. Binds loopback on an OS-picked port (or a pinned port if your runtime requires it).
2. Writes `~/.tesseron/instances/<instanceId>.json` with `{ kind: 'ws', url }`.
3. Accepts exactly one upgrade carrying the `tesseron-gateway` subprotocol; rejects every other upgrade.
4. Serialises outgoing JSON-RPC envelopes as text frames; parses incoming text frames.
5. Deletes its manifest on close.

If you also mint claims host-side, implement the [bind subprotocol](#bind-subprotocol-host-minted-claims) with all eight upgrade outcomes above, constant-time code comparison, and the rate limit. Skipping it while advertising `helloHandledByHost: true` leaves the app unreachable.

The full conformance checklist lives in [Port Tesseron to your language](/sdk/porting/).
