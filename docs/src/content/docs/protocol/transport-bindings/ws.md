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

The full conformance checklist lives in [Port Tesseron to your language](/sdk/porting/).
